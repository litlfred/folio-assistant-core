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
 *   e.g. an item of the IRIS catalogue instance;
 * - `library`: a library asset's own manifest;
 * - `extracted`: one entry of a paper's reference list, split out of its references section.
 *
 * Core's, by core's rule: a reference describes what a folio HOLDS or CITES
 * and where it CAME FROM. Not the harness's.
 *
 * Exports: {@link toCslJson}, {@link toBibtex}, {@link toRis}, {@link toJsonLdGraph}.
 *
 * Its fields are CSL-JSON's (no external-schema record names CSL-JSON yet).
 * The tag reader takes ONE spec id per line, so each is its own tag: the
 * comma-separated form declared none of them.
 *
 * @module folio-assistant-core/schemas/reference
 * @conformsTo dcmi-terms
 * @conformsTo purl-bibo
 * @conformsTo spar-fabio
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { nodeKind } from "@litlfred/cat-harness/schemas/node-kind.ts";
import { readStructure } from "@litlfred/cat-harness/schemas/document-structure.ts";
import { FOLIO_BASE, resolveReferenceKey } from "@litlfred/cat-harness/schemas/jsonld.ts";
import { cslToBibtex } from "@litlfred/cat-harness-tools/pipeline/bibtex-format.ts";
import {
  authorNames,
  issuedYear,
  referenceDirs,
  referenceEntries,
  stringField,
  type ReferenceEntry,
} from "@litlfred/cat-harness-tools/pipeline/reference-entries.ts";
import {
  DC_ELEMENTS_NS,
  DCTERMS_NS,
  DSPACE_NS,
  DUBLIN_CORE_SCHEMA_TAG,
  dcValues,
  type DcField,
  type DublinCoreRecord,
} from "./dublin-core.ts";
import { XSI_NS, renderDcXml } from "./dublin-core-render.ts";

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
 * `folio-reference/v1` as a node kind (issue #2195), so `validators/reference.json`
 * names a kind and `node-kinds:check` files the family under it. Unversioned: the family's tag is not SemVer, so the `$schema` literal stays a
 * field of the shape rather than one `nodeKind()` generates.
 * Not strict: unknown CSL fields pass, as {@link ReferenceNodeSchema} lets them.
 */
export const ReferenceKind = nodeKind("folio-reference", [], ReferenceNodeSchema.shape);

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

/**
 * The context a reference's JSON-LD uses.
 *
 * `@base` is the folio's, so `"@id": "references/<key>"` expands to the same
 * IRI as a content block's `cito:cites` (resolved against
 * `CONTENT_DOCUMENT_CONTEXT`'s `@base`). Without it the node and the
 * citations naming it expanded against wherever the export was served, and
 * never joined. `dcterms:source` and `dcterms:hasVersion` name assets, so they
 * are coerced to IRIs rather than read as strings.
 */
export const REFERENCE_CONTEXT = {
  "@base": FOLIO_BASE,
  dcterms: "http://purl.org/dc/terms/",
  bibo: "http://purl.org/ontology/bibo/",
  fabio: "http://purl.org/spar/fabio/",
  "dcterms:source": { "@type": "@id" },
  "dcterms:hasVersion": { "@type": "@id" },
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

// ── Reference → Dublin Core XML (via 7eak's renderDcXml) ─────────────────────

/**
 * Convert a {@link ReferenceNode} to a {@link DublinCoreRecord} so it can be
 * rendered through `7eak`'s {@link renderDcXml}.
 */
export function referenceToDublinCoreRecord(ref: ReferenceNode): DublinCoreRecord {
  const fields: DcField[] = [];
  const lang = ref.language;
  const push = (element: string, qualifier: string | undefined, values: (string | undefined)[], tagged = false) => {
    const clean = values.map((v) => v?.trim()).filter((v): v is string => !!v);
    if (!clean.length) return;
    fields.push({
      schema: "dc",
      element,
      ...(qualifier ? { qualifier } : {}),
      values: clean.map((value) => (tagged && lang ? { value, language: lang } : { value })),
    });
  };
  push("title", undefined, [ref.title ?? ref.id], true);
  push("contributor", "author", (ref.author ?? []).map(nameText));
  push("contributor", undefined, (ref.editor ?? []).map(nameText));
  push("date", "issued", [dateText(ref)]);
  push("publisher", undefined, [ref.publisher]);
  push("relation", undefined, [ref["container-title"]]);
  push("identifier", "doi", [ref.DOI]);
  push("identifier", "isbn", [ref.ISBN]);
  push("identifier", "uri", [ref.URL ?? (ref.DOI ? `https://doi.org/${ref.DOI}` : undefined)]);
  push("language", "iso", [ref.language]);
  push("description", "abstract", [ref.abstract], true);
  push("type", undefined, [ref.type]);
  return {
    $schema: DUBLIN_CORE_SCHEMA_TAG,
    id: ref.id,
    fields,
    provenance: {
      source: ref.derivedFrom ?? referenceIri(ref.id),
      retrievedAt: dateText(ref) ?? "1970-01-01",
      method: ref.provenance ?? "authored",
    },
  };
}

/**
 * Dublin Core XML export (`references.dc.xml`), reusing `7eak`'s
 * {@link renderDcXml}. A single reference renders as one `<metadata>` document;
 * multiple references render as `<records>` wrapping each record's `<metadata>`.
 */
export function toDublinCoreXml(refs: readonly ReferenceNode[]): string {
  if (refs.length === 1) return renderDcXml(referenceToDublinCoreRecord(refs[0]!));
  const body = refs
    .map((r) => {
      const xml = renderDcXml(referenceToDublinCoreRecord(r))
        .replace(/^<\?xml[^?]*\?>\n/, "")
        .trimEnd();
      return xml
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
    })
    .join("\n");
  const head = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<records xmlns="${DSPACE_NS}"`,
    `    xmlns:dc="${DC_ELEMENTS_NS}"`,
    `    xmlns:dcterms="${DCTERMS_NS}"`,
    `    xmlns:xsi="${XSI_NS}">`,
  ];
  return `${[...head, ...(body ? [body] : []), "</records>"].join("\n")}\n`;
}

// ── Library items → Reference nodes ──────────────────────────────────────────

const ORG_KEYWORDS = /\b(organization|organisation|institute|university|consortium|commission|committee|ministry|department|agency|association|council|society|group|collaboration|foundation|press|bureau|center|centre)\b/i;

function oneAuthorToCslName(part: string): CslName {
  const s = part.trim().replace(/\s+/g, " ");
  if (!s) return { literal: s };
  if (ORG_KEYWORDS.test(s)) return { literal: s };
  if (s.includes(",")) return dcCreatorToName(s);
  const tokens = s.split(" ");
  if (tokens.length === 1) return { family: tokens[0]! };
  const family = tokens[tokens.length - 1]!;
  const given = tokens.slice(0, -1).join(" ");
  return { family, given };
}

/**
 * Parse an `authors_raw` string (from library document structure or PDF
 * `docinfo.Author`) into CSL-JSON author objects.
 */
export function authorsRawToNames(raw: string): CslName[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  if (ORG_KEYWORDS.test(cleaned) && !cleaned.includes(";") && !/\band\b/i.test(cleaned)) {
    return [{ literal: cleaned }];
  }
  const chunks = cleaned.includes(";")
    ? cleaned.split(";")
    : /,/.test(cleaned) && !/\band\b/i.test(cleaned) && cleaned.split(",").length > 2
      ? cleaned.split(",")
      : cleaned.split(/\s*,?\s+\band\b\s+|\s*&\s*/i);
  const out: CslName[] = [];
  for (const chunk of chunks) {
    // Handle "A. Einstein, B. Podolsky" before the final "and N. Rosen"
    if (!cleaned.includes(";") && chunk.includes(",") && /\b[A-Z]\.\s*[A-Z]/.test(chunk)) {
      for (const sub of chunk.split(",")) {
        const t = sub.trim();
        if (t) out.push(oneAuthorToCslName(t));
      }
    } else {
      const t = chunk.trim();
      if (t) out.push(oneAuthorToCslName(t));
    }
  }
  return out;
}

/**
 * Project a library item directory (`library/<slug>/manifest.jsonld` +
 * document structure metadata) to a {@link ReferenceNode} with
 * `provenance: "library"`.
 */
export function libraryItemToReference(
  entryDir: string,
  opts: { key?: string; derivedFrom?: string; heldAt?: string } = {},
): ReferenceNode {
  const manifestPath = join(entryDir, "manifest.jsonld");
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    } catch {
      manifest = {};
    }
  }
  const structRes = readStructure(entryDir);
  const structure = "reason" in structRes ? undefined : structRes;
  const meta = (structure?.raw.metadata ?? {}) as {
    title?: string | null;
    title_correction?: { title?: string };
    authors_raw?: string | null;
    abstract?: string | null;
    doi?: string | null;
    arxiv?: string | { id?: string | null; date?: string | null } | null;
    docinfo?: Record<string, unknown>;
  };
  const docinfo = (meta.docinfo ?? {}) as Record<string, unknown>;
  const docinfoStr = (k: string): string | undefined =>
    typeof docinfo[k] === "string" && (docinfo[k] as string).trim() ? (docinfo[k] as string).trim() : undefined;

  const rawKey =
    opts.key ??
    (typeof manifest.docId === "string" && manifest.docId.trim()
      ? manifest.docId.trim()
      : structure?.doc_id?.trim() || basename(entryDir));
  const key = rawKey.replace(/[^A-Za-z0-9._:+-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "library-item";

  const title =
    (meta.title_correction?.title?.trim() || undefined) ??
    (structure?.title?.trim() || undefined) ??
    (typeof manifest.title === "string" && manifest.title.trim() ? manifest.title.trim() : undefined) ??
    (typeof manifest["dcterms:title"] === "string" && (manifest["dcterms:title"] as string).trim()
      ? (manifest["dcterms:title"] as string).trim()
      : undefined) ??
    docinfoStr("Title");

  const authorsRaw = (typeof meta.authors_raw === "string" ? meta.authors_raw.trim() : "") || docinfoStr("Author") || "";
  const author = authorsRaw ? authorsRawToNames(authorsRaw) : undefined;

  const doi = typeof meta.doi === "string" && meta.doi.trim() ? meta.doi.trim() : undefined;
  const arxivObj = meta.arxiv;
  const arxivId =
    typeof arxivObj === "string"
      ? arxivObj.trim() || undefined
      : typeof arxivObj?.id === "string" && arxivObj.id.trim()
        ? arxivObj.id.trim()
        : undefined;
  const arxivDate =
    typeof arxivObj === "object" && arxivObj !== null && typeof arxivObj.date === "string" && arxivObj.date.trim()
      ? arxivObj.date.trim()
      : undefined;
  const sourceUrl =
    (typeof manifest.sourceUrl === "string" && manifest.sourceUrl.trim() ? manifest.sourceUrl.trim() : undefined) ??
    (arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined) ??
    (doi ? `https://doi.org/${doi}` : undefined);

  const dateCandidate =
    arxivDate ||
    docinfoStr("CreationDate")?.slice(0, 10) ||
    (typeof manifest.ingestedAt === "string" ? manifest.ingestedAt.slice(0, 10) : undefined) ||
    (/\b((?:19|20)\d{2})\b/.exec(key)?.[1] ?? undefined);

  const ref: ReferenceNode = {
    $schema: REFERENCE_SCHEMA_TAG,
    id: key,
    type: arxivId || doi ? "article-journal" : "document",
    provenance: "library",
  };
  if (title) ref.title = title;
  if (author?.length) ref.author = author;
  if (dateCandidate) ref.issued = dcDateToCsl(dateCandidate);
  if (doi) ref.DOI = doi;
  if (sourceUrl) ref.URL = sourceUrl;
  if (typeof meta.abstract === "string" && meta.abstract.trim()) ref.abstract = meta.abstract.trim();
  if (arxivId) (ref as Record<string, unknown>).note = `arXiv:${arxivId}`;
  if (opts.derivedFrom) ref.derivedFrom = opts.derivedFrom;
  if (opts.heldAt) ref.heldAt = opts.heldAt;
  return ReferenceNodeSchema.parse(ref);
}

// ── gen-reference-jsonld: CSL-JSON → references/<key>.jsonld ─────────────────

/**
 * Convert a {@link ReferenceEntry} (from a `.json` file or `schema/references.ts`
 * `ref({…})` call) to a validated {@link ReferenceNode}.
 */
export function referenceEntryToNode(entry: ReferenceEntry): ReferenceNode {
  if (entry.kind === "file") {
    const raw = { ...entry.data };
    if (!raw.$schema) raw.$schema = REFERENCE_SCHEMA_TAG;
    if (!raw.type) raw.type = "document";
    return ReferenceNodeSchema.parse(raw);
  }
  const type = stringField(entry, "type") ?? "article";
  const title = stringField(entry, "title");
  const containerTitle = stringField(entry, "container-title");
  const publisher = stringField(entry, "publisher");
  const volume = stringField(entry, "volume");
  const issue = stringField(entry, "issue");
  const page = stringField(entry, "page");
  const DOI = stringField(entry, "DOI");
  const ISBN = stringField(entry, "ISBN");
  const URL = stringField(entry, "URL");
  const note = stringField(entry, "note");
  const year = issuedYear(entry);
  const fams = authorNames(entry);
  const ref: Record<string, unknown> = {
    $schema: REFERENCE_SCHEMA_TAG,
    id: entry.id,
    type,
    provenance: "authored",
  };
  if (title) ref.title = title;
  if (fams.length) ref.author = fams.map((f) => ({ family: f }));
  if (year) ref.issued = { "date-parts": [[Number(year)]] };
  if (containerTitle) ref["container-title"] = containerTitle;
  if (publisher) ref.publisher = publisher;
  if (volume) ref.volume = volume;
  if (issue) ref.issue = issue;
  if (page) ref.page = page;
  if (DOI) ref.DOI = DOI;
  if (ISBN) ref.ISBN = ISBN;
  if (URL) ref.URL = URL;
  if (note) ref.note = note;
  return ReferenceNodeSchema.parse(ref);
}

/**
 * Generate (or check with `{ check: true }`) `references/<key>.jsonld` files
 * from a folio's CSL-JSON bibliography (per-entry `references/<key>.json` files
 * and/or `<folio>/schema/references.ts`).
 */
export function genReferenceJsonLd(
  repoRoot: string,
  opts: { outDir?: string; check?: boolean } = {},
): { written: string[]; stale: string[] } {
  const entries = referenceEntries(repoRoot).filter((e) => !e.file.endsWith(".jsonld"));
  const targetDir = opts.outDir ?? referenceDirs(repoRoot)[0] ?? join(repoRoot, "references");
  const written: string[] = [];
  const stale: string[] = [];
  if (!opts.check && entries.length > 0) {
    mkdirSync(targetDir, { recursive: true });
  }
  for (const e of entries) {
    const node = referenceEntryToNode(e);
    const jsonld = `${JSON.stringify(referenceToJsonLd(node), null, 2)}\n`;
    const outPath = join(targetDir, `${node.id}.jsonld`);
    if (opts.check) {
      if (!existsSync(outPath) || readFileSync(outPath, "utf-8") !== jsonld) {
        stale.push(outPath);
      }
    } else {
      writeFileSync(outPath, jsonld);
      written.push(outPath);
    }
  }
  return { written, stale };
}
