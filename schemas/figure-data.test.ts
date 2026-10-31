import { describe, expect, test } from "bun:test";
import { DiigPhasesFigureSchema, SmartApproachFigureSchema } from "./figure-data.ts";
import type { DiigFigure } from "../scripts/diig-phases-svg.ts";
import type { SmartApproachFigure } from "../scripts/smart-approach-svg.ts";

// The same figures the generators' own tests draw: a file the generator can
// draw is a file the node kind accepts.
const diig: DiigFigure = {
  $schema: "diig-phases-figure/v1",
  figure: { library: "lib-a", label: "Fig. 1", caption: "Phases", page: 1, file: "f.png" },
  legend: { d: "PDF for print" },
  phases: [
    { id: "01", name: ["ONE"], color: "#111111", tint: "#EEEEEE", steps: ["First step"] },
    { id: "02", name: ["TWO"], color: "#222222", tint: "#DDDDDD", steps: ["Second step"] },
  ],
  resources: [
    { id: "guide", label: ["A guide"], icons: ["d"], link: { library: "lib-a" } },
    { id: "kit", label: ["Kit"], icons: ["d", "m"], parts: [["Part", "one"], ["Part", "two"]] },
  ],
  layout: { columns: 2, rows: 2, tiles: [
    { resource: "guide", columns: [0, 0], rows: [0, 1], outlinePhase: "01" },
    { resource: "kit", columns: [0, 1], rows: [1, 1], outlinePhase: "02" },
  ] },
  thisDocument: { resource: "guide", style: "dashed", color: "#1A8FD6", fill: "#E8F3FB", note: "(this document)" },
};

const approach: SmartApproachFigure = {
  $schema: "smart-guidelines-approach-figure/v1",
  figure: { library: "lib-a", label: "fig:5", caption: "Approach", page: 1, file: "f.png" },
  style: { band: "#0D97D4", panel: "#EEF4FB", card: "#FFFFFF", ink: "#1F2854", arrow: "#8C94AC", loop: "#1F2854" },
  loop: "Evidence loop",
  bands: [{ id: "top", label: "Top band" }, { id: "mid", label: "Middle band" }, { id: "bot", label: "Bottom band" }],
  rows: [
    { id: "knowledge", label: ["Knowledge"], from: "top", to: "mid", chained: true },
    { id: "country", label: ["Country"], from: "mid", to: "bot", chained: false },
  ],
  layers: [
    { level: 1, knowledge: { name: "Narrative", text: "Words", product: "Guidelines" }, country: { name: "Adaptation", text: "Local words" } },
    { level: 2, knowledge: { name: "Operational", text: "Requirements", product: "Kits" }, country: { name: "Adaptation", text: "Local requirements" } },
  ],
};

describe("figure-data node kinds", () => {
  test("a drawable DIIG phases figure is accepted", () => {
    expect(DiigPhasesFigureSchema.safeParse(diig).success).toBe(true);
  });
  test("a drawable SMART approach figure is accepted", () => {
    expect(SmartApproachFigureSchema.safeParse(approach).success).toBe(true);
  });
  test("a figure under the other family's tag is refused", () => {
    expect(DiigPhasesFigureSchema.safeParse({ ...diig, $schema: "smart-guidelines-approach-figure/v1" }).success).toBe(false);
    expect(SmartApproachFigureSchema.safeParse({ ...approach, rows: [{ ...approach.rows[0], id: "other" }] }).success).toBe(false);
  });
});
