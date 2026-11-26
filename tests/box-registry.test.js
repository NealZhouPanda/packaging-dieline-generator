import { describe, expect, it } from "vitest";
import {
  BOX_DEFINITIONS,
  BOX_REGISTRY,
  UI_BOX_DEFINITIONS,
  generateRegisteredBox,
  getBoxDefinition,
} from "../src/boxes/registry.js";
import { createBoxTopology, supportsBoxTopology } from "../src/box-topology.js";
import { whiteCardCalipersFor } from "../src/material-options.js";
import { geometryToSvg } from "../src/svg.js";

describe("Unified box registry", () => {
  it("registers unique IDs and exposes all 7 UI box styles in order", () => {
    const ids = BOX_DEFINITIONS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(UI_BOX_DEFINITIONS.map((def) => def.id)).toEqual([
      "0201",
      "0421",
      "E005C",
      "C001GX",
      "K016A",
      "0206",
      "T004C",
    ]);
    for (const def of BOX_DEFINITIONS) {
      expect(BOX_REGISTRY[def.id]).toBe(def);
      expect(getBoxDefinition(def.id)).toBe(def);
    }
  });

  it("generates valid geometry, SVG, and 3D topology from each UI box default", () => {
    for (const def of UI_BOX_DEFINITIONS) {
      const geometry = generateRegisteredBox({ boxType: def.id, ...def.defaults });
      expect(geometry.meta.boxId).toBe(def.id);
      expect(() => geometryToSvg(geometry)).not.toThrow();
      expect(supportsBoxTopology(def.id)).toBe(true);
      const topology = createBoxTopology(geometry);
      expect(topology.pieces.length).toBeGreaterThan(0);
      expect(whiteCardCalipersFor(def.id)).toEqual([...def.whiteCardCalipers]);
    }
  });

  it("rejects unknown box types cleanly", () => {
    expect(getBoxDefinition("UNKNOWN")).toBeNull();
    expect(() => generateRegisteredBox({ boxType: "UNKNOWN" })).toThrow(RangeError);
  });
});
