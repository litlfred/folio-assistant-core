/**
 * `folio-reference/v1`: one bibliographic reference, as a KG node (bean
 * folio-assistant-63q4).
 *
 * ## Why a node
 *
 * Every `\cite{key}` already becomes `cito:cites` → `references/<key>`
 * (cat-harness `resolveReferenceKey`), and until now nothing was ever written
 * at that IRI: every citation in the KG dangled. A reference node is what is
 * there. It is also what a bibliography viewer lists and exports, path by path,
 * the way the glossary lists terms.
 *
 * @module schemas/reference
 * @graphNode schema
 *
 * ## The body is CSL-JSON, and the node reads as Dublin Core
 *
 * Owner, 2026-10-14, on aligning qou's bibliography: *"1 + 2"*. Keep CSL-JSON
 * as the source (qou's 915 entries, and the LaTeX/BibTeX pipeline built on
 * them), one entry per node. CSL-JSON is the citation format: it carries the
 * volume, issue, page and series that mathematics needs and that Dublin Core
 * has no fields for. Dublin Core is how the node READS: {@link referenceToJsonLd}
 * maps the CSL fields to `dcterms:` and `bibo:` predicates, so every reference,
 * from whatever source, is also a DC description.
 *
 * ## Where a reference comes from
 *
 * One node type for every source, said by {@link ReferenceProvenance}:
 * - `authored`: a folio's own bibliography entry (qou's `references.ts`, then its per-entry files);
 * - `catalogue`: projected from a catalogue's Dublin Core record ({@link dublinCoreToReference}),
 *   e.g. a who-iris item;
 * - `library`: a library asset's own manifest;
 * - `extracted`: one entry of a paper's reference list, split out of its references section.
 *
 * Core's, by core's rule: a reference describes what a folio HOLDS or CITES
 * and where it CAME FROM. Not the harness's.
 *
 * Exports: {@link toCslJson}, {@link toBibtex}, {@link toRis}, {@link toJsonLdGraph}.
 *
 * @module folio-assistant-core/schemas/reference
 * @conformsTo csl-json, dcmi-terms
 */
import { z } from "zod";

import { resolveReferenceKey } from "@litlfred/cat-harness/schemas/jsonld.ts";
import { cslToBibtex } from "@litlfred/cat-harness-tools/pipeline/bibtex-format.ts";
import { dcValues, type DublinCoreRecord } from "./dublin-core.ts";

export const REFERENCE_SCHEMA_TAG = "folio-reference/v1" as const;

/** A citation key: what `\cite{…}` names and what `references/<key>` ends in. */
export const ReferenceKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]*$/, {
  message: "a reference key is letters, digits and . _ : + - (no spaces, slashes or #), starting with a letter or digit",
});

/** A CSL-JSON name. Either structured, or `literal` for an organisation. */
const CslNameSchema = z
  .object({ family: z.string().optional(), given: z.string().optional(), literal: z.string().optional() })
  .passthrough();
export type CslName = z.infer<typeof CslNameSchema>;

/** A CSL-JSON date: `date-parts` (`[[2004]]`, `[[2014, 12, 18]]`) or a `raw`/`literal` string. */
const CslDateSchema = z
  .object({
    "date-parts": z.array(z.array(z.union([z.number(), z.string()])).min(1)).min(1).optional(),
    raw: z.string().optional(),
    literal: z.string().optional(),
  })
  .passthrough();

export const ReferenceProvenanceSchema = z.enum(["authored", "catalogue", "library", "extracted"]);
export type ReferenceProvenance = z.infer<typeof ReferenceProvenanceSchema>;

/**
 * A reference node: a CSL-JSON item (`id` is the key) plus what places it in
 * the KG. Unknown CSL fields pass through: the spec has more than a hundred,
 * and qou uses `series`, `note` and others the `csl-json` typing omits.
 */
