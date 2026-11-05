#!/usr/bin/env bun
/**
 * document-export — the publication pipeline's file outputs for a document
 * folio: the line-numbered PUBLIC-COMMENT PDF and the OFFLINE-EDITING .docx,
 * both stamped with the commit they were built from.
 *
 *   bun run folio-assistant-core/scripts/document-export.ts <release|pdf|docx> --document <slug>
 *       [--repo <folio root>] [--out build/export] [--date YYYY-MM-DD] [--release <id>] [--allow-dirty]
 *
 * ## One source, two files that agree
 *
 *   folio/<slug>/**  →  buildDocumentMarkdown (the same assembly document_render_md writes)
 *                    →  pandoc + document-export.lua      one Word bookmark per chapter, section, block
 *                    →  docx-offline.py finish            Word line numbering; Track Changes on (offline copy)
 *                    →  soffice --convert-to pdf          the PDF is the .docx, laid out
 *
 * The PDF is rendered FROM the .docx rather than from the site's HTML, so
 * the two carry the same pages and the same line numbers: a comment citing
 * "p. 22, l. 618" means the same words in either, and `pdf-line-map.py`
 * reads the PDF back exactly as it reads a Word-made review PDF. No TeX, as
 * a document folio requires (skill `document-publishing`).
 *
 * ## Outputs (in --out)
 *
 *   <slug>-public-comment-<sha7>-<date>.pdf    the frozen, line-numbered review draft
 *   <slug>-public-comment-<sha7>-<date>.docx   the same draft as Word (its sha256 goes in the release references)
 *   <slug>-offline-<sha7>.docx                 the editing copy: Track Changes on, one bookmark per block
 *   <slug>-export-<sha7>.json                  `document-export/v1`: commit, date, tools, and per file
 *                                              sha256, bytes, pages, lines, bookmarks
 *
 * Every file carries custom properties `folio-source-commit`,
 * `folio-document`, `folio-export-date` (and `folio-release`), which
 * `docx-offline.py changes` reads to merge an edited copy back.
 *
 * SVG figures are rasterised to PNG by LibreOffice first (see
 * `rasterizeSvgImages`): embedded as SVG, they vanish from the PDF.
 *
 * ## Reproducible
 *
 * The date defaults to the COMMIT's date and `SOURCE_DATE_EPOCH` to its
 * time, so two runs at one commit give the same .docx bytes. The PDF differs
 * only in the creation timestamp LibreOffice embeds. A working tree with
 * uncommitted changes under `folio/` is refused (the stamp would name a
 * commit the file does not come from) unless `--allow-dirty`, which marks the
 * stamp `-dirty`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HERE = import.meta.dir;
export const LUA_FILTER = join(HERE, "document-export.lua");
export const DOCX_OFFLINE = join(HERE, "docx-offline.py");

export type ExportKind = "release" | "pdf" | "docx";

export interface ExportOptions {
  repo: string;
  document: string;
  out: string;
  kind: ExportKind;
  date?: string;
  release?: string;
  allowDirty?: boolean;
  /** Override the commit (tests); defaults to `git rev-parse HEAD`. */
  commit?: string;
}

export interface ExportedFile {
  kind: "pdf" | "review-docx" | "offline-docx";
  file: string;
  sha256: string;
  bytes: number;
  bookmarks?: number;
  pages?: number;
  lines?: number;
}

export interface ExportManifest {
  $schema: "document-export/v1";
  document: string;
  title: string;
  commit: string;
  dirty: boolean;
  commitDate: string;
  date: string;
  release?: string;
  blocks: number;
  tools: Record<string, string>;
  files: ExportedFile[];
}

