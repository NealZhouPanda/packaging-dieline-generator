import { getBoxDefinition } from "./boxes/registry.js";

const DEFAULT_WHITE_CARD_CALIPERS = Object.freeze([0.4, 0.5, 0.6, 0.8]);

export function whiteCardCalipersFor(boxType) {
  const calipers = getBoxDefinition(boxType)?.whiteCardCalipers || DEFAULT_WHITE_CARD_CALIPERS;
  return [...calipers];
}