export const ReferenceNodeSchema = z
  .object({
    $schema: z.literal(REFERENCE_SCHEMA_TAG),
    id: ReferenceKeySchema,
    type: z.string().min(1),
    title: z.string().min(1).optional(),
    author: z.array(CslNameSchema).optional(),
    editor: z.array(CslNameSchema).optional(),
    issued: CslDateSchema.optional(),
    "container-title": z.string().optional(),
    publisher: z.string().optional(),
    volume: z.union([z.string(), z.number()]).optional(),
    issue: z.union([z.string(), z.number()]).optional(),
    page: z.string().optional(),
    DOI: z.string().optional(),
    ISBN: z.string().optional(),
    URL: z.string().optional(),
    language: z.string().optional(),
    abstract: z.string().optional(),
    /** Where the reference came from. Absent means `authored`. */
    provenance: ReferenceProvenanceSchema.optional(),
    /** The asset it was taken from: a DC record, a library manifest, a paper's references section. Repo-relative path or IRI. */
    derivedFrom: z.string().min(1).optional(),
    /** The library asset that holds a copy of the work, when one is held. Repo-relative path or IRI. */
    heldAt: z.string().min(1).optional(),
  })
  .passthrough();
export type ReferenceNode = z.infer<typeof ReferenceNodeSchema>;

/**
 * The fragment id of a reference on a bibliography page: `ref-<key>`, with any
 * character that is not URL-fragment-safe replaced. One function, so the page
 * that draws an entry and every link to it agree.
 */