/** The file names one export writes, from the stamp alone. */
export function exportNames(slug: string, sha: string, date: string) {
  const s = sha.slice(0, 7) + (sha.endsWith("-dirty") ? "-dirty" : "");
  return {
    pdf: `${slug}-public-comment-${s}-${date}.pdf`,
    reviewDocx: `${slug}-public-comment-${s}-${date}.docx`,
    offlineDocx: `${slug}-offline-${s}.docx`,
    manifest: `${slug}-export-${s}.json`,
  };
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): string {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: "pipe", timeout: opts.timeout ?? 300_000 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … failed (exit ${r.status}):\n${r.stderr.toString().slice(-2000)}`);
  }
  return r.stdout.toString();
}

function has(cmd: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "pipe" }).status === 0;
}

/**
 * Every SVG image in the assembly, rasterised to PNG (at twice its size, for
 * print) and the Markdown pointed at the PNG. pandoc embeds an SVG in the
 * .docx as-is, and LibreOffice then lays the page out WITHOUT it, silently:
 * the DIIG phase figure was simply missing from the first dth-hrh PDF. Word
 * draws SVG only from 2016 on. LibreOffice is already required, so it does
 * the rasterising and no new tool is needed.
 */
export function rasterizeSvgImages(markdown: string, imageDirs: string[], work: string, env: NodeJS.ProcessEnv): { markdown: string; converted: number } {
  const refs = new Map<string, string>(); // ref as written → absolute svg
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+\.svg)\)/g)) {
    const src = imageDirs.map((d) => join(d, m[1])).find(existsSync);
    if (src) refs.set(m[1], src);
  }
  if (refs.size === 0) return { markdown, converted: 0 };
  const dir = join(work, "svg");
  mkdirSync(dir, { recursive: true });
  const staged: string[] = [];
  let n = 0;
  const target = new Map<string, string>();
  const used = new Set<string>();
  for (const [ref, src] of refs) {
    // named after the figure, and referenced RELATIVE to `work` (on pandoc's
    // resource path): pandoc writes the path into the picture's `descr`, and
    // a temp-dir name there would make every export's bytes differ.
    let base = (ref.split("/").pop() ?? "figure").replace(/\.svg$/, "").replace(/[^A-Za-z0-9_-]/g, "-");
    while (used.has(base)) base = `${base}-${n++}`;
    used.add(base);
    const svg = readFileSync(src, "utf-8").replace(/<svg\b[^>]*>/, (tag) =>
      tag.replace(/\b(width|height)="(\d+(?:\.\d+)?)(px)?"/g, (_m, k: string, v: string) => `${k}="${Number(v) * 2}"`));
    writeFileSync(join(dir, `${base}.svg`), svg);
    staged.push(join(dir, `${base}.svg`));
    target.set(ref, `svg/${base}.png`);
  }
  run("soffice", [`-env:UserInstallation=file://${join(work, "lo-profile")}`, "--headless", "--convert-to", "png", "--outdir", dir, ...staged], { env, timeout: 600_000 });
  let converted = 0;
  const out = markdown.replace(/(!\[[^\]]*\]\()([^)\s]+\.svg)(\))/g, (whole, a: string, ref: string, b: string) => {
    const png = target.get(ref);
    if (!png || !existsSync(join(work, png))) return whole;
    converted++;
    return `${a}${png}${b}`;
  });
  return { markdown: out, converted };
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Page count and highest gutter line number of a line-numbered PDF. */
export function pdfFacts(pdf: string): { pages: number; lines: number } {
  const info = run("pdfinfo", [pdf]);
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
  const text = run("pdftotext", ["-layout", pdf, "-"]);
  let lines = 0;
  for (const m of text.matchAll(/^\s{0,12}(\d{1,6})\s{2,}\S/gm)) lines = Math.max(lines, Number(m[1]));
  return { pages, lines };
}

