import type { SheetImages } from "./types";

/** Resolves to null on load failure — never throws — so a missing PNG can't break the game (RND-INV-1). */
function loadSpriteSheet(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Loads every sheet in the manifest; per-sheet failures resolve to null instead of rejecting the batch. */
export function loadSpriteSheets(
  defs: Record<string, { src: string }>,
): Promise<SheetImages> {
  const ids = Object.keys(defs);
  return Promise.all(ids.map((id) => loadSpriteSheet(defs[id].src))).then(
    (images) => {
      const sheets: SheetImages = {};
      ids.forEach((id, i) => {
        sheets[id] = images[i];
      });
      return sheets;
    },
  );
}
