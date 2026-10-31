/**
 * The review sheet's Apps Script, and one document's Config tab for it.
 *
 * Owner, 2026-10-31 (option C): ONE generic script for every document. It is
 * `review-sheet.gs` as is, stamped with its commit and made plain ASCII
 * (`--script`). What differs per document is written into the sheet's Config
 * tab, visible and locked to the owner, as rows of JSON (`--config`), read
 * here from the folio:
 *
 * - `review/public-comment/sheet-sync.json`, the folio's settings (tab and
 *   column names, the draft-PDF and comment-page link prefixes, the named
 *   sections a reviewer cites by name or abbreviation);
 * - the review anchors (`review-anchors.json`): each section's number, title
 *   and page in the frozen review draft;
 * - the review draft's `pdf-line-map.json`: which draft lines sit on which PDF
 *   page, and the printed-to-PDF page offset.
 *
 *   bun run folio-assistant-core/tools/review-sheet-sync/build-review-sheet-script.ts \
 *     [--script Code.gs] [--repo . --config review/public-comment/sheet-sync.json --out config-rows.json]
 *
 * Skill: `review-sheet-script`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/** The folio-assistant-core commit this template comes from, for the header stamp. */
function templateCommit(dir: string): string {
  try {
    const sha = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["-C", dir, "status", "--porcelain", "--", "."], { encoding: "utf8" }).trim();
    return sha + (dirty ? " (with local changes)" : "");
  } catch {
    return "unknown";
  }
}

type Section = { label: string; title?: string; number?: string; page?: number };
type Chapter = { dir: string; title: string; number?: number };
type Block = { page?: number; printedPage?: string; sections: string[] };
type Anchors = { chapters: Chapter[]; sections: Section[]; blocks: Block[] };
type DraftSection = Section & { chapter?: string };
type LineMap = { pages: Record<string, { printed: string | null; lines?: Record<string, string> }> };

export type SheetSyncConfig = {
  /**
   * `public-comment` (default): the RPC/RCS/Agent tabs over a frozen review
   * PDF. `drafting`: one Contributor Feedback tab, each row one change set,
   * whose Sections pick from the live document's table of contents.
   */
  mode?: "public-comment" | "drafting";
  /** The Google Sheet's id. When set, the script refuses to run in any other spreadsheet. */
  sheet?: string;
  /** Review anchors, repository-relative. */
  anchors: string;
  /** The frozen review draft's pdf-line-map.json, repository-relative (public-comment). */
  lineMap?: string;
  /** Prefix a PDF page number is appended to, e.g. `<site>/draft/#page=` (public-comment). */
  draftUrl?: string;
  /** Prefix a comment ref (`PC-0002`) is appended to (public-comment). */
  commentUrl?: string;
  /** Prefix a section's anchor (`sec:1-1`, `chap:<dir>`) is appended to, e.g. `<site>/en/<doc>/#` (drafting). */
  sectionUrl?: string;
  /** Sections cited by name: abbreviation -> section title. */
  namedSections?: Record<string, string>;
  /** Other names for front-matter chapters: alias -> chapter title. */
  aliases?: Record<string, string>;
  tabs?: Partial<{ RPC: string; RCS: string; AGENT: string; FEEDBACK: string; TOC: string }>;
  columns?: Partial<{ rpc: Record<string, string>; rcs: Record<string, string>; agent: Record<string, string>; draft: Record<string, string>; draftAgent: Record<string, string> }>;
};

/** Drafting mode's tabs and headers. */
export const DRAFT_TABS = { FEEDBACK: "Contributor Feedback", AGENT: "Agent", TOC: "TOC" };
export const DRAFT_COLUMNS = {
  draft: {
    cs: "Change-set", title: "Title", sections: "Selected Sections", sectionLinks: "Section links", feedback: "Contributor Feedback",
    issue: "Issue", agentic: "Agentic status", staging: "Staging review page",
  },
  draftAgent: {
    csId: "Change-set", issue: "Issue", agentic: "Agentic status", prs: "Pull request (change set)",
    changes: "What the PRs changed (change set)", done: "Agent completed (UTC, change set)",
    staging: "Staging review page (change set)",
  },
};

/**
 * The document's table of contents as dropdown entries: [name, anchor].
 * Names carry no commas, because a multi-select dropdown cell joins its
 * choices with ", ".
 */
