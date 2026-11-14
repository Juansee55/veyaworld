export function validateWorldArt(kind: "tileset" | "object", width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width % 16 || height % 16) throw new Error("La imagen debe tener medidas múltiplos de 16 píxeles.");
  if (kind === "tileset" && (height !== 16 || width < 16 || width > 8192)) throw new Error("El tileset debe ser una tira horizontal de 16 píxeles de alto (tiles de 16×16).");
  if (kind === "object" && (width < 16 || height < 16 || width > 96 || height > 96)) throw new Error("Los objetos deben medir entre 16×16 y 96×96 píxeles.");
  return { width, height, count: width / 16 };
}