import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameController } from "@/game/createGame";
import { BODIES, HATS, HEADS } from "@/game/catalog";
import { TILE_COUNT } from "@/game/maps/tiles";
import { notify } from "@/lib/game/notify";
import { PxButton, PxInput } from "./hub/ui";
import { BASES, roomMapId } from "@/game/bases/defs";

type Tool = "tile" | "prop" | "npc" | "warp" | "remove" | "maps" | "furniture";
type Layer = "ground" | "decor" | "objects" | "above";
type Tap = { mapId: string; x: number; y: number };
interface Fur { id: string; name: string; w: number; h: number; tiles: number[]; solid: boolean[] }
interface WMap { id: string; name: string; width: number; height: number; spawn_x: number; spawn_y: number }

const COLS = 8;
const ok = (error: { message: string } | null, msg?: string) => { if (error) notify(error.message, "error"); else if (msg) notify(msg); return !error; };

function TileSwatch({ url, id, size = 28 }: { url: string | null; id: number; size?: number }) {
  if (id <= 0 || !url) return <span className="block bg-background/60" style={{ width: size, height: size }} />;
  return <span className="block" style={{ width: size, height: size, imageRendering: "pixelated", backgroundImage: `url(${url})`,
    backgroundSize: `${COLS * size}px auto`, backgroundPosition: `-${(id % COLS) * size}px -${Math.floor(id / COLS) * size}px` }} />;
}

