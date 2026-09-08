const BASE_WHITE_CARD_CALIPERS = Object.freeze([0.4, 0.5, 0.6, 0.8]);
const ONE_MM_WHITE_CARD_BOXES = new Set(["0421", "C001GX"]);

export function whiteCardCalipersFor(boxType) {
  const calipers = [...BASE_WHITE_CARD_CALIPERS];
  if (ONE_MM_WHITE_CARD_BOXES.has(String(boxType || ""))) calipers.push(1);
  return calipers;
}
