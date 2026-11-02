/**
 * The structured-assets page of a document: every requirement, persona,
 * scenario, data element (and any other structured kind) the document holds,
 * one table per kind, each row linked to its card in the text.
 *
 * Owner, 2026-11-01, of the DTH drafts: "is there a requirements viewer
 * already?", "look at all the structured assets... not just requirements";
 * card Q-SAV-1 = A, "one Structured assets page per document".
 *
 * The page sits at `<page dir>/assets/` beside the document page, so a row
 * links to `../#<label>` and the cards' kind labels link back to
 * `assets/#<kind>` ({@link linkKindLabels}). The fields come from the block
 * manifests, not from the text, so the page shows exactly what the KG holds.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { kindHeading } from "@litlfred/cat-harness-tools/schemas/content/translation.js";
import type { Chapter, Paper, Section, SectionRef } from "@litlfred/cat-harness-tools/schemas/types.js";

/** Kinds that are narrative or pictures, not structured assets. */
const NOT_ASSETS = new Set(["prose", "figure", "diagram", "table", "remark", "note", "example", "proof", "quote"]);

/** Fields that say where a block came from, not what it is. */
const HIDDEN_META = new Set(["source", "requirementId", "id"]);

export interface StructuredAsset {
  kind: string;
  label: string;
  id?: string;
  title?: string;
  /** The section the block sits in, as its heading reads. */
  section: string;
  /** Scalar fields of `meta`, as shown. */
  fields: Record<string, string>;
  /** Labels this block names (a scenario's personas). */
  personas: string[];
}

const isRef = (s: Section | SectionRef): s is SectionRef => !("blocks" in s);

const scalar = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/** Every structured block of one document, in manifest order. */
export async function structuredAssets(manifestPath: string): Promise<StructuredAsset[]> {
  const docDir = dirname(manifestPath);
  const paper = (await import(manifestPath)).default as Paper;
  const out: StructuredAsset[] = [];
  for (const chRef of paper.chapters) {
    const chDir = join(docDir, chRef.dir);
    const chPath = join(chDir, `${chRef.dir}.ts`);
    if (!existsSync(chPath)) continue;
    const chapter = (await import(chPath)).default as Chapter;
    const walk = async (secs: Array<Section | SectionRef>) => {
      for (const sec of secs) {
        if (isRef(sec)) continue;
        for (const root of sec.blocks) {
          const ts = join(chDir, `${root}.ts`);
          if (!existsSync(ts)) continue;
          const b = (await import(ts)).default as Record<string, unknown> & { kind?: string; label?: string };
          if (!b.kind || !b.label || NOT_ASSETS.has(b.kind)) continue;
          const meta = b.meta && typeof b.meta === "object" ? (b.meta as Record<string, unknown>) : {};
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(meta)) {
            const s = scalar(v);
            if (s !== undefined && !HIDDEN_META.has(k)) fields[k] = s;
          }
          const id = scalar(meta.requirementId) ?? scalar(meta.id);
          const title = scalar(b.title) ?? scalar(b.caption);
          out.push({
            kind: b.kind,
            label: b.label,
            ...(id ? { id } : {}),
            ...(title ? { title } : {}),
            section: sec.title,
            fields,
            personas: Array.isArray(b.personas) ? b.personas.filter((p): p is string => typeof p === "string") : [],
          });
        }
        if (sec.subsections) await walk(sec.subsections);
      }
    };
    await walk(chapter.sections);
  }
  return out;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "personaType" -> "Persona type", "minimumDataSet" -> "Minimum data set". */
export function fieldHeading(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The heading a kind's table wears, plural. */
const plural = (h: string): string => (/(s|x|ch|sh)$/i.test(h) ? `${h}es` : /[^aeiou]y$/i.test(h) ? `${h.slice(0, -1)}ies` : `${h}s`);

/**
 * The page body: a summary line, then one sortable table per kind, in the
 * order the kinds first appear in the document. `toDoc` is the document
 * page's path relative to this page (`../`).
 */
export function structuredAssetsBody(title: string, assets: readonly StructuredAsset[], toDoc = "../"): string {
  const byKind = new Map<string, StructuredAsset[]>();
  for (const a of assets) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  const titleOf = new Map(assets.map((a) => [a.label, a.title ?? a.label]));
  const link = (label: string, text: string) => `<a href="${esc(toDoc)}#${esc(encodeURIComponent(label))}">${esc(text)}</a>`;
  const parts: string[] = [
    `<h1>${esc(title)}: structured assets</h1>`,
    `<p class="fa-assets-summary">${[...byKind].map(([k, v]) => `<a href="#${esc(k)}">${esc(plural(kindHeading(k, "en")))}</a> (${v.length})`).join(" · ")}. <a href="${esc(toDoc)}">Back to the document</a>.</p>`,
  ];
  for (const [kind, rows] of byKind) {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r.fields)))];
    const hasId = rows.some((r) => r.id);
    const hasPersonas = rows.some((r) => r.personas.length > 0);
    const head = [hasId ? "Id" : "", "Title", ...keys.map(fieldHeading), hasPersonas ? "Personas" : "", "Section"].filter(Boolean);
    const body = rows.map((r) => {
      const cells = [
        ...(hasId ? [r.id ? link(r.label, r.id) : ""] : []),
        link(r.label, r.title ?? r.label),
        ...keys.map((k) => esc(r.fields[k] ?? "")),
        ...(hasPersonas ? [r.personas.map((p) => link(p, titleOf.get(p) ?? p)).join(", ")] : []),
        esc(r.section),
      ];
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    });
    parts.push(
      `<h2 id="${esc(kind)}">${esc(plural(kindHeading(kind, "en")))} <span class="fa-assets-count">(${rows.length})</span></h2>`,
      `<div class="table-wrapper"><table class="fa-assets"><thead><tr>${head.map((h) => `<th scope="col" aria-sort="none"><button type="button">${esc(h)}</button></th>`).join("")}</tr></thead>`,
      `<tbody>\n${body.join("\n")}\n</tbody></table></div>`,
    );
  }
  parts.push(SORT_SCRIPT);
  return parts.join("\n");
}

/** Click a column heading to sort by it; again to reverse. Text compare, numbers as numbers. */
const SORT_SCRIPT = `<style>
.fa-assets th button { all: unset; cursor: pointer; font-weight: 600; }
.fa-assets th[aria-sort="ascending"] button::after { content: " \\25B4"; }
.fa-assets th[aria-sort="descending"] button::after { content: " \\25BE"; }
.fa-assets td, .fa-assets th { vertical-align: top; text-align: left; }
.fa-assets-count { font-weight: normal; opacity: .65; font-size: .8em; }
</style>
<script>
document.querySelectorAll("table.fa-assets").forEach(function (t) {
  t.querySelectorAll("th").forEach(function (th, i) {
    th.querySelector("button").addEventListener("click", function () {
      var dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
      t.querySelectorAll("th").forEach(function (h) { h.setAttribute("aria-sort", "none"); });
      th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
      var body = t.tBodies[0];
      Array.from(body.rows).sort(function (a, b) {
        var x = a.cells[i].textContent.trim(), y = b.cells[i].textContent.trim();
        var nx = Number(x), ny = Number(y);
        return dir * (x !== "" && y !== "" && !isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y, undefined, { numeric: true }));
      }).forEach(function (r) { body.appendChild(r); });
    });
  });
});
</script>`;

/**
 * On the document page, each card's kind label becomes a link to its kind's
 * table on the assets page (`assets/#<kind>`). Only kinds the page lists are
 * linked, so no link lands on a missing table.
 */
export function linkKindLabels(html: string, kinds: ReadonlySet<string>, toAssets = "assets/"): string {
  return html.replace(
    /(<div class="fa-block fa-block-([a-z0-9-]+)"[^>]*>(?:(?!<div class="fa-block )[\s\S])*?)<span class="fa-block-kind">([^<]*)<\/span>/g,
    (all, before: string, kind: string, text: string) =>
      kinds.has(kind) ? `${before}<a class="fa-block-kind" href="${toAssets}#${kind}" title="Every ${esc(text.toLowerCase())} in this document">${text}</a>` : all,
  );
}
