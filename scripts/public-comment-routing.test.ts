import { describe, expect, test } from "bun:test";

import { changeSetRouting, commentRouting, twgGroup } from "./public-comment-routing.js";

const AI = "TWG consideration? AI categorisation";
const HU = "Consider by TWG? Human categorisation";

describe("public-comment-routing", () => {
  test("only the eight fixed categories, and unambiguous aliases, name a group", () => {
    expect(twgGroup(" core  architects ")).toBe("Core architects");
    expect(twgGroup("Metadata")).toBe("Metadata registries");
    expect(twgGroup("HWF team")).toBeUndefined();
    expect(twgGroup("Maybe - editorial?")).toBeUndefined();
  });

  test("a human categorisation overrides the AI one", () => {
    expect(commentRouting({ [AI]: "Clinical", [HU]: "No" })).toEqual({ group: "No", secondary: [], source: "human", raw: "No" });
    expect(commentRouting({ [AI]: "Clinical" })).toMatchObject({ group: "Clinical", source: "ai" });
    expect(commentRouting({ "Comment type": "P1" })).toBeUndefined();
    expect(commentRouting(undefined)).toBeUndefined();
  });

  test("'A/ B' is a primary and a secondary; a value naming no category is kept raw", () => {
    expect(commentRouting({ [HU]: "Core architects/ WHO" })).toMatchObject({ group: "Core architects", secondary: ["WHO"] });
    const odd = commentRouting({ [HU]: "HWF team" })!;
    expect(odd.group).toBeUndefined();
    expect(odd.raw).toBe("HWF team");
  });

  test("a change-set takes its comments' plurality; ties go to the more specific domain", () => {
    const by = new Map([
      ["a", commentRouting({ [AI]: "Core architects" })],
      ["b", commentRouting({ [AI]: "Financial systems" })],
      ["c", commentRouting({ [HU]: "HWF team" })],
    ]);
    const x = changeSetRouting(["a", "b", "c", "d"], by);
    expect(x.group).toBe("Financial systems");
    expect(x).toMatchObject({ routed: 2, unmapped: 1, total: 4 });
    expect(changeSetRouting(["d"], by).group).toBeUndefined();
  });
});
