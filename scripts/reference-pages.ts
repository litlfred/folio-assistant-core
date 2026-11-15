/**
 * The `folio-reference` kind's pages: its nodes are shown by this layer's
 * Bibliography, so the node-kind pages link there instead of drawing a
 * generic page per reference.
 *
 * @module folio-assistant-core/scripts/reference-pages
 * @graphNode none — a page renderer named by the validator node's `pages`, not a schema
 *
 * Every node kind gets pages (owner, 2026-11-13), and the schemas page links
 * them, so the kind page and its harness pages stay. What goes is the second
 * copy of every reference: who-iris published 7,110 generic per-reference
 * pages and a 2.3 MB index at `en/folio-assistant-core/folio-reference/`
 * beside the Bibliography's summaries, side panel and search (owner,
 * 2026-11-15, option A: "the 7,110 generic reference pages come off").
 */
import { visualiserRoute } from "@litlfred/cat-harness-tools/schemas/kg/visualiser-route.ts";
import type { KindPages } from "@litlfred/cat-harness-tools/scripts/gen-node-kind-pages.ts";

/** The Bibliography visualiser this layer declares (`folio-assistant-core.json` `visualisers`). */
export const BIBLIOGRAPHY = { harness: "folio-assistant-core", visualiser: "bibliography", label: "Bibliography" } as const;

export const ReferencePages: KindPages = {
  nodesShownBy: {
    label: BIBLIOGRAPHY.label,
    route: (locale) => visualiserRoute({ locale, harness: BIBLIOGRAPHY.harness, visualiser: BIBLIOGRAPHY.visualiser }).replace(/\/$/, ""),
  },
};
