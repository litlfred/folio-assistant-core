/** agent-record: the Agent tab cells made by a tool, checked by the sheet's own check. */
import { describe, expect, test } from "bun:test";
import { dispositions, nosLabel, push } from "./agent-record.js";

const comments = [["No.", "Change-sets"], ...["126", "127", "128", "129", "130", "131", "134", "135", "136", "137", "138", "139", "326"].map((n) => [n, "CS-001"]), ["132", "CS-003"], ["133", "CS-003"]];

describe("agent-record (owner, 2026-10-31, option C)", () => {
  test("numbers are grouped as the sheet reads them", () => {
    expect(nosLabel(["136"])).toBe("No. 136");
    expect(nosLabel(["139", "127", "128", "129", "130", "131", "134", "135", "138"])).toBe("Nos. 127 to 131, 134, 135, 138 and 139");
  });
  test("the change set's numbers come from the sheet, so another change set's comments cannot slip in", () => {
    const r = dispositions({ cs: "CS-001", comments, items: [{ nos: [136, 326], word: "Accepted", why: "Done." }, { rest: true, word: "Not accepted", why: "Already reflected." }] });
    expect(r.problems).toBe("");
    expect(r.text).toBe("Nos. 136 and 326: Accepted. Done.\nNos. 126 to 131, 134, 135 and 137 to 139: Not accepted. Already reflected.");
  });
  test("the decision history is kept, in order, and new decisions are appended", () => {
    const r = dispositions({ cs: "X", nos: [1], previous: "Decided (No. 1, d): A.\nNo. 1: Noted.", decided: ["Decided (No. 1, e): B."], overall: "All.", items: [{ nos: [1], word: "Noted" }] });
    expect(r.text).toBe("Decided (No. 1, d): A.\nDecided (No. 1, e): B.\n\nOverall: All.\nNo. 1: Noted.");
  });
  test("the people's Blue word is used, and a different word is refused", () => {
    const blue = [["No.", "Disposition"], ["136", "Noted"], ["127", "Pending"]];
    expect(dispositions({ cs: "CS-001", comments, blue, items: [{ nos: [136] }, { rest: true, word: "Not accepted" }] }).text)
      .toContain("No. 136: Noted.");
    expect(dispositions({ cs: "CS-001", comments, blue, items: [{ nos: [136], word: "Accepted" }, { rest: true, word: "Not accepted" }] }).problems)
      .toBe("⚠ No. 136: Accepted here, Noted in the people's Disposition");
  });
  test("a number outside the change set, or one left out, is a problem", () => {
    expect(dispositions({ cs: "CS-001", comments, items: [{ nos: [132], word: "Noted" }] }).problems).toContain("No. 132 is not in this change set");
    expect(dispositions({ cs: "CS-001", comments, items: [{ nos: [136], word: "Accepted" }] }).problems).toMatch(/^⚠ No disposition yet for No\. 126/);
  });
  test("push takes the time from the clock and the full sha", () => {
    expect(push("e7b4094fd22055f205b52ba3c6c980b11285e228", 15, new Date("2026-10-31T15:27:40Z"))).toEqual({
      "PR head (change set)": "e7b4094fd22055f205b52ba3c6c980b11285e228",
      "Staging deploy (change set)": "building, expected 2026-10-31 15:42Z",
      "Agent completed (UTC, change set)": "2026-10-31 15:27Z",
    });
    expect(() => push("e7b4094", 15)).toThrow(/full 40-character/);
  });
});
