import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOOK, DIRECTIONS, type Direction, type Look } from "@/game/catalog";
import type { ArtKind, ArtLayout } from "@/game/art/layout";
import type { ArtCrop } from "@/lib/game/art-crop";
import { savePlayerArt, type PlayerArt } from "@/lib/game/playerArt";
import { CharacterCanvas } from "./CharacterCanvas";

export function ArtUploadEditor({ look = DEFAULT_LOOK, fixedKind, onDone }: { look?: Look; fixedKind?: ArtKind; onDone: (art: PlayerArt) => void | Promise<void> }) {
  const [kind, setKind] = useState<ArtKind>(fixedKind ?? "hat");
  const [layout, setLayout] = useState<ArtLayout>(fixedKind === "melee" ? "single" : "graal-hat");
  const [file, setFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<ArtCrop>({ x: 0, y: 0, w: 1, h: 1 });
  const [scale, setScale] = useState(1);
  const [columns, setColumns] = useState<3 | 4>(3);
  const [dir, setDir] = useState<Direction>("down");
  const [result, setResult] = useState<Awaited<ReturnType<typeof import("@/game/art/normalizeUpload").normalizeUpload>> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const previewId = useRef(`preview:${crypto.randomUUID()}`).current;
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!file) return;
    let live = true; setReady(false); setResult(null); setError("");
    void import("@/game/art/normalizeUpload").then((m) => m.normalizeUpload(file, kind, kind === "melee" ? "single" : layout, { crop, scale, hatColumns: columns }))
      .then((r) => { if (live) setResult(r); }, (e) => { if (live) setError(e instanceof Error ? e.message : "No se pudo preparar"); });
    return () => { live = false; };
  }, [file, kind, layout, crop, scale, columns]);
  useEffect(() => {
    if (!result) return;
    let live = true, remove: (() => void) | undefined;
    void import("@/game/art/layers").then(async (m) => {
      await m.loadLayerArt(); if (!live) return;
      remove = m.registerPreviewSheet(kind, previewId, result.canvas, result.frames, result.frameMs); setReady(true);
    });
    return () => { live = false; remove?.(); };
  }, [result, kind, previewId]);
  const choose = async (f?: File) => {
    if (!f) return;
    try { const image = await createImageBitmap(f); setCrop({ x: 0, y: 0, w: image.width, h: image.height }); setColumns(image.width < image.height ? 3 : 4); image.close(); setFile(f); }
    catch { setError("No se pudo leer la imagen"); }
  };
  const save = async () => {
    if (!file || !result || !ready) return;
    setBusy(true); setError("");
    try { await onDone(await savePlayerArt(file, result.blob, kind, result.frames, result.frameMs)); setFile(null); setResult(null); setReady(false); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  };
  const input = "min-w-0 w-16 border border-border bg-input p-1 text-foreground";
  return <div className="flex flex-col gap-2 border-t border-border py-3">
    {!fixedKind && <div className="flex flex-wrap gap-1">{([["body", "Body"], ["head", "Head"], ["hat", "Hat"], ["melee", "Espada GIF"]] as const).map(([k, label]) => <Button key={k} variant={kind === k ? "default" : "secondary"} onClick={() => { setKind(k); setLayout(k === "body" ? "graal-body" : k === "head" ? "graal-head" : k === "hat" ? "graal-hat" : "single"); }}>{label}</Button>)}</div>}
    <label className="text-sm">{fixedKind ? "Crear arma personalizada" : "Imagen PNG / GIF"}<input aria-label={fixedKind ? "Subir arma personalizada" : "Imagen del diseño"} type="file" accept="image/png,image/gif" disabled={busy} className="block w-full min-w-0 text-xs" onChange={(e) => void choose(e.target.files?.[0])} /></label>
    {file && <>
      {kind !== "melee" && <select aria-label="Formato del diseño" value={layout} className="border border-border bg-input p-1" onChange={(e) => setLayout(e.target.value as ArtLayout)}><option value="single">Imagen única</option><option value="grid">Cuadrícula 4×4</option><option value={kind === "body" ? "graal-body" : kind === "head" ? "graal-head" : "graal-hat"}>Plantilla Graal</option></select>}
      {layout === "graal-hat" && kind === "hat" && <select aria-label="Columnas del hat" value={columns} className="border border-border bg-input p-1" onChange={(e) => setColumns(e.target.value === "3" ? 3 : 4)}><option value="3">3 columnas</option><option value="4">4 columnas</option></select>}
      <img src={sourceUrl} alt="Original del diseño" className="max-h-36 max-w-full self-center object-contain [image-rendering:pixelated]" />
      <div className="flex flex-wrap gap-2">{(["x", "y", "w", "h"] as const).map((key) => <label key={key} className="text-xs">{({ x: "Recorte X", y: "Recorte Y", w: "Ancho recorte", h: "Alto recorte" })[key]}<input aria-label={`Recorte ${key}`} type="number" min={key === "w" || key === "h" ? 1 : 0} value={crop[key]} className={`block ${input}`} onChange={(e) => setCrop({ ...crop, [key]: Number(e.target.value) })} /></label>)}</div>
      <label className="text-xs">Tamaño {Math.round(scale * 100)}%<input aria-label="Tamaño del diseño" type="range" min={0.25} max={1.4} step={0.05} value={scale} className="block w-full accent-primary" onChange={(e) => setScale(Number(e.target.value))} /></label>
      {ready && <div className="flex flex-col items-center gap-2"><CharacterCanvas look={{ ...look, [`${kind}_id`]: previewId }} dir={dir} walking scale={4} /><div className="flex gap-1">{DIRECTIONS.map((d) => <Button key={d} size="sm" variant={dir === d ? "default" : "secondary"} onClick={() => setDir(d)}>{d}</Button>)}</div><span className="text-xs text-muted-foreground">{result?.frames} fotogramas</span></div>}
      <Button disabled={!ready || busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar diseño"}</Button>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}