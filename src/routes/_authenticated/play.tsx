import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Map as MapIcon, Shirt, Shield, LogOut, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isDirection, sanitizeLook, type Look } from "@/game/catalog";
import type { GameController } from "@/game/createGame";
import type { HudState } from "@/game/scenes/WorldScene";
import { Joystick } from "@/components/game/Joystick";
import { Wardrobe } from "@/components/game/Wardrobe";
import { useServerFn } from "@tanstack/react-start";
import { attackPlayer } from "@/lib/game/combat.functions";
import { useGameData } from "@/lib/game/useGameData";
import { onNotify } from "@/lib/game/notify";
import { rpc } from "@/lib/game/api";
import { GameMenu, type MenuTab } from "@/components/game/hub/GameMenu";
import { CombatHud } from "@/components/game/hub/CombatHud";
import type { GangInfo, ZoneStatus } from "@/game/scenes/WorldScene";
import { IconButton } from "@/components/game/hub/IconButton";
import { ProfileCard } from "@/components/game/ProfileCard";
import { WorldMap } from "@/components/game/WorldMap";
import { AdminPanel } from "@/components/game/AdminPanel";
import { useLandscape } from "@/hooks/use-landscape";

const profileQuery = queryOptions({
  queryKey: ["my-profile"],
  staleTime: Infinity,
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const username = (u.user.user_metadata?.["username"] || u.user.email?.split("@")[0] || "player").slice(0, 16);
    const ins = await supabase.from("profiles").insert({ id: u.user.id, username }).select("*").single();
    if (ins.error) throw ins.error;
    return ins.data;
  },
});

