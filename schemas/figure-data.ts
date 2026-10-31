/**
 * Node kinds for the figure data a who-iris library entry carries: one file per
 * published version of a chart, transcribed once and drawn by the generators
 * in `scripts/diig-phases-svg.ts` and `scripts/smart-approach-svg.ts`.
 *
 * The families are routed in cat-harness-tools' graph-typology registry under
 * the `library` kind, which says their shapes live "with the generators that
 * draw them". These are those shapes, so `node-kinds` finds a kind for each
 * family (fa#2781). The TypeScript interfaces in the generators are the same
 * shapes; a file that fails here would fail to draw there.
 *
 * @module folio-assistant-core/schemas/figure-data
 */
import { z } from "zod";
import { nodeKind } from "@litlfred/cat-harness-tools/schemas/kg/node-kind.ts";

const FigureSource = z.object({
  library: z.string().min(1),
  label: z.string().min(1),
  caption: z.string().min(1),
  page: z.number().int().positive(),
  file: z.string().min(1),
});
const Link = z.object({ library: z.string().optional(), glossary: z.string().optional(), url: z.string().optional() });

// ── diig-phases-figure/v1 ────────────────────────────────────────────────────
const Phase = z.object({
  id: z.string().min(1),
  name: z.array(z.string()),
  color: z.string(),
  tint: z.string(),
  steps: z.array(z.string()),
});
const Resource = z.object({
  id: z.string().min(1),
  label: z.array(z.string()),
  icons: z.array(z.string()),
  smallPrint: z.array(z.string()).optional(),
  parts: z.array(z.array(z.string())).optional(),
  link: Link.optional(),
});
const Span = z.tuple([z.number().int(), z.number().int()]);
const Tile = z.object({ resource: z.string().min(1), columns: Span, rows: Span, outlinePhase: z.string() });
const ThisDocument = z.object({
  resource: z.string().min(1),
  style: z.enum(["dashed", "filled"]),
  color: z.string(),
  fill: z.string(),
  note: z.string().optional(),
});

export const DiigPhasesFigureSchema = z.object({
  $schema: z.literal("diig-phases-figure/v1"),
  figure: FigureSource,
  legend: z.record(z.string(), z.string()),
  phases: z.array(Phase).min(1),
  resources: z.array(Resource),
  layout: z.object({ columns: z.number().int().positive(), rows: z.number().int().positive(), tiles: z.array(Tile) }),
  thisDocument: ThisDocument,
});
export const DiigPhasesFigureKind = nodeKind("diig-phases-figure", [], DiigPhasesFigureSchema.shape);

// ── smart-guidelines-approach-figure/v1 ──────────────────────────────────────
const Cell = z.object({ name: z.string(), text: z.string(), product: z.string().optional() });

export const SmartApproachFigureSchema = z.object({
  $schema: z.literal("smart-guidelines-approach-figure/v1"),
  figure: FigureSource,
  link: Link.optional(),
  style: z.object({
    band: z.string(),
    panel: z.string(),
    card: z.string(),
    ink: z.string(),
    arrow: z.string(),
    loop: z.string(),
  }),
  loop: z.string(),
  bands: z.array(z.object({ id: z.string().min(1), label: z.string() })),
  rows: z.array(
    z.object({
      id: z.enum(["knowledge", "country"]),
      label: z.array(z.string()),
      from: z.string(),
      to: z.string(),
      chained: z.boolean(),
    }),
  ),
  layers: z.array(z.object({ level: z.number().int(), knowledge: Cell, country: Cell })),
});
export const SmartApproachFigureKind = nodeKind("smart-guidelines-approach-figure", [], SmartApproachFigureSchema.shape);
