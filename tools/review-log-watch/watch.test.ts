import { describe, expect, test } from "bun:test";

import { issueRow, linkedIssues, sheetCells, summary, watch, type Issue } from "./watch.js";

const repo = "litlfred/dth-phc";
const header = ["Change-set", "Title", "Selected Sections", "Section links", "Contributor Feedback (initials/name)", "Contributor Feedback (initials/name)", "Disposition", "Ready for agent", "Ready for merge", "Feedback (agent)", "Issue"];
const sheet = (rows: string[][]) => [["Instructions", "…"], header, ...rows];
const row1 = ["CS-001", "Sign off exclusions", "Front matter", "", "", "", "", "", "", "Proposal …", "https://github.com/litlfred/dth-phc/issues/5"];

const issue = (n: number, extra: Partial<Issue> = {}): Issue => ({
  number: n, title: `Issue ${n}`, body: `First paragraph of ${n}.\n\nMore.`, html_url: `https://github.com/${repo}/issues/${n}`,
  updated_at: "2026-11-01T10:00:00Z", user: { login: "alice" }, labels: [], ...extra,
});

describe("review-log-watch", () => {
  test("first check: every open issue no row links is to append, pull requests and no-sheet issues left out", () => {
    const r = watch(sheet([row1]), [issue(5), issue(8), issue(9, { pull_request: {} }), issue(10, { labels: [{ name: "no-sheet" }] })], repo, undefined);
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.append.map((a) => a.issue)).toEqual([8]);
    expect(r.baseline).toBe(true);
    expect(r.changes.filter((c) => c.kind === "issue-opened").map((c) => (c as { issue: number }).issue)).toEqual([5, 8]);
  });

  test("same sheet and issues as the last check: unchanged, and no state is needed but the digest", () => {
    const values = sheet([row1]);
    const first = watch(values, [issue(5)], repo, undefined);
    if (first.status !== "changed") throw new Error("expected changed");
    expect(watch(values, [issue(5)], repo, first.state)).toEqual({ status: "unchanged", digest: first.digest });
  });

  test("an edited Ready for agent cell or an updated issue is a change; the agent's own column is not", () => {
    const first = watch(sheet([row1]), [issue(5)], repo, undefined);
    if (first.status !== "changed") throw new Error("expected changed");
    const agentEdit = [...row1]; agentEdit[9] = "New proposal";
    expect(watch(sheet([agentEdit]), [issue(5)], repo, first.state).status).toBe("unchanged");
    const ready = [...row1]; ready[7] = "Yes";
    const r = watch(sheet([ready]), [issue(5, { updated_at: "2026-11-01T10:05:00Z" })], repo, first.state);
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.changes).toEqual([
      { kind: "issue-updated", issue: 5, title: "Issue 5" },
      { kind: "cell", row: 3, header: "Ready for agent", from: "", to: "Yes" },
    ]);
  });

  test("a closed issue is reported, and the row linking it is to hide and strike through", () => {
    const first = watch(sheet([row1]), [issue(5), issue(8)], repo, undefined);
    if (first.status !== "changed") throw new Error("expected changed");
    const r = watch(sheet([row1]), [issue(5, { state: "closed", updated_at: "2026-11-01T10:20:00Z" }), issue(8)], repo, first.state);
    if (r.status !== "changed") throw new Error("expected changed");
    expect(r.changes).toEqual([{ kind: "issue-closed", issue: 5, title: "Issue 5" }]);
    expect(r.closedRows).toEqual([3]);
    const gone = watch(sheet([row1]), [issue(5)], repo, first.state);
    expect(gone.status === "changed" && gone.changes).toEqual([{ kind: "issue-closed", issue: 8 }]);
  });

  test("an existing closed issue no row links is appended as closed; an author filter leaves others' issues out", () => {
    const r = watch(sheet([row1]), [issue(5), issue(7, { state: "closed" }), issue(8, { user: { login: "bob" } })], repo, undefined, { author: "alice" });
    if (r.status !== "changed") throw new Error("expected changed");
    expect(r.append.map((a) => [a.issue, a.closed])).toEqual([[7, true]]);
  });

  test("the appended row fills Title, the first Contributor Feedback column and Issue only", () => {
    const row = issueRow(issue(8), header);
    expect(row[1]).toBe("Issue 8");
    expect(row[4]).toBe("@alice (#8): First paragraph of 8.");
    expect(row[5]).toBe("");
    expect(row[10]).toBe(`https://github.com/${repo}/issues/8`);
    expect(row.filter(Boolean).length).toBe(3);
  });

  test("links and cells are read from the header row, wherever it is", () => {
    expect([...linkedIssues(sheet([row1]), repo)]).toEqual([[5, [3]]]);
    expect(linkedIssues(sheet([row1]), "litlfred/dth-pc").size).toBe(0);
    const short = [...row1]; short[10] = "dth-phc#6, litlfred/dth-phc#7; dth-pc#9";
    expect([...linkedIssues(sheet([short]), repo).keys()]).toEqual([6, 7]);
    expect(sheetCells(sheet([row1]))).toEqual({ "3:Title": "Sign off exclusions", "3:Selected Sections": "Front matter" });
  });

  test("with the sheet script's hash, a poll needs only the Issue column", () => {
    const issuesOnly = [[], ["Issue"], ["https://github.com/litlfred/dth-phc/issues/5"]];
    const first = watch(issuesOnly, [issue(5), issue(8)], repo, undefined, { sheetHash: "abc" });
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.append.map((a) => [a.issue, a.row])).toEqual([[8, [`https://github.com/${repo}/issues/8`]]]);
    expect(watch(issuesOnly, [issue(5), issue(8)], repo, first.state, { sheetHash: "abc" }).status).toBe("unchanged");
    const r = watch(issuesOnly, [issue(5), issue(8)], repo, first.state, { sheetHash: "xyz" });
    expect(r.status === "changed" && r.changes).toEqual([{ kind: "cell", row: 0, header: "#hash", from: "abc", to: "xyz" }]);
  });

  test("summary skips form headings and empty answers, and cuts long text", () => {
    expect(summary("### Comment\n\n_No response_\n\n### Proposed\n\nDo this.")).toBe("Do this.");
    expect(summary("x".repeat(400)).length).toBe(300);
    expect(summary(null)).toBe("");
    expect(summary("**Content:** `dth-hrh` **Block:** `fig:x`")).toBe("Content: dth-hrh Block: fig:x");
  });
});
