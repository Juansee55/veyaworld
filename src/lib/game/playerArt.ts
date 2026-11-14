import { supabase } from "@/integrations/supabase/client";
import type { ArtKind } from "@/game/art/layout";
export type PlayerArt = Awaited<ReturnType<typeof listMyArt>>[number];
/** The signed-in player's own uploads. */
export async function listMyArt() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("player_art").select("*").eq("user_id", user.id).order("created_at");
  if (error) throw error;
  return data ?? [];
}
export async function savePlayerArt(file: File, sheet: Blob, kind: ArtKind, frames: number, frameMs: number) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in to upload");
  const folder = `${user.id}/${crypto.randomUUID()}`;
  const originalPath = `${folder}/original.${file.type === "image/gif" ? "gif" : "png"}`;
  const sheetPath = `${folder}/sheet.png`;
  const uploaded: string[] = [];
  try {
    for (const [path, content] of [[originalPath, file], [sheetPath, sheet]] as const) {
      const { error } = await supabase.storage.from("player-art").upload(path, content);
      if (error) throw error;
      uploaded.push(path);
    }
    const { data, error } = await supabase.from("player_art").insert({ user_id: user.id, kind, name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Upload", original_path: originalPath, sheet_path: sheetPath, frames, frame_ms: frameMs }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    await supabase.storage.from("player-art").remove(uploaded);
    throw error;
  }
}
export async function deletePlayerArt(art: { id: string; sheet_path: string; original_path: string }) {
  const { error } = await supabase.from("player_art").delete().eq("id", art.id);
  if (error) throw error;
  await supabase.storage.from("player-art").remove([art.sheet_path, art.original_path]);
}