export const Route = createFileRoute("/_authenticated/play")({
  head: () => ({
    meta: [
      { title: "Play — Veya World" },
      { name: "description", content: "Explore Veya World with other players in real time." },
      { property: "og:title", content: "Play — Veya World" },
      { property: "og:description", content: "Explore Veya World with other players in real time." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: PlayPage,
});

function PlayPage() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const [hud, setHud] = useState<HudState>({ mapName: "", online: 1, status: "connecting" });
  const [wardrobe, setWardrobe] = useState(false);
  const [saving, setSaving] = useState(false);
  const look = sanitizeLook(profile);
  const d = useGameData(profile.id);
  const attackFn = useServerFn(attackPlayer);
  const [menu, setMenu] = useState<MenuTab | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const gangInfo: GangInfo = { gangId: d.myGang?.id ?? null, tag: d.myGang?.tag ?? null, friendly: d.allies };
  const gangRef = useRef(gangInfo); gangRef.current = gangInfo;
  const hpRef = useRef({ hp: 100, max: 100, prot: 0 });
  const seqRef = useRef<number | null>(null);
  const landscape = useLandscape();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const overlayOpen = !!menu || wardrobe || profileOpen || mapOpen || adminOpen;
  const adminRef = useRef({ a: d.admin, on: d.isAdmin }); adminRef.current = { a: d.admin, on: d.isAdmin };
  const tapRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const getSnapshot = useCallback(() => ctrlRef.current?.snapshot() ?? null, []);

  useEffect(() => onNotify((msg, kind) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }), []);
  useEffect(() => { void rpc("ensure_player").then(() => qc.invalidateQueries({ queryKey: ["g"] })); }, [qc]);

  // Push gang/ally state, base status and own HP into the running game.
  const gangKey = `${gangInfo.gangId}|${gangInfo.tag}|${gangInfo.friendly.join(",")}`;
  useEffect(() => { ctrlRef.current?.setGang(gangRef.current); }, [gangKey]);
  useEffect(() => {
    const z: Record<string, { status: ZoneStatus; friendly: boolean }> = {};
    for (const b of d.bases) z[b.id] = { status: b.status as ZoneStatus, friendly: !!b.owner_gang_id && (b.owner_gang_id === gangRef.current.gangId || gangRef.current.friendly.includes(b.owner_gang_id)) };
    ctrlRef.current?.setZones(z);
  }, [d.bases, gangKey]);
  // Chat bubbles: show new global messages above whoever wrote them.
  useEffect(() => {
    const ch = supabase.channel(`bubbles-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "global_chat_messages" }, (p) => {
        const m = p.new as { user_id: string; body: string };
        ctrlRef.current?.say(m.user_id, m.body);
      }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);
  useEffect(() => { ctrlRef.current?.setAdmin(d.admin, d.isAdmin); }, [d.admin, d.isAdmin]);
  useEffect(() => {
    const c = d.combat; if (!c) return;
    hpRef.current = { hp: c.hp, max: c.max_hp, prot: new Date(c.protected_until).getTime() };
    ctrlRef.current?.setMyHp(c.hp, c.max_hp, hpRef.current.prot);
    if (seqRef.current !== null && c.respawn_seq > seqRef.current && c.respawn_map) {
      ctrlRef.current?.respawn(c.respawn_map, c.respawn_x ?? 0, c.respawn_y ?? 0);
      setToasts((t) => [...t, { id: Date.now(), msg: "You were knocked out — respawned", kind: "error" }]);
    }
    seqRef.current = c.respawn_seq;
  }, [d.combat]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || overlayOpen || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.preventDefault(); void ctrlRef.current?.attack().then((err) => err && setToasts((t) => [...t, { id: Date.now(), msg: err, kind: "error" }]));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts?.load('10px "VT323"').catch(() => undefined);
      const { createGame } = await import("@/game/createGame");
      if (cancelled || !hostRef.current) return;
      const controller = await createGame(hostRef.current, {
        userId: profile.id,
        username: profile.username,
        look,
        mapId: profile.map_id,
        x: profile.pos_x,
        y: profile.pos_y,
        dir: isDirection(profile.facing_direction) ? profile.facing_direction : "down",
        onHud: (h) => setHud((p) => ({ ...p, ...h })),
        gang: gangRef.current,
        myHp: hpRef.current,
        attack: (targetId) => attackFn({ data: { targetId } }),
        admin: adminRef.current.a,
        isAdmin: adminRef.current.on,
      });
      if (cancelled) controller.destroy(); else ctrlRef.current = controller;
    })();
    return () => { cancelled = true; ctrlRef.current?.destroy(); ctrlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const saveLook = async (next: Look, username: string) => {
    setSaving(true);
    const { data, error } = await supabase.from("profiles").update({ ...next, username }).eq("id", profile.id).select("*").single();
    setSaving(false);
    if (error) return;
    qc.setQueryData(profileQuery.queryKey, data);
    ctrlRef.current?.setLook(next, username);
    setWardrobe(false);
  };

  const dot = hud.status === "online" ? "bg-accent" : hud.status === "offline" ? "bg-destructive" : "bg-primary animate-pulse";
  const invites = !d.myGang ? d.invites.length : 0;
  const signOut = () => void supabase.auth.signOut();

  // Tap (not drag) on your own character opens your profile.
  const onDown = (e: React.PointerEvent) => { tapRef.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
  const onUp = (e: React.PointerEvent) => {
    const s = tapRef.current; tapRef.current = null;
    if (!s || s.id !== e.pointerId || overlayOpen) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12 || performance.now() - s.t > 400) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
    if (ctrlRef.current?.hitTestSelf(e.clientX, e.clientY)) setProfileOpen(true);
  };

  const info = (
    <div className="pixel-panel pointer-events-auto px-3 py-1.5 text-sm leading-tight">
      <div className="max-w-40 truncate text-primary">{hud.mapName || "Loading…"}</div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`inline-block h-2 w-2 ${dot}`} />
        {hud.online} online
      </div>
    </div>
  );
  const menuButtons = (
    <>
      <IconButton icon={<MessageSquare />} label="Chat" onClick={() => setMenu("chat")} />
      <IconButton icon={<Shield />} label="Gang" tone="primary" badge={invites} onClick={() => setMenu("gang")} />
      <IconButton icon={<MapIcon />} label="Map" onClick={() => setMapOpen(true)} />
      <IconButton icon={<Shirt />} label="Wardrobe" onClick={() => setWardrobe(true)} />
    </>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-background touch-none select-none" onPointerDownCapture={onDown} onPointerUpCapture={onUp}>
      <div ref={hostRef} className="absolute inset-0" />
      <Joystick />
      {buttonsHidden ? (
        <button onClick={() => setButtonsHidden(false)} aria-label="Show buttons" className="pixel-panel absolute z-10 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"
          style={{ top: "max(8px, env(safe-area-inset-top))", left: "max(8px, env(safe-area-inset-left))" }}><Eye className="h-4 w-4" />Show buttons</button>
      ) : landscape ? (
        <div className="pointer-events-none absolute z-10 grid grid-cols-2 gap-2"
          style={{ top: "max(8px, env(safe-area-inset-top))", left: "max(12px, env(safe-area-inset-left))" }}>{menuButtons}</div>
      ) : (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <div className="min-w-0">{info}</div>
          <div className="flex gap-1.5">
            {menuButtons}
            <IconButton icon={<LogOut />} label="Exit" onClick={signOut} size="sm" />
          </div>
        </div>
      )}
      <CombatHud d={d} mapId={hud.mapId ?? ""} landscape={landscape} hidden={buttonsHidden} info={info} onBag={() => setMenu("bag")}
        onAttack={() => ctrlRef.current?.attack() ?? Promise.resolve(null)} />
      {!buttonsHidden && <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 text-xs text-muted-foreground md:block">WASD / arrows to move · Space to attack · tap yourself for your profile</div>}
      <div className="pointer-events-none absolute left-1/2 top-24 z-40 flex -translate-x-1/2 flex-col items-center gap-1">
        {toasts.map((t) => (
          <div key={t.id} className={`pixel-panel px-3 py-1.5 text-sm ${t.kind === "error" ? "text-destructive" : "text-accent"}`}>{t.msg}</div>
        ))}
      </div>
      {mapOpen && <WorldMap d={d} online={hud.online ?? 1} getSnapshot={getSnapshot} onClose={() => setMapOpen(false)} />}
      {profileOpen && (
        <ProfileCard d={d} look={look} username={profile.username} mapName={hud.mapName ?? ""} landscape={landscape} buttonsHidden={buttonsHidden}
          onClose={() => setProfileOpen(false)} onEdit={() => { setProfileOpen(false); setWardrobe(true); }}
          onBag={() => { setProfileOpen(false); setMenu("bag"); }} onToggleButtons={() => setButtonsHidden((h) => !h)} onExit={signOut}
          onSecret={() => { if (d.isAdmin) { setProfileOpen(false); setAdminOpen(true); } }} />
      )}
      {adminOpen && <AdminPanel fx={d.admin[profile.id]} onClose={() => setAdminOpen(false)} />}
      {menu && <GameMenu d={d} userId={profile.id} initial={menu} onClose={() => setMenu(null)} />}
      {wardrobe && (
        <Wardrobe look={look} username={profile.username} saving={saving} onClose={() => setWardrobe(false)} onSave={saveLook} />
      )}
    </div>
  );
}