export async function exportDocument(o: ExportOptions): Promise<ExportManifest> {
  const repo = resolve(o.repo);
  const manifestPath = join(repo, "folio", o.document, `${o.document}.ts`);
  if (!/^[A-Za-z0-9_-]+$/.test(o.document) || !existsSync(manifestPath)) {
    throw new Error(`no document manifest folio/${o.document}/${o.document}.ts in ${repo}`);
  }
  for (const tool of ["pandoc", "python3", ...(o.kind === "docx" ? [] : ["soffice", "pdfinfo", "pdftotext"])]) {
    if (!has(tool)) throw new Error(`${tool} is not installed (needed for '${o.kind}'). No fallback: a document folio publishes without TeX.`);
  }

  // ── the stamp ──
  let commit = o.commit ?? run("git", ["-C", repo, "rev-parse", "HEAD"]).trim();
  const dirtyFiles = o.commit ? "" : run("git", ["-C", repo, "status", "--porcelain", "--", "folio"]).trim();
  const dirty = dirtyFiles !== "";
  if (dirty && !o.allowDirty) {
    throw new Error(`uncommitted changes under folio/ — the export would be stamped ${commit.slice(0, 7)} without coming from it. Commit first, or pass --allow-dirty.\n${dirtyFiles}`);
  }
  if (dirty) commit += "-dirty";
  const epoch = o.commit ? "315532800" : run("git", ["-C", repo, "log", "-1", "--format=%ct", "HEAD"]).trim();
  const commitDate = new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  const date = o.date ?? commitDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date ${date}: expected YYYY-MM-DD`);
  const names = exportNames(o.document, commit, date);

  // ── assemble ──
  const { buildDocumentMarkdown } = await import("@litlfred/cat-harness-tools/pipeline/render-markdown.js");
  const assembled = await buildDocumentMarkdown(manifestPath);
  const errors = assembled.issues.filter((i: { level: string }) => i.level === "error");
  if (errors.length) throw new Error(`assembly failed:\n${errors.map((e: { message: string }) => `  ${e.message}`).join("\n")}`);
  const title = /^#\s+(.+)$/m.exec(assembled.markdown)?.[1]?.trim() ?? o.document;

  mkdirSync(o.out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "document-export-"));
  const env = { ...process.env, SOURCE_DATE_EPOCH: epoch };
  const files: ExportedFile[] = [];
  try {
    const md = join(work, `${o.document}.md`);
    const images = has("soffice")
      ? rasterizeSvgImages(assembled.markdown, [join(repo, "folio", o.document), repo], work, env)
      : { markdown: assembled.markdown, converted: 0 };
    writeFileSync(md, images.markdown, "utf-8");
    const short = commit.slice(0, 7) + (dirty ? "-dirty" : "");
    // Metadata through a UTF-8 file, not -M: pandoc decodes arguments in the
    // process locale, and a C locale turns "—" into mojibake.
    let metaFiles = 0;
    const meta = (subtitle: string) => {
      const path = join(work, `meta-${metaFiles++}.json`);
      writeFileSync(path, JSON.stringify({
        subtitle, date,
        "folio-source-commit": commit,
        "folio-document": o.document,
        "folio-export-date": date,
        ...(o.release ? { "folio-release": o.release } : {}),
      }), "utf-8");
      return ["--metadata-file", path];
    };
    const pandoc = (out: string, subtitle: string) => run("pandoc", [
      md, "-o", out,
      "--from", "gfm-gfm_auto_identifiers+raw_html",
      "--shift-heading-level-by=-1",
      "--lua-filter", LUA_FILTER,
      `--resource-path=${work}:${join(repo, "folio", o.document)}:${repo}`,
      ...meta(subtitle),
    ], { cwd: repo, env });
    const finish = (src: string, out: string, flags: string[]) =>
      JSON.parse(run("python3", ["-I", DOCX_OFFLINE, "finish", src, "--out", out, "--epoch", epoch, ...flags], { env }));

    if (o.kind !== "docx") {
      const raw = join(work, "review.raw.docx");
      pandoc(raw, `Draft for public comment${o.release ? ` (${o.release})` : ""} — source ${short}, ${date}. Cite page and line numbers.`);
      const reviewDocx = join(o.out, names.reviewDocx);
      const f = finish(raw, reviewDocx, ["--line-numbers"]);
      files.push({ kind: "review-docx", file: names.reviewDocx, sha256: f.sha256, bytes: readFileSync(reviewDocx).length, bookmarks: f.bookmarks });

      // LibreOffice lays the .docx out; a private profile so parallel runs do not lock each other.
      const profile = join(work, "lo-profile");
      run("soffice", [`-env:UserInstallation=file://${profile}`, "--headless", "--convert-to", "pdf", "--outdir", work, reviewDocx], { env, timeout: 600_000 });
      const produced = join(work, names.reviewDocx.replace(/\.docx$/, ".pdf"));
      if (!existsSync(produced)) throw new Error("soffice reported success but wrote no PDF");
      const pdf = join(o.out, names.pdf);
      renameSync(produced, pdf);
      files.push({ kind: "pdf", file: names.pdf, sha256: sha256(pdf), bytes: readFileSync(pdf).length, ...pdfFacts(pdf) });
    }
    if (o.kind !== "pdf") {
      const raw = join(work, "offline.raw.docx");
      pandoc(raw, `Offline editing copy — source ${short}, ${date}. Keep Track Changes on, and return the file with every change still pending (do not accept or reject).`);
      const offline = join(o.out, names.offlineDocx);
      const f = finish(raw, offline, ["--line-numbers", "--track-changes"]);
      files.push({ kind: "offline-docx", file: names.offlineDocx, sha256: f.sha256, bytes: readFileSync(offline).length, bookmarks: f.bookmarks });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const tools: Record<string, string> = { pandoc: run("pandoc", ["--version"]).split("\n")[0] };
  if (o.kind !== "docx") tools.soffice = run("soffice", ["--version"]).trim().split("\n")[0];
  const manifest: ExportManifest = {
    $schema: "document-export/v1",
    document: o.document, title, commit, dirty, commitDate, date,
    ...(o.release ? { release: o.release } : {}),
    blocks: assembled.blockCount,
    tools, files,
  };
  writeFileSync(join(o.out, names.manifest), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const kind = args[0] as ExportKind;
  const document = opt(args, "document");
  if (!["release", "pdf", "docx"].includes(kind) || !document) {
    console.error("usage: document-export.ts <release|pdf|docx> --document <slug> [--repo .] [--out build/export] [--date YYYY-MM-DD] [--release <id>] [--allow-dirty]");
    process.exit(2);
  }
  const repo = resolve(opt(args, "repo") ?? process.cwd());
  try {
    const m = await exportDocument({
      repo, document, kind,
      out: resolve(opt(args, "out") ?? join(repo, "build", "export")),
      date: opt(args, "date"), release: opt(args, "release"),
      allowDirty: args.includes("--allow-dirty"),
    });
    console.log(`${m.title} @ ${m.commit.slice(0, 12)} (${m.date}), ${m.blocks} blocks`);
    for (const f of m.files) {
      const facts = [f.pages && `${f.pages} pages`, f.lines && `${f.lines} lines`, f.bookmarks && `${f.bookmarks} bookmarks`].filter(Boolean).join(", ");
      console.log(`  ${f.kind.padEnd(13)} ${f.file}  ${(f.bytes / 1024).toFixed(0)} KB  ${facts}  sha256 ${f.sha256.slice(0, 12)}`);
    }
  } catch (e) {
    console.error(`document-export: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
