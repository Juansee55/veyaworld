import { supabase } from "@/integrations/supabase/client";
import { validateWorldArt } from "./world-art-rules";
export type WorldAsset = import("@/integrations/supabase/types").Database["public"]["Tables"]["world_assets"]["Row"];
export async function worldArtUrl(path: string) {
  const { data, error } = await supabase.storage.from("player-art").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function uploadWorldArt(file: File, kind: "tileset" | "object") {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Seleccioná una imagen PNG, JPG, WebP o GIF.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera los 5 MB.");
  const image = await createImageBitmap(file);
  try {
    validateWorldArt(kind, image.width, image.height);
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo leer la imagen.");
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("No se pudo convertir la imagen.")), "image/png"));
    const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Iniciá sesión.");
    const path = `${user.id}/world/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from("player-art").upload(path, blob); if (uploadError) throw uploadError;
    const { data, error } = await supabase.from("world_assets").insert({ name: file.name.slice(0, 40), kind, path, width: image.width, height: image.height }).select().single();
    if (error) { await supabase.storage.from("player-art").remove([path]); throw error; }
    return data;
  } finally { image.close(); }
}