export function buildToc(a: { chapters: Chapter[]; sections: DraftSection[] }): [string, string][] {
  const clean = (s: string) => s.replace(/,/g, ";").replace(/\s+/g, " ").trim();
  const out: [string, string][] = [];
  const seen = new Set<string>();
  const add = (name: string, anchor: string) => {
    name = clean(name);
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push([name, anchor]);
  };
  for (const c of a.chapters) {
    const bare = c.title.replace(/^Chapter\s+\d+\.?\s*/i, "");
    const head = c.number != null ? `Ch ${c.number}` : c.title;
    add(c.number != null ? `${head} ${bare}` : c.title, `chap:${c.dir}`);
    for (const s of a.sections.filter((x) => x.chapter === c.dir)) {
      const t = s.title ?? s.label;
      if (s.number) add(t, s.label);
      else if (t.toLowerCase() !== c.title.toLowerCase()) add(`${head} · ${t}`, s.label);
    }
  }
  return out;
}

export const DEFAULT_TABS = { RPC: "Review Public Comments", RCS: "Review Change Sets", AGENT: "Agent" };
export const DEFAULT_COLUMNS = {
  rpc: {
    no: "No.", sections: "Sections", page: "Page", lines: "Line no(s) / Table / Figure",
    comment: "Comment / issue", revision: "Suggested revision",
    feedback: "Architect Feedback (initials)", disposition: "Disposition", status: "Status",
    agentic: "Agentic status",
  },
  rcs: {
    cs: "Change-set", sections: "Sections", pages: "Pages", comments: "Public Comments",
    revisions: "Suggested Revisions", feedback: "PC Architect Feedback", dispositions: "Dispositions",
    agentic: "Agentic status",
  },
  agent: {
    no: "No.", pc: "Comment ref", agentic: "Agentic status", cs: "Change-sets",
    csId: "Change-set", prs: "Pull request (change set)", changes: "What the PRs changed (change set)",
    done: "Agent completed (UTC, change set)",
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");

/** The data the template reads: section keys, abbreviations, line pages, offset. */
export function buildData(a: Anchors, m: LineMap, cfg: SheetSyncConfig) {
  // Printed -> PDF offset: the most common difference over numbered pages.
  const diffs = new Map<number, number>();
  let max = 0;
  for (const [p, d] of Object.entries(m.pages)) {
    if (d.printed && /^\d+$/.test(d.printed)) {
      const k = +p - +d.printed;
      diffs.set(k, (diffs.get(k) ?? 0) + 1);
      max = Math.max(max, +d.printed);
    }
  }
  const offset = [...diffs].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;

  // Each section's first page: its earliest block on a page whose printed number agrees with the offset.
  const first = new Map<string, [number, number]>();
  for (const b of a.blocks) {
    if (b.page == null) continue;
    const good = /^\d+$/.test(b.printedPage ?? "") && b.page - +(b.printedPage as string) === offset ? 0 : 1;
    for (const s of b.sections) {
      const cur = first.get(s);
      if (!cur || good < cur[0] || (good === cur[0] && b.page < cur[1])) first.set(s, [good, b.page]);
    }
  }
  const secs = new Map(a.sections.map((s) => [s.label, s]));
  const lines: [number, string][] = [];
  for (const [p, d] of Object.entries(m.pages)) for (const t of Object.values(d.lines ?? {})) lines.push([+p, t.trim()]);

  // An unnumbered section's own `page` can be an estimate, so its heading is looked up in the draft itself.
  const appendixPage = (label: string) => {
    const ap = /^sec:([a-z])-/.exec(label);
    return ap ? (secs.get(`sec:${ap[1]}`)?.page ?? first.get(`sec:${ap[1]}`)?.[1] ?? 0) : 0;
  };
  const page = (label: string): number | undefined => {
    const s = secs.get(label);
    if (s && !s.number && s.title && /^sec:[a-z]-/.test(label)) {
      const t = norm(s.title).slice(0, 25);
      const from = appendixPage(label);
      const hits = lines.filter(([p, l]) => p >= from && norm(l).startsWith(t) && norm(l).length < t.length + 40).map(([p]) => p);
      if (hits.length) return Math.min(...hits);
    }
    return s?.page ?? first.get(label)?.[1];
  };

  const K: Record<string, [string, number]> = {};
  const put = (k: string, name: string, label: string) => {
    const p = page(label);
    if (p != null && first.has(label) && !(k in K)) K[k] = [name, p];
  };
  for (const s of a.sections) {
    let r = /^sec:(\d+(?:-\d+)+)$/.exec(s.label);
    if (r) { const k = r[1].replace(/-/g, "."); put(k, k, s.label); continue; }
    r = /^sec:([a-z])$/.exec(s.label);
    if (r) { put(r[1].toUpperCase(), `Appendix ${r[1].toUpperCase()}`, s.label); continue; }
    r = /^sec:([a-z](?:-\d+)+)$/.exec(s.label);
    if (r) { const k = r[1].toUpperCase().replace(/-/g, "."); put(k, k, s.label); }
  }
  const front: Record<string, [string, string]> = {};
  for (const c of a.chapters) {
    const lead = `sec:${c.dir}-lead`;
    if (c.number != null) put(`ch${c.number}`, String(c.number), lead);
    else { put(`f:${c.title.toLowerCase()}`, c.title, lead); front[c.title.toLowerCase()] = [lead, c.title]; }
  }
  for (const [alias, title] of Object.entries(cfg.aliases ?? {})) {
    const f = front[title.toLowerCase()];
    if (!f) throw new Error(`aliases: no front-matter chapter titled "${title}"`);
    put(`f:${alias.toLowerCase()}`, f[1], f[0]);
  }
  const ABBR: Record<string, string> = {};
  for (const [abbr, title] of Object.entries(cfg.namedSections ?? {})) {
    const s = a.sections.find((x) => !x.number && x.title?.toLowerCase() === title.toLowerCase());
    if (!s) throw new Error(`namedSections: no unnumbered section titled "${title}"`);
    const ap = /^sec:([a-z])-/.exec(s.label);
    put(`c:${title.toLowerCase()}`, `${ap ? ap[1].toUpperCase() + ": " : ""}${s.title}`, s.label);
    ABBR[abbr] = title.toLowerCase();
  }

  const LP: [number, number, number][] = [];
  for (const [p, d] of Object.entries(m.pages).sort((x, y) => +x[0] - +y[0])) {
    const ls = Object.keys(d.lines ?? {}).filter((x) => /^\d+$/.test(x)).map(Number);
    if (ls.length) LP.push([+p, Math.min(...ls), Math.max(...ls)]);
  }
  return { K, ABBR, LP, OFFSET: offset, MAX: max };
}

/** One document's settings for the generic script: what its Config tab holds. */
export type SheetConfig = { CFG: Record<string, string>; COLS: Record<string, Record<string, string>>; DATA: unknown };

export function buildConfig(repo: string, cfgPath: string): SheetConfig {
  const cfg: SheetSyncConfig = JSON.parse(readFileSync(join(repo, cfgPath), "utf8"));
  const a: Anchors = JSON.parse(readFileSync(join(repo, cfg.anchors), "utf8"));
  let CFG: Record<string, string>, COLS: Record<string, Record<string, string>>, data: unknown;
  if (cfg.mode === "drafting") {
    if (!cfg.sectionUrl) throw new Error(`${cfgPath}: drafting mode needs sectionUrl`);
    CFG = { MODE: "drafting", ...DRAFT_TABS, ...cfg.tabs, SECTION_URL: cfg.sectionUrl };
    COLS = {
      draft: { ...DRAFT_COLUMNS.draft, ...cfg.columns?.draft },
      draftAgent: { ...DRAFT_COLUMNS.draftAgent, ...cfg.columns?.draftAgent },
    };
    data = { TOC: buildToc(a as Anchors & { sections: DraftSection[] }) };
  } else {
    for (const k of ["lineMap", "draftUrl", "commentUrl"] as const) if (!cfg[k]) throw new Error(`${cfgPath}: needs ${k}`);
    const m: LineMap = JSON.parse(readFileSync(join(repo, cfg.lineMap as string), "utf8"));
    data = buildData(a, m, cfg);
    CFG = { MODE: "public-comment", ...DEFAULT_TABS, ...cfg.tabs, DRAFT: cfg.draftUrl as string, PC_PAGE: cfg.commentUrl as string };
    COLS = {
      rpc: { ...DEFAULT_COLUMNS.rpc, ...cfg.columns?.rpc },
      rcs: { ...DEFAULT_COLUMNS.rcs, ...cfg.columns?.rcs },
      agent: { ...DEFAULT_COLUMNS.agent, ...cfg.columns?.agent },
    };
  }
  CFG = { SOURCE: cfgPath, ...(cfg.sheet ? { SHEET: cfg.sheet } : {}), ...CFG };
  return { CFG, COLS, DATA: data };
}

/** A Sheets cell holds at most 50,000 characters; stay well under. */
const CHUNK = 40_000;

/**
 * The Config tab's rows: a header, then CFG, COLS and DATA, each as JSON with
 * a leading "|" so a sheet never reads it as a number or formula, a long
 * value continued on the next rows under the same key.
 */
export function configRows(c: SheetConfig): string[][] {
  const rows: string[][] = [["Key", "Value (JSON, written by the agent from sheet-sync.json; do not edit)"]];
  for (const key of ["CFG", "COLS", "DATA"] as const) {
    for (const chunk of chunks(readable(c[key]))) rows.push([key, "|" + chunk]);
  }
  return rows;
}

/** A cell of the Config tab holds at most this many lines, so a row stays a readable height. */
const LINES = 40;

/**
 * Indented JSON for a person to read: an object or a long array takes one
 * line per entry; a short array of plain values (a TOC pair, a column list)
 * stays on one line.
 */
export function readable(v: unknown, ind = ""): string {
  const inner = `${ind}  `;
  if (Array.isArray(v)) {
    const flat = JSON.stringify(v);
    if (v.every((x) => x === null || typeof x !== "object" || (Array.isArray(x) && x.every((y) => y === null || typeof y !== "object"))) && flat.length <= 160) return flat;
    if (!v.length) return "[]";
    return `[\n${v.map((x) => inner + readable(x, inner)).join(",\n")}\n${ind}]`;
  }
  if (v && typeof v === "object") {
    const es = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!es.length) return "{}";
    return `{\n${es.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${readable(x, inner)}`).join(",\n")}\n${ind}}`;
  }
  return JSON.stringify(v);
}

/**
 * Indented JSON in cells of at most LINES lines and CHUNK characters, cut
 * between lines so a person can read each cell (owner, 2026-10-31). Every cut
 * falls between two JSON tokens, so the script's plain concatenation still
 * parses; only a single line longer than a cell is cut inside it.
 */
export function chunks(json: string): string[] {
  const out: string[] = [];
  let cur = "";
  let n = 0;
  for (const line of json.split("\n")) {
    const add = cur ? `${cur}\n${line}` : line;
    if (add.length <= CHUNK && n < LINES) { cur = add; n++; continue; }
    if (cur) out.push(cur);
    cur = line;
    n = 1;
    while (cur.length > CHUNK) { out.push(cur.slice(0, CHUNK)); cur = cur.slice(CHUNK); }
  }
  out.push(cur);
  return out;
}

/** The one script every review sheet runs: the template, stamped with its commit. */
export function buildScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const template = readFileSync(join(here, "review-sheet.gs"), "utf8");
  return asciiOnly(template.replace("/*@@VERSION@@*/", `// folio-assistant-core tools/review-sheet-sync at ${templateCommit(here)}.`));
}

/**
 * Every non-ASCII character as a \uXXXX escape. A paste into the Apps Script
 * editor can lose them (an en dash showed as a box), and an escape means the
 * same in a string, a regex and a comment.
 */
export const asciiOnly = (s: string) =>
  s.replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

if (import.meta.main) {
  const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
  const sha = (x: string) => createHash("sha256").update(x).digest("hex");
  const script = arg("--script");
  if (script) {
    const out = buildScript();
    writeFileSync(script, out);
    console.error(`wrote ${script} (${out.length} bytes, sha256 ${sha(out)})`);
  }
  const cfg = arg("--config");
  if (cfg) {
    const repo = resolve(arg("--repo") ?? ".");
    if (!existsSync(join(repo, cfg))) {
      console.error(`no ${cfg} in ${repo}: write one first (skill review-sheet-script)`);
      process.exit(2);
    }
    const rows = `${JSON.stringify(configRows(buildConfig(repo, cfg)), null, 1)}\n`;
    const to = arg("--out");
    if (to) { writeFileSync(to, rows); console.error(`wrote ${to}: the Config tab's rows`); }
    else process.stdout.write(rows);
  }
  if (!script && !cfg) {
    console.error("usage: build-review-sheet-script.ts [--script Code.gs] [--repo <folio>] [--config review/<mode>/sheet-sync.json] [--out config-rows.json]");
    process.exit(2);
  }
}
