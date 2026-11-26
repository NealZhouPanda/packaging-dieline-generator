import { generate0201 } from "../generator0201.js";
import { generate0202A } from "../generator0202a.js";
import { generate0206 } from "../generator0206.js";
import { generate0421 } from "../generator0421.js";
import { generateC001GX } from "../generatorC001GX.js";
import { generateE005C } from "../generatorE005C.js";
import { generateK016A } from "../generatorK016A.js";
import { generateT004C } from "../generatorT004C.js";
import { create0201Topology } from "../topology0201.js";
import { create0206Topology } from "../topology0206.js";
import { create0421Topology } from "../topology0421.js";
import { createC001GXTopology } from "../topologyC001GX.js";
import { createE005CTopology } from "../topologyE005C.js";
import { createK016ATopology } from "../topologyK016A.js";
import { createT004CTopology } from "../topologyT004C.js";

const BASE_WHITE_CARD_CALIPERS = Object.freeze([0.4, 0.5, 0.6, 0.8]);
const EXTENDED_WHITE_CARD_CALIPERS = Object.freeze([0.4, 0.5, 0.6, 0.8, 1]);

/**
 * Single source of truth for all registered box types.
 * Adding a new box type only requires adding its generator/topology modules
 * and declaring one entry here.
 */
export const BOX_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "0201",
    label: "01 · 标准纸箱",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 5 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    generate: generate0201,
    createTopology: create0201Topology,
  }),
  Object.freeze({
    id: "0421",
    label: "02 · 翻盖展示盒",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 5 }),
    whiteCardCalipers: EXTENDED_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    generate: generate0421,
    createTopology: create0421Topology,
  }),
  Object.freeze({
    id: "E005C",
    label: "03 · 翻盖飞机盒",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 3 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    generate: generateE005C,
    createTopology: createE005CTopology,
  }),
  Object.freeze({
    id: "C001GX",
    label: "04 · 翻盖锁扣纸盒",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "white-card", caliper: 0.5, c001gxTongueStyle: 2 }),
    whiteCardCalipers: EXTENDED_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    filenameSuffix: (parameters) => `_S${parameters.c001gxTongueStyle || 2}`,
    generate: generateC001GX,
    createTopology: createC001GXTopology,
  }),
  Object.freeze({
    id: "K016A",
    label: "05 · 提手盒",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 3 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    generate: generateK016A,
    createTopology: createK016ATopology,
  }),
  Object.freeze({
    id: "0206",
    label: "06 · 全搭盖纸箱",
    showInUi: true,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 3 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    generate: generate0206,
    createTopology: create0206Topology,
  }),
  Object.freeze({
    id: "T004C",
    label: "07 · 挂孔扣底盒",
    showInUi: true,
    defaults: Object.freeze({ length: 120, width: 100, depth: 200, paperType: "white-card", caliper: 0.5, t004cTongueStyle: 2 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: false,
    filenameSuffix: (parameters) => `_S${parameters.t004cTongueStyle || 2}`,
    generate: generateT004C,
    createTopology: createT004CTopology,
  }),
  Object.freeze({
    id: "0202A",
    label: "0202A · 校准参考箱型",
    showInUi: false,
    defaults: Object.freeze({ length: 350, width: 190, depth: 230, paperType: "corrugated", caliper: 3 }),
    whiteCardCalipers: BASE_WHITE_CARD_CALIPERS,
    supportsNetArea: true,
    generate: generate0202A,
    createTopology: null,
  }),
]);

export const BOX_REGISTRY = Object.freeze(
  Object.fromEntries(BOX_DEFINITIONS.map((definition) => [definition.id, definition])),
);

export const UI_BOX_DEFINITIONS = Object.freeze(
  BOX_DEFINITIONS.filter((definition) => definition.showInUi),
);

export function getBoxDefinition(boxType) {
  return BOX_REGISTRY[String(boxType || "")] || null;
}

export function generateRegisteredBox(parameters) {
  const boxType = parameters.boxType || "0201";
  const definition = getBoxDefinition(boxType);
  if (!definition) throw new RangeError(`Unknown box type: ${parameters.boxType}`);
  return definition.generate(parameters);
}