/** Staff world editor. Taps on the map are routed here while it is open; every change is saved and broadcast live. */
export function MapEditor({ ctrl, tapRef, onClose }: { ctrl: () => GameController | null; tapRef: MutableRefObject<((t: Tap) => void) | null>; onClose: () => void }) {
  const [tool, setTool] = useState<Tool>("tile");
  const [layer, setLayer] = useState<Layer>("objects");
  const [tile, setTile] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const [furniture, setFurniture] = useState<Fur[]>([]);
  const [furId, setFurId] = useState<string>("");
  const [maps, setMaps] = useState<WMap[]>([]);
  const [npc, setNpc] = useState({ name: "Guide", body_id: BODIES[0]!.id, head_id: HEADS[0]!.id, hat_id: HATS[0]!.id, dialog: "Welcome to Veya!", dir: "down" });
  const [warp, setWarp] = useState({ to_map: "village", to_x: 61, to_y: 44, twoWay: true });
  const [nm, setNm] = useState({ name: "New room", width: 24, height: 16 });
  const [fb, setFb] = useState<Fur>({ id: "", name: "Table", w: 2, h: 1, tiles: [0, 0], solid: [true, true] });
  const [fbSolidMode, setFbSolidMode] = useState(false);

  const loadFur = () => void supabase.from("world_furniture").select("*").order("created_at").then(({ data }) => setFurniture((data ?? []) as Fur[]));
  const loadMaps = () => void supabase.from("world_maps").select("*").order("created_at").then(({ data }) => setMaps((data ?? []) as WMap[]));
  useEffect(() => {
    setUrl(ctrl()?.tilesetUrl() ?? null); loadFur(); loadMaps();
    ctrl()?.showEditGrid(true);
    const ch = supabase.channel(`editor-ui-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "world_furniture" }, loadFur)
      .on("postgres_changes", { event: "*", schema: "public", table: "world_maps" }, loadMaps).subscribe();
    return () => { void supabase.removeChannel(ch); ctrl()?.showEditGrid(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allMaps = useMemo(() => [
    { id: "village", name: "Veya City" },
    ...BASES.flatMap((base) => base.rooms.map((room) => ({ id: roomMapId(base.id, room.key), name: `${base.name} · ${room.key}` }))),
    ...maps,
  ], [maps]);

  tapRef.current = async (t: Tap) => {
    if (tool === "tile") {
      const { error } = await supabase.from("world_tiles").upsert({ map_id: t.mapId, layer, x: t.x, y: t.y, tile });
      ok(error);
    } else if (tool === "prop") {
      if (!furId) return notify("Pick a furniture first", "error");
      ok((await supabase.from("world_props").insert({ map_id: t.mapId, furniture_id: furId, x: t.x, y: t.y })).error, "Placed");
    } else if (tool === "npc") {
      ok((await supabase.from("world_npcs").insert({ map_id: t.mapId, x: t.x, y: t.y, ...npc })).error, "NPC created");
    } else if (tool === "warp") {
      const a = await supabase.from("world_warps").insert({ map_id: t.mapId, x: t.x, y: t.y, to_map: warp.to_map, to_x: warp.to_x, to_y: warp.to_y });
      if (!ok(a.error)) return;
      if (warp.twoWay) ok((await supabase.from("world_warps").insert({ map_id: warp.to_map, x: warp.to_x, y: warp.to_y + 1, to_map: t.mapId, to_x: t.x, to_y: t.y + 1 })).error);
      notify(warp.twoWay ? "Door created (both ways)" : "Door created");
    } else if (tool === "remove") {
      const ex = ctrl()?.extras(); if (!ex) return;
      const n = ex.npcs.find((r) => r.x === t.x && (r.y === t.y || r.y === t.y + 1));
      if (n) return void ok((await supabase.from("world_npcs").delete().eq("id", n.id)).error, "NPC removed");
      const w = ex.warps.find((r) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h);
      if (w) return void ok((await supabase.from("world_warps").delete().eq("id", w.id)).error, "Door removed");
      const fm = new Map(ex.furniture.map((f) => [f.id, f]));
      const p = ex.props.find((r) => { const f = fm.get(r.furniture_id); return f && t.x >= r.x && t.x < r.x + f.w && t.y >= r.y && t.y < r.y + f.h; });
      if (p) return void ok((await supabase.from("world_props").delete().eq("id", p.id)).error, "Object removed");
      notify("Nothing to remove here", "error");
    }
  };

  const useMyTile = () => { const m = ctrl()?.myTile(); if (m) setWarp({ ...warp, to_map: m.mapId, to_x: m.x, to_y: m.y }); };
  const createMap = async () => {
    const id = `c_${Math.random().toString(36).slice(2, 10)}`;
    const w = Math.max(8, Math.min(200, nm.width)), h = Math.max(8, Math.min(200, nm.height));
    const { error } = await supabase.from("world_maps").insert({ id, name: nm.name.slice(0, 40) || "Room", width: w, height: h, ground_tile: tile, spawn_x: Math.floor(w / 2), spawn_y: Math.floor(h / 2) });
    if (ok(error, "Map created")) setWarp({ ...warp, to_map: id, to_x: Math.floor(w / 2), to_y: Math.floor(h / 2) });
  };
  const resizeFb = (w: number, h: number) => {
    w = Math.max(1, Math.min(6, w)); h = Math.max(1, Math.min(6, h));
    const tiles: number[] = [], solid: boolean[] = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * fb.w + i; const inside = i < fb.w && j < fb.h; tiles.push(inside ? fb.tiles[k]! : 0); solid.push(inside ? fb.solid[k]! : true); }
    setFb({ ...fb, w, h, tiles, solid });
  };
  const saveFb = async () => {
    const row = { name: fb.name.slice(0, 30) || "Object", w: fb.w, h: fb.h, tiles: fb.tiles, solid: fb.solid };
    const { data, error } = fb.id ? await supabase.from("world_furniture").update(row).eq("id", fb.id).select("id").single()
      : await supabase.from("world_furniture").insert(row).select("id").single();
    if (ok(error, "Furniture saved") && data) { setFurId(data.id); setFb({ ...fb, id: data.id }); }
  };

  const tools: [Tool, string][] = [["tile", "Tiles"], ["prop", "Place object"], ["furniture", "Create object"], ["npc", "NPC"], ["warp", "Doors"], ["maps", "Rooms"], ["remove", "Remove"]];
  const palette = (
    <div className="grid max-h-32 grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-0.5 overflow-y-auto">
      {Array.from({ length: TILE_COUNT }, (_, i) => (
        <button key={i} onClick={() => setTile(i)} aria-label={`Tile ${i}`} className={`border-2 ${tile === i ? "border-primary" : "border-transparent"}`}><TileSwatch url={url} id={i} /></button>
      ))}
    </div>
  );
  const sel = "border-2 border-border bg-input px-1 py-1 text-base text-foreground";

  return (
    <div data-editor-panel className="pixel-panel absolute inset-x-2 bottom-2 z-30 flex max-h-[48%] flex-col p-2" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <div className="mb-2 flex items-center gap-1 overflow-x-auto">
        {tools.map(([k, l]) => <PxButton key={k} tone={tool === k ? "primary" : "default"} className="whitespace-nowrap" onClick={() => setTool(k)}>{l}</PxButton>)}
        <PxButton className="ml-auto" onClick={onClose}>Done</PxButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto text-sm">
        {tool === "tile" && (<>
          <div className="mb-1 flex flex-wrap gap-1">
            {(["ground", "decor", "objects", "above"] as Layer[]).map((l) => <PxButton key={l} tone={layer === l ? "primary" : "default"} onClick={() => setLayer(l)}>{l}</PxButton>)}
            <PxButton tone={tile === 0 ? "danger" : "default"} onClick={() => setTile(0)}>Eraser</PxButton>
          </div>
          <p className="mb-1 text-muted-foreground">Tap the map to paint. Walls/water block players; "above" draws over players.</p>
          {palette}
        </>)}
        {tool === "prop" && (<>
          <p className="mb-1 text-muted-foreground">Choose an object, then tap the map (top-left corner).</p>
          <div className="flex flex-wrap gap-1">{furniture.map((f) => (
            <button key={f.id} onClick={() => setFurId(f.id)} className={`flex flex-col items-center border-2 p-1 ${furId === f.id ? "border-primary" : "border-border"}`}>
              <span className="grid" style={{ gridTemplateColumns: `repeat(${f.w}, 14px)` }}>{f.tiles.map((t, i) => <TileSwatch key={i} url={url} id={t} size={14} />)}</span>
              <span className="text-xs">{f.name}</span>
            </button>))}
            {!furniture.length && <span className="text-muted-foreground">No objects yet — make one in "Create object".</span>}
          </div>
        </>)}
        {tool === "furniture" && (<>
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <PxInput value={fb.name} onChange={(e) => setFb({ ...fb, name: e.target.value })} className="w-28" />
            W<PxInput type="number" value={fb.w} onChange={(e) => resizeFb(+e.target.value, fb.h)} className="w-12" />
            H<PxInput type="number" value={fb.h} onChange={(e) => resizeFb(fb.w, +e.target.value)} className="w-12" />
            <PxButton tone={fbSolidMode ? "primary" : "default"} onClick={() => setFbSolidMode(!fbSolidMode)}>{fbSolidMode ? "Marking: blocked parts" : "Painting tiles"}</PxButton>
            <PxButton tone="primary" onClick={() => void saveFb()}>{fb.id ? "Update" : "Save"}</PxButton>
            {fb.id && <PxButton onClick={() => setFb({ ...fb, id: "" })}>As new</PxButton>}
          </div>
          <p className="mb-1 text-muted-foreground">Tap a cell to paint the selected tile. In "blocked parts" mode, red cells block players; the rest can be walked through.</p>
          <div className="mb-2 inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${fb.w}, 30px)` }}>
            {fb.tiles.map((t, i) => (
              <button key={i} className={`relative border-2 ${fb.solid[i] ? "border-destructive" : "border-accent"}`}
                onClick={() => { if (fbSolidMode) { const s = [...fb.solid]; s[i] = !s[i]; setFb({ ...fb, solid: s }); } else { const ts = [...fb.tiles]; ts[i] = tile; setFb({ ...fb, tiles: ts }); } }}>
                <TileSwatch url={url} id={t} size={26} />
              </button>))}
          </div>
          {palette}
          <div className="mt-2 flex flex-wrap gap-1">{furniture.map((f) => (
            <span key={f.id} className="flex items-center gap-1 border-2 border-border px-1">{f.name}
              <PxButton onClick={() => setFb({ ...f })}>Edit</PxButton>
              <PxButton tone="danger" onClick={() => void supabase.from("world_furniture").delete().eq("id", f.id).then(({ error }) => ok(error, "Deleted"))}>×</PxButton>
            </span>))}</div>
        </>)}
        {tool === "npc" && (
          <div className="flex flex-wrap items-center gap-1">
            <PxInput value={npc.name} maxLength={20} onChange={(e) => setNpc({ ...npc, name: e.target.value })} className="w-28" placeholder="Name" />
            <select className={sel} value={npc.body_id} onChange={(e) => setNpc({ ...npc, body_id: e.target.value })}>{BODIES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
            <select className={sel} value={npc.head_id} onChange={(e) => setNpc({ ...npc, head_id: e.target.value })}>{HEADS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
            <select className={sel} value={npc.hat_id} onChange={(e) => setNpc({ ...npc, hat_id: e.target.value })}>{HATS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
            <select className={sel} value={npc.dir} onChange={(e) => setNpc({ ...npc, dir: e.target.value })}>{["down", "up", "left", "right"].map((d) => <option key={d}>{d}</option>)}</select>
            <PxInput value={npc.dialog} maxLength={120} onChange={(e) => setNpc({ ...npc, dialog: e.target.value })} className="w-full" placeholder="What it says when players come close" />
            <p className="text-muted-foreground">Tap the map to place this NPC.</p>
          </div>
        )}
        {tool === "warp" && (
          <div className="flex flex-wrap items-center gap-1">
            Goes to <select className={sel} value={warp.to_map} onChange={(e) => setWarp({ ...warp, to_map: e.target.value })}>{allMaps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            X<PxInput type="number" value={warp.to_x} onChange={(e) => setWarp({ ...warp, to_x: +e.target.value })} className="w-14" />
            Y<PxInput type="number" value={warp.to_y} onChange={(e) => setWarp({ ...warp, to_y: +e.target.value })} className="w-14" />
            <PxButton onClick={useMyTile}>Use my spot</PxButton>
            <PxButton tone={warp.twoWay ? "primary" : "default"} onClick={() => setWarp({ ...warp, twoWay: !warp.twoWay })}>Return door: {warp.twoWay ? "ON" : "OFF"}</PxButton>
            <p className="w-full text-muted-foreground">Tap the map where the door goes. The return door appears one tile below the arrival spot. Blue squares are editor doors.</p>
          </div>
        )}
        {tool === "maps" && (<>
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <PxInput value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} className="w-32" />
            W<PxInput type="number" value={nm.width} onChange={(e) => setNm({ ...nm, width: +e.target.value })} className="w-14" />
            H<PxInput type="number" value={nm.height} onChange={(e) => setNm({ ...nm, height: +e.target.value })} className="w-14" />
            <span className="flex items-center gap-1">Floor <TileSwatch url={url} id={tile} size={22} /></span>
            <PxButton tone="primary" onClick={() => void createMap()}>Create room</PxButton>
          </div>
          <p className="mb-1 text-muted-foreground">The floor uses the tile picked in "Tiles". After creating, use "Doors" to connect it.</p>
          {allMaps.map((m) => (
            <div key={m.id} className="flex items-center gap-1 border-b border-border/60 py-1">
              <span className="flex-1 truncate">{m.name}</span>
              <PxButton onClick={() => { setWarp({ ...warp, to_map: m.id }); setTool("warp"); }}>Connect</PxButton>
              <PxButton tone="primary" onClick={() => { const c = maps.find((x) => x.id === m.id); ctrl()?.goto(m.id, c?.spawn_x ?? 61, c?.spawn_y ?? 44); }}>Go</PxButton>
            </div>
          ))}
        </>)}
        {tool === "remove" && <p className="text-muted-foreground">Tap an NPC, object or door to delete it. Use the Tiles eraser for tiles.</p>}
      </div>
    </div>
  );
}
