/**
 * `strengthFinding` over the code lists this layer actually declares, plus a
 * retired code built in the test (bean `55ao`).
 */
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadCodeLists } from "@litlfred/cat-harness/schemas/code-list.js";
import { recommendation } from "@litlfred/cat-harness/schemas/builders.js";
import { checkRecommendationStrengthResolves, RECOMMENDATION_CHECKERS, strengthFinding, strengthOf } from "./recommendation-strength.js";

const lists = loadCodeLists([join(import.meta.dir, "..", "code-lists")]);

describe("the code lists core declares", () => {
  it("are the two strength vocabularies, each a valid folio-code-list/v1", () => {
    expect([...lists.keys()].sort()).toEqual(["grade-recommendation-strength", "rfc2119-requirement-level"]);
    expect(lists.get("grade-recommendation-strength")!.codes.map((c) => c.code)).toEqual(["strong", "conditional"]);
  });
});

describe("strengthFinding", () => {
  it("a code in a declared list resolves", () => {
    expect(strengthFinding({ list: "grade-recommendation-strength", code: "conditional" }, lists)).toBeNull();
    expect(strengthFinding({ list: "rfc2119-requirement-level", code: "should-not" }, lists)).toBeNull();
  });

  it("no strength is not a finding: the field is optional", () => {
    expect(strengthFinding(undefined, lists)).toBeNull();
  });

  it("an undeclared list is named, with the lists that ARE declared", () => {
    expect(strengthFinding({ list: "grade", code: "strong" }, lists)).toMatch(/"grade".*declared: grade-recommendation-strength, rfc2119-requirement-level/);
  });

  it("a code the list does not hold is named, with the codes it does", () => {
    expect(strengthFinding({ list: "grade-recommendation-strength", code: "weak" }, lists)).toMatch(/"weak".*codes: strong, conditional/);
  });

  it("a retired code is refused as a value", () => {
    const withRetired = new Map(lists);
    const g = lists.get("grade-recommendation-strength")!;
    withRetired.set(g.id, { ...g, codes: [...g.codes, { code: "weak", label: "Weak", definition: "The earlier name for conditional.", status: "retired" }] });
    expect(strengthFinding({ list: g.id, code: "weak" }, withRetired)).toMatch(/retired/);
  });
});

describe("the recommendation builder carries strength and about", () => {
  it("validates a strength reference and the DAK link, with a folio-chosen label", () => {
    const b = recommendation({ label: "who-anc:iron-folate", title: "Iron and folic acid", strength: { list: "grade-recommendation-strength", code: "strong" }, about: ["hi:anc-supplementation"] });
    expect(b).toMatchObject({ kind: "recommendation", strength: { code: "strong" }, about: ["hi:anc-supplementation"] });
  });

  it("refuses a strength that is free text rather than a reference", () => {
    expect(() => recommendation({ label: "r:1", strength: "strong" as never })).toThrow();
  });
});


describe("the recommendation-strength-resolves checker", () => {
  const block = (body: string) => {
    const dir = mkdtempSync(join(tmpdir(), "rec-"));
    const ts = join(dir, "rec-a.ts");
    writeFileSync(ts, `export default recommendation({\n  label: "who:rec-a",\n${body}});\n`);
    return { dir, ts };
  };

  it("reads strength as text, without executing the manifest", () => {
    expect(strengthOf('x({ label: "a", strength: { list: "l", code: "c" } })')).toMatchObject({ list: "l", code: "c", line: 1 });
    expect(strengthOf('x({ label: "a" })')).toBeUndefined();
    expect(strengthOf("x({ strength: { list: L, code: \"c\" } })")).toBeNull();
    // A `strength:` inside a string or comment is not the field.
    expect(strengthOf('x({ title: "strength: { list: \\"l\\" }" }) // strength: {}')).toBeUndefined();
  });

  it("passes a code in core's lists, fails one that is not, and names it", () => {
    const ok = block('  strength: { list: "grade-recommendation-strength", code: "strong" },\n');
    const bad = block('  strength: { list: "grade-recommendation-strength", code: "weak" },\n');
    try {
      expect(checkRecommendationStrengthResolves({ ts: ok.ts }).result).toBe("pass");
      const r = checkRecommendationStrengthResolves({ ts: bad.ts });
      expect(r.result).toBe("fail");
      expect(r.hits[0]).toMatchObject({ line: 3 });
      expect(r.hits[0]!.text).toMatch(/"weak"/);
    } finally {
      rmSync(ok.dir, { recursive: true, force: true });
      rmSync(bad.dir, { recursive: true, force: true });
    }
  });

  it("no strength is n/a, and a computed strength is a warning, never a pass", () => {
    const none = block("");
    const computed = block("  strength: { list: LIST, code: \"strong\" },\n");
    try {
      expect(checkRecommendationStrengthResolves({ ts: none.ts }).result).toBe("n/a");
      expect(checkRecommendationStrengthResolves({ ts: computed.ts }).result).toBe("warn");
    } finally {
      rmSync(none.dir, { recursive: true, force: true });
      rmSync(computed.dir, { recursive: true, force: true });
    }
  });

  it("a folio's own code list is seen, so its own grading resolves", () => {
    const b = block('  strength: { list: "house-grading", code: "tier-1" },\n');
    try {
      expect(checkRecommendationStrengthResolves({ ts: b.ts }).result).toBe("fail");
      mkdirSync(join(b.dir, "code-lists"));
      writeFileSync(
        join(b.dir, "code-lists", "house-grading.json"),
        JSON.stringify({ $schema: "folio-code-list/v1", id: "house-grading", title: "House", description: "A folio's own grading scheme.", source: { note: "test" }, codes: [{ code: "tier-1", label: "Tier 1", definition: "The strongest tier of this house scheme." }] }),
      );
      expect(checkRecommendationStrengthResolves({ ts: b.ts }).result).toBe("pass");
    } finally {
      rmSync(b.dir, { recursive: true, force: true });
    }
  });

  it("the dispatch table the qa-checkers node names holds this checker", () => {
    expect(Object.keys(RECOMMENDATION_CHECKERS)).toEqual(["recommendation-strength-resolves"]);
  });
});