export const referenceAnchor = (key: string): string => `ref-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;

/** The KG IRI of a reference: `references/<key>`, the one `\cite` already points at. */
export const referenceIri = (key: string): string => resolveReferenceKey(key);

/** The fields that are the node's and not CSL's. Dropped from a CSL-JSON export. */
const NODE_FIELDS = new Set(["$schema", "provenance", "derivedFrom", "heldAt", "library", "_comment", "_generated"]);

/** The CSL-JSON item a node carries, as a citation processor reads it. */
export function toCslItem(ref: ReferenceNode): Record<string, unknown> {
  return Object.fromEntries(Object.entries(ref).filter(([k]) => !NODE_FIELDS.has(k)));
}

// ── Reading a name and a date ────────────────────────────────────────────────

/** A display name: `Family, Given`, or the literal. */
export function nameText(n: CslName): string {
  if (n.literal) return n.literal;
  return [n.family, n.given].filter(Boolean).join(", ");
}

/** The year, or undefined. */
export function yearOf(ref: Pick<ReferenceNode, "issued">): string | undefined {
  const p = ref.issued?.["date-parts"]?.[0]?.[0];
  if (p !== undefined && String(p).trim()) return String(p);
  const m = /\b(\d{4})\b/.exec(ref.issued?.raw ?? ref.issued?.literal ?? "");
  return m?.[1];
}

/** ISO-ish date text (`2014`, `2014-12`, `2014-12-18`), or undefined. */
export function dateText(ref: Pick<ReferenceNode, "issued">): string | undefined {
  const parts = ref.issued?.["date-parts"]?.[0];
  if (parts?.length) return parts.map((p, i) => (i === 0 ? String(p) : String(p).padStart(2, "0"))).join("-");
  return ref.issued?.raw ?? ref.issued?.literal;
}

// ── JSON-LD: the node read as Dublin Core and BIBO ───────────────────────────

/** The prefixes a reference's JSON-LD uses. */
export const REFERENCE_CONTEXT = {
  dcterms: "http://purl.org/dc/terms/",
  bibo: "http://purl.org/ontology/bibo/",
  fabio: "http://purl.org/spar/fabio/",
  schema: "https://schema.org/",
} as const;

/** CSL `type` → BIBO class. A type not here is a `bibo:Document`. */
export const BIBO_CLASS: Readonly<Record<string, string>> = {
  "article-journal": "bibo:AcademicArticle",
  article: "bibo:Article",
  "article-magazine": "bibo:Article",
  "article-newspaper": "bibo:Article",
  book: "bibo:Book",
  chapter: "bibo:Chapter",
  "paper-conference": "bibo:AcademicArticle",
  report: "bibo:Report",
  thesis: "bibo:Thesis",
  webpage: "bibo:Webpage",
  manuscript: "bibo:Manuscript",
  standard: "bibo:Standard",
  legislation: "bibo:Legislation",
};

/**
 * The node as JSON-LD: `@id` is `references/<key>`, `@type` is `fabio:Work`
 * plus the BIBO class, and every property is a Dublin Core or BIBO term. A
 * reader that wants the citation data whole takes the CSL-JSON export
 * ({@link toCslJson}); this is the description, not the citation.
 */
export function referenceToJsonLd(ref: ReferenceNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "@context": REFERENCE_CONTEXT,
    "@id": referenceIri(ref.id),
    "@type": ["fabio:Work", BIBO_CLASS[ref.type] ?? "bibo:Document"],
  };
  const set = (k: string, v: unknown) => {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
    out[k] = v;
  };
  set("dcterms:title", ref.title);
  set("dcterms:creator", ref.author?.map(nameText));
  set("bibo:editor", ref.editor?.map(nameText));
  set("dcterms:issued", dateText(ref));
  set("dcterms:publisher", ref.publisher);
  set("dcterms:isPartOf", ref["container-title"]);
  set("bibo:volume", ref.volume === undefined ? undefined : String(ref.volume));
  set("bibo:issue", ref.issue === undefined ? undefined : String(ref.issue));
  set("bibo:pages", ref.page);
  set("bibo:doi", ref.DOI);
  set("bibo:isbn", ref.ISBN);
  set("dcterms:identifier", ref.URL);
  set("dcterms:language", ref.language);
  set("dcterms:abstract", ref.abstract);
  set("dcterms:source", ref.derivedFrom);
  set("dcterms:hasVersion", ref.heldAt);
  return out;
}

// ── Dublin Core → reference ──────────────────────────────────────────────────

/** DC `type` values → CSL type. A record with none is a `document`. */
const DC_TYPE_TO_CSL: Readonly<Record<string, string>> = {
  book: "book",
  "book chapter": "chapter",
  article: "article-journal",
  "journal article": "article-journal",
  report: "report",
  "technical report": "report",
  thesis: "thesis",
  "web page": "webpage",
  "technical documents": "report",
  publications: "book",
};

/**
 * A DC creator as a CSL name. `Family, Given` splits on the first comma, which
 * is how DSpace stores a person. A name with no comma is an organisation's,
 * and stays whole as `literal`: "World Health Organization" has no family name.
 */
export function dcCreatorToName(value: string): CslName {
  const i = value.indexOf(",");
  if (i < 0) return { literal: value.trim() };
  const family = value.slice(0, i).trim();
  const given = value.slice(i + 1).trim();
  return given ? { family, given } : { literal: family };
}

/** `2014-12-18`, `2014-12`, `2014` → CSL `date-parts`. Anything else → `raw`. */
export function dcDateToCsl(value: string): NonNullable<ReferenceNode["issued"]> {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value.trim());
  if (!m) return { raw: value };
  return { "date-parts": [[m[1], m[2], m[3]].filter((x): x is string => !!x).map(Number)] };
}

/**
 * A Dublin Core record as a reference node. The key is the caller's: the
 * record's own `id` is a repository UUID, not something a reader cites.
 * Only what the record states is carried. Nothing is inferred, and a field
 * the record lacks is absent here too.
 */
export function dublinCoreToReference(
  rec: DublinCoreRecord,
  opts: { key: string; derivedFrom?: string; heldAt?: string },
): ReferenceNode {
  const all = (element: string, qualifier?: string) => dcValues(rec, element, qualifier).map((v) => v.value);
  const first = (element: string, qualifier?: string) => all(element, qualifier)[0];
  const dcType = first("type")?.toLowerCase();
  const ref: ReferenceNode = {
    $schema: REFERENCE_SCHEMA_TAG,
    id: opts.key,
    type: (dcType && DC_TYPE_TO_CSL[dcType]) ?? (all("identifier", "isbn").length ? "book" : "document"),
    provenance: "catalogue",
  };
  const put = <K extends keyof ReferenceNode>(k: K, v: ReferenceNode[K] | undefined) => {
    if (v !== undefined && !(Array.isArray(v) && !v.length)) ref[k] = v;
  };
  put("title", first("title"));
  put("author", all("contributor", "author").map(dcCreatorToName));
  put("editor", all("contributor", "editor").map(dcCreatorToName));
  const issued = first("date", "issued");
  put("issued", issued ? dcDateToCsl(issued) : undefined);
  put("publisher", first("publisher"));
  put("ISBN", first("identifier", "isbn"));
  put("DOI", first("identifier", "doi"));
  put("URL", first("identifier", "uri"));
  put("language", first("language", "iso") ?? first("language"));
  put("abstract", first("description", "abstract"));
  put("derivedFrom", opts.derivedFrom);
  put("heldAt", opts.heldAt);
  return ReferenceNodeSchema.parse(ref);
}

// ── Exports ──────────────────────────────────────────────────────────────────

/** CSL-JSON: an array of items, as citeproc, Zotero and pandoc read it. */
export function toCslJson(refs: readonly ReferenceNode[]): string {
  return `${JSON.stringify(refs.map(toCslItem), null, 2)}\n`;
}

/** BibTeX, through the same formatter `export-bibtex` writes `references.bib` with. */
export function toBibtex(refs: readonly ReferenceNode[]): string {
  return refs.map((r) => cslToBibtex(toCslItem(r) as Parameters<typeof cslToBibtex>[0])).join("\n\n") + (refs.length ? "\n" : "");
}

/** CSL type → RIS `TY`. */
const RIS_TYPE: Readonly<Record<string, string>> = {
  "article-journal": "JOUR",
  article: "JOUR",
  "article-magazine": "MGZN",
  "article-newspaper": "NEWS",
  book: "BOOK",
  chapter: "CHAP",
  "paper-conference": "CPAPER",
  report: "RPRT",
  thesis: "THES",
  webpage: "ELEC",
  manuscript: "UNPB",
  standard: "STAND",
};

/** RIS, one record per reference, as EndNote, Zotero and Mendeley import it. */
export function toRis(refs: readonly ReferenceNode[]): string {
  const rec = (r: ReferenceNode): string => {
    const lines: string[] = [`TY  - ${RIS_TYPE[r.type] ?? "GEN"}`, `ID  - ${r.id}`];
    const add = (tag: string, v: unknown) => {
      if (v !== undefined && v !== "") lines.push(`${tag}  - ${String(v).replace(/\s*\n\s*/g, " ")}`);
    };
    for (const a of r.author ?? []) add("AU", nameText(a));
    for (const e of r.editor ?? []) add("ED", nameText(e));
    add("TI", r.title);
    add("T2", r["container-title"]);
    add("PY", yearOf(r));
    add("DA", dateText(r)?.replace(/-/g, "/"));
    add("PB", r.publisher);
    add("VL", r.volume);
    add("IS", r.issue);
    const [sp, ep] = (r.page ?? "").split(/[-–]/);
    add("SP", sp?.trim() || undefined);
    add("EP", ep?.trim() || undefined);
    add("DO", r.DOI);
    add("SN", r.ISBN);
    add("UR", r.URL);
    add("LA", r.language);
    add("AB", r.abstract);
    lines.push("ER  - ");
    return lines.join("\r\n");
  };
  return refs.map(rec).join("\r\n\r\n") + (refs.length ? "\r\n" : "");
}

/** Dublin Core / BIBO JSON-LD: every reference as one `@graph`. */
export function toJsonLdGraph(refs: readonly ReferenceNode[]): string {
  const graph = refs.map((r) => {
    const { "@context": _c, ...rest } = referenceToJsonLd(r);
    return rest;
  });
  return `${JSON.stringify({ "@context": REFERENCE_CONTEXT, "@graph": graph }, null, 2)}\n`;
}
