import { useEffect, useRef, useState } from "react";
import { BODIES, DEFAULT_LOOK, DIRECTIONS, HATS, HEADS, MELEES, sanitizeUsername, type Direction, type Look } from "@/game/catalog";
import type { ArtKind, ArtLayout } from "@/game/art/layout";
import { deletePlayerArt, listMyArt, savePlayerArt, type PlayerArt } from "@/lib/game/playerArt";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/game/notify";

interface Props {
  look: Look;
  username: string;
  saving: boolean;
  onClose: () => void;
  onSave: (look: Look, username: string) => void;
}

const SCALE = 6;
const SIZE = 40;

function Preview({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dir, setDir] = useState<Direction>("down");
  useEffect(() => {
    let raf = 0, t = 0, last = performance.now();
    let draw: typeof import("@/game/art/layers").drawPreview | null = null;
    void import("@/game/art/layers").then(async (m) => { await m.loadLayerArt(); draw = m.drawPreview; });
    const loop = (now: number) => {
      t += now - last; last = now;
      const ctx = ref.current?.getContext("2d");
      if (ctx && draw) draw(ctx, look, dir, [2, 0, 3, 0][Math.floor(t / 160) % 4] ?? 0, SCALE, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [look, dir]);
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={ref} width={SIZE * SCALE} height={SIZE * SCALE} className="h-48 w-48 bg-muted [image-rendering:pixelated]" />
      <div className="flex gap-1">
        {DIRECTIONS.map((d) => (
          <Button key={d} onClick={() => setDir(d)}
            className={`px-2 py-1 text-xs ${d === dir ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {d}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Row({ title, items, value, onPick }: { title: string; items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Button key={it.id} onClick={() => onPick(it.id)}
            className={`border-2 px-2 py-1 text-sm ${it.id === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground"}`}>
            {it.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

const KINDS: { kind: ArtKind; label: string }[] = [
  { kind: "body", label: "Body" }, { kind: "head", label: "Head" }, { kind: "hat", label: "Hat" }, { kind: "melee", label: "Melee" },
];

/** Upload a PNG/GIF, cut it to the shared character grid, preview it, then save it privately. */
function Uploader({ onDone }: { onDone: (art: PlayerArt) => void }) {
  const [kind, setKind] = useState<ArtKind>("body");
  const [layout, setLayout] = useState<"graal" | "single" | "grid">("graal");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ canvas: HTMLCanvasElement; blob: Blob; frames: number; frameMs: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setResult(null); setError("");
    if (!file) return;
    const real: ArtLayout = kind === "melee" || layout === "single" ? "single" : layout === "grid" ? "grid" : kind === "body" ? "graal-body" : kind === "hat" ? "graal-hat" : "graal-head";
    let live = true;
    void import("@/game/art/normalizeUpload").then((m) => m.normalizeUpload(file, kind, real))
      .then((r) => { if (live) setResult(r); }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [file, kind, layout]);

  useEffect(() => {
    if (!result) return;
    const fh = result.canvas.height / result.frames, fw = result.canvas.width;
    let i = 0;
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const k = Math.min(ctx.canvas.width / fw, ctx.canvas.height / fh);
      ctx.drawImage(result.canvas, 0, (i++ % result.frames) * fh, fw, fh, 0, 0, fw * k, fh * k);
    };
    draw();
    const id = setInterval(draw, result.frameMs);
    return () => clearInterval(id);
  }, [result]);

  const save = async () => {
    if (!file || !result) return;
    setBusy(true); setError("");
    try { onDone(await savePlayerArt(file, result.blob, kind, result.frames, result.frameMs)); setFile(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2 border-2 border-border p-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Upload your own</div>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Button key={k.kind} onClick={() => setKind(k.kind)}
            className={`px-2 py-1 text-xs ${k.kind === kind ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{k.label}</Button>
        ))}
      </div>
      {kind !== "melee" ? (
        <div className="flex flex-wrap gap-1.5">
          {([["graal", "Graal sheet"], ["single", "Single image"], ["grid", "4×4 grid"]] as const).map(([v, l]) => (
            <Button key={v} onClick={() => setLayout(v)}
              className={`px-2 py-1 text-xs ${v === layout ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>{l}</Button>
          ))}
        </div>
      ) : <p className="text-xs text-muted-foreground">Use one weapon image pointing up; it is rotated for every direction.</p>}
      <input type="file" accept="image/png,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full min-w-0 text-sm text-foreground file:mr-2 file:border-2 file:border-border file:bg-secondary file:px-2 file:py-1 file:text-secondary-foreground" />
      {result && (
        <div className="flex flex-wrap items-center gap-3">
          <canvas ref={ref} width={kind === "melee" ? 256 : 128} height={kind === "melee" ? 32 : 192} className="max-w-full bg-muted [image-rendering:pixelated]" />
          <span className="text-xs text-muted-foreground">{result.frames > 1 ? `${result.frames} frames` : "Still image"}</span>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={!result || busy} onClick={save} className="border-2 border-primary bg-primary py-1.5 text-primary-foreground disabled:opacity-50">
        {busy ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}

export function Wardrobe({ look, username, saving, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Look>(look);
  const [name, setName] = useState(username);
  const [mine, setMine] = useState<PlayerArt[]>([]);
  const clean = sanitizeUsername(name);
  const refresh = () => { void listMyArt().then(setMine, () => undefined); };
  useEffect(refresh, []);
  const custom = (kind: ArtKind) => mine.filter((a) => a.kind === kind).map((a) => ({ id: `custom:${a.id}`, label: `★ ${a.name}` }));
  const remove = async (art: PlayerArt) => {
    try { await deletePlayerArt(art); }
    catch (error) { notify(error instanceof Error ? error.message : "Upload could not be deleted.", "error"); return; }
    const key = `${art.kind}_id` as keyof Look;
    if (draft[key] === `custom:${art.id}`) setDraft({ ...draft, [key]: DEFAULT_LOOK[key] });
    refresh();
  };
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-3" onClick={onClose}>
      <div className="pixel-panel max-h-[92dvh] w-full max-w-md overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl text-primary">Wardrobe</h2>
          <Button onClick={onClose} variant="ghost" size="icon" className="text-muted-foreground" aria-label="Close">✕</Button>
        </div>
        <div className="flex flex-col gap-4">
          <Preview look={draft} />
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Name</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)}
              className="w-full border-2 border-border bg-input px-2 py-1.5 text-base text-foreground outline-none focus:border-primary" />
          </label>
          <Row title="Hat" items={[...HATS, ...custom("hat")]} value={draft.hat_id} onPick={(id) => setDraft({ ...draft, hat_id: id })} />
          <Row title="Head" items={[...HEADS, ...custom("head")]} value={draft.head_id} onPick={(id) => setDraft({ ...draft, head_id: id })} />
          <Row title="Body" items={[...BODIES, ...custom("body")]} value={draft.body_id} onPick={(id) => setDraft({ ...draft, body_id: id })} />
          <Row title="Melee" items={[...MELEES, ...custom("melee")]} value={draft.melee_id} onPick={(id) => setDraft({ ...draft, melee_id: id })} />
          <Uploader onDone={(art) => { refresh(); setDraft((d) => ({ ...d, [`${art.kind}_id`]: `custom:${art.id}` })); }} />
          {mine.length > 0 && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">My uploads</div>
              <ul className="flex flex-col gap-1">
                {mine.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 flex-1 break-words">{a.kind} · {a.name}{a.frames > 1 ? " (animated)" : ""}</span>
                    <Button variant="ghost" className="px-2 py-0.5 text-xs text-destructive" onClick={() => void remove(a)}>Delete</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button disabled={saving || clean.length < 2} onClick={() => onSave(draft, clean)}
            className="border-2 border-primary bg-primary py-2 text-lg text-primary-foreground disabled:opacity-50">
            {saving ? "Saving…" : "Save look"}
          </Button>
        </div>
      </div>
    </div>
  );
}
