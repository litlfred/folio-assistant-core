/**
 * The mechanical half of a review-log watcher: compare a drafting sheet's
 * Contributor Feedback tab and its repository's issues with the last
 * check, and say whether anything changed. It changes nothing itself: the
 * watcher agent does work only when it reports `changed`.
 *
 * Owner, 2026-11-01: "watch agents should look for new issues and update
 * google sheets with summary … should not trigger any agentic activity unless
 * a change to google sheet or issues". Q-WATCH1 B: a core tool the watcher
 * runs on each poll. Q-WATCH2 B: each issue no row links gets a
 * Contributor Feedback row. Owner, 10:18Z: "current google sheets should be
 * reviewed to add in existing issues. if issue is closed it correpsonds to
 * hidden row that text has line through it/hidden".
 *
 * Skill: `review-log-watch`. Process: `processes/content/review-log-watch.bpmn`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

import { hashOf } from "../review-sheet-sync/feedback-issue.js";

export type Issue = {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  updated_at: string;
  /** The issues API's state; absent counts as open. */
  state?: "open" | "closed";
  user?: { login: string } | null;
  labels?: ({ name: string } | string)[];
  pull_request?: unknown;
};

export type WatchState = {
  /** One hash of everything below, so "unchanged" is one comparison. */
  digest: string;
  /** Issue number → "open|<updated_at>" or "closed|<updated_at>". */
  issues: Record<string, string>;
  /** "row:Header" → cell text, for the cells a person or the script sets. */
  cells: Record<string, string>;
};

export type Change =
  | { kind: "issue-opened" | "issue-updated" | "issue-closed"; issue: number; title?: string }
  | { kind: "cell"; row: number; header: string; from: string; to: string };

/** A row to append. A closed issue's row is appended hidden, its text struck through. */
export type AppendRow = { issue: number; url: string; closed: boolean; row: string[] };

export type WatchResult =
  | { status: "unchanged"; digest: string }
  | {
      status: "changed"; digest: string; changes: Change[]; append: AppendRow[];
      /** Sheet rows (1-based) linking a closed issue: hide them and strike their text through. */
      closedRows: number[];
      state: WatchState;
    };

/** The headers whose cells wake the agent: what people (Blue, Orange) set. */
export function watchedHeader(h: string): boolean {
  return (
    h === "Title" || h === "Selected Sections" || h === "Disposition" ||
    h === "Ready for agent" || h === "Ready for merge" || h === "Dispositions confirmed" ||
    (h.startsWith("Contributor Feedback") && h !== "Contributor Feedback (agent)")
  );
}

/** The header row: the first row whose first cell is `Change-set`. */
export function headerIndex(values: string[][]): number {
  return values.findIndex((r) => String(r[0] ?? "").trim() === "Change-set");
}

/** The watched cells, keyed by sheet row (1-based) and header. Empty cells are left out. */
export function sheetCells(values: string[][]): Record<string, string> {
  const hi = headerIndex(values);
  if (hi < 0) return {};
  const header = values[hi].map((h) => String(h ?? "").trim());
  const out: Record<string, string> = {};
  for (let r = hi + 1; r < values.length; r++) {
    header.forEach((h, c) => {
      const v = String(values[r][c] ?? "").trim();
      if (v && watchedHeader(h)) out[`${r + 1}:${h}`] = v;
    });
  }
  return out;
}

/** Issue numbers the sheet already links, from the Issue column (any `/issues/N` URL of the repo), each with its sheet rows (1-based). */
export function linkedIssues(values: string[][], repo: string): Map<number, number[]> {
  const hi = headerIndex(values);
  const out = new Map<number, number[]>();
  if (hi < 0) return out;
  const col = values[hi].findIndex((h) => String(h ?? "").trim() === "Issue");
  if (col < 0) return out;
  const re = new RegExp(`github\\.com/${repo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/issues/(\\d+)`, "gi");
  for (let r = hi + 1; r < values.length; r++) {
    for (const m of String(values[r][col] ?? "").matchAll(re)) {
      const n = Number(m[1]);
      out.set(n, [...(out.get(n) ?? []), r + 1]);
    }
  }
  return out;
}

const labelNames = (i: Issue) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));

/** The issue's first paragraph, without form headings, cut to `max` characters. */
export function summary(body: string | null | undefined, max = 300): string {
  const text = String(body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s.*$/gm, "").replace(/\s+/g, " ").trim())
    .find((p) => p && p !== "_No response_") ?? "";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/**
 * The Contributor Feedback row for an issue, aligned to the header: Title is
 * the issue's title, the first Contributor Feedback column "@login (#N): the
 * first paragraph", Issue the issue's URL. Every other cell is empty, so the
 * script assigns the Change-set id and people keep their columns.
 */
export function issueRow(issue: Issue, header: string[]): string[] {
  const row = header.map(() => "");
  const at = (name: string) => header.findIndex((h) => h.trim() === name);
  const fb = header.findIndex((h) => h.trim().startsWith("Contributor Feedback") && h.trim() !== "Contributor Feedback (agent)");
  if (at("Title") >= 0) row[at("Title")] = issue.title;
  if (fb >= 0) row[fb] = `@${issue.user?.login ?? "unknown"} (#${issue.number}): ${summary(issue.body)}`.trimEnd();
  if (at("Issue") >= 0) row[at("Issue")] = issue.html_url;
  return row;
}

export function digestOf(issues: Record<string, string>, cells: Record<string, string>): string {
  const lines = [
    ...Object.keys(issues).sort().map((k) => `i${k}=${issues[k]}`),
    ...Object.keys(cells).sort().map((k) => `c${k}=${cells[k]}`),
  ];
  return hashOf(lines.join("\n"));
}

export type WatchOptions = { skipLabel?: string; author?: string };

const isClosed = (i: Issue) => i.state === "closed";

/**
 * Compare this check with the last one, over the repository's open AND
 * closed issues. Pull requests are left out (the issues API lists them too),
 * and so are issues with the `skipLabel` and, when `author` is given, issues
 * someone else opened.
 */
export function watch(
  values: string[][],
  issues: Issue[],
  repo: string,
  prev: WatchState | undefined,
  opts: WatchOptions = {},
): WatchResult {
  const skipLabel = opts.skipLabel ?? "no-sheet";
  const tracked = issues.filter((i) =>
    !i.pull_request && !labelNames(i).includes(skipLabel) && (!opts.author || i.user?.login === opts.author));
  const issueMap: Record<string, string> = {};
  for (const i of tracked) issueMap[String(i.number)] = `${isClosed(i) ? "closed" : "open"}|${i.updated_at}`;
  const cells = sheetCells(values);
  const digest = digestOf(issueMap, cells);
  if (prev && prev.digest === digest) return { status: "unchanged", digest };

  const changes: Change[] = [];
  const before = prev?.issues ?? {};
  for (const i of tracked) {
    const was = before[String(i.number)];
    const now = issueMap[String(i.number)];
    if (was === now) continue;
    const closedNow = isClosed(i);
    const closedBefore = was?.startsWith("closed|");
    const kind = closedNow && !closedBefore ? "issue-closed" : was === undefined ? "issue-opened" : "issue-updated";
    changes.push({ kind, issue: i.number, title: i.title });
  }
  // Gone from the list: deleted, transferred, labelled no-sheet, or out of the author filter.
  for (const n of Object.keys(before)) if (!(n in issueMap)) changes.push({ kind: "issue-closed", issue: Number(n) });
  const oldCells = prev?.cells ?? {};
  for (const k of new Set([...Object.keys(oldCells), ...Object.keys(cells)])) {
    if ((oldCells[k] ?? "") === (cells[k] ?? "")) continue;
    const at = k.indexOf(":");
    changes.push({ kind: "cell", row: Number(k.slice(0, at)), header: k.slice(at + 1), from: oldCells[k] ?? "", to: cells[k] ?? "" });
  }

  const hi = headerIndex(values);
  const header = hi < 0 ? [] : values[hi].map((h) => String(h ?? ""));
  const linked = linkedIssues(values, repo);
  const append = hi < 0 ? [] : tracked
    .filter((i) => !linked.has(i.number))
    .sort((a, b) => a.number - b.number)
    .map((i) => ({ issue: i.number, url: i.html_url, closed: isClosed(i), row: issueRow(i, header) }));
  const closedRows = tracked
    .filter(isClosed)
    .flatMap((i) => linked.get(i.number) ?? [])
    .sort((a, b) => a - b);

  return { status: "changed", digest, changes, append, closedRows, state: { digest, issues: issueMap, cells } };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fetchIssues(repo: string): Issue[] {
  const out = execFileSync("gh", ["api", "--paginate", `repos/${repo}/issues?state=all&per_page=100`], { encoding: "utf8" });
  // --paginate concatenates one JSON array per page.
  return JSON.parse(`[${out.trim().replace(/\]\s*\[/g, "],[")}]`).flat();
}

if (import.meta.main) {
  const repo = arg("repo");
  const sheet = arg("sheet");
  const statePath = arg("state");
  if (!repo || !sheet || !statePath) {
    console.error("usage: watch.ts --repo owner/name --sheet values.json --state state.json [--issues issues.json] [--skip-label no-sheet] [--author login] [--accept]");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(sheet, "utf8"));
  const values: string[][] = Array.isArray(raw) ? raw : raw.values ?? [];
  const issues: Issue[] = arg("issues") ? JSON.parse(readFileSync(arg("issues")!, "utf8")) : fetchIssues(repo);
  const prev: WatchState | undefined = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
  const result = watch(values, issues, repo, prev, { skipLabel: arg("skip-label"), author: arg("author") });
  if (result.status === "changed" && process.argv.includes("--accept")) {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(result.state, null, 2) + "\n");
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "unchanged" ? 0 : 10);
}
