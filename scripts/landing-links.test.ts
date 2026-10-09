/**
 * `landingLinks` — what a folio's landing page lists besides its documents:
 * the visualisations its instance declares, when they resolve.
 */
import { describe, expect, test } from "bun:test";
import type { CatHarnessDeclaration } from "../../cat-harness/schemas/cat-harness.js";
import { landingLinks } from "./build-document-site.js";

const decl = (directories: unknown[]) => ({ name: "f", directories }) as unknown as CatHarnessDeclaration;
const dir = (id: string, visualiser: unknown) => ({ id, path: `${id}/`, graphTypologies: ["archimate"], coverage: { visualiser } });

describe("landingLinks", () => {
  test("a page built at publish by a writer that exists is linked, as its directory", () => {
    const d = decl([dir("archimate", [{ ref: "archimate/index.html", title: "ArchiMate models", writer: ["p/gen.ts"] }])]);
    expect(landingLinks(d, (p) => p === "p/gen.ts")).toEqual([{ title: "ArchiMate models", href: "archimate/" }]);
  });

  test("a page that neither exists nor has a writer that exists is not linked", () => {
    const d = decl([dir("archimate", [{ ref: "archimate/index.html", writer: ["p/gen.ts"] }])]);
    expect(landingLinks(d, () => false)).toEqual([]);
  });

  test("staging-only, absolute and climbing refs are never linked from the landing", () => {
    const d = decl([
      dir("a", [{ ref: "a/index.html", publish: "staging-only" }]),
      dir("b", "/b/index.html"),
      dir("c", "../c/index.html"),
    ]);
    expect(landingLinks(d, () => true)).toEqual([]);
  });

  test("a bare string visualiser takes the directory id as its title; markdown maps to its served page", () => {
    expect(landingLinks(decl([dir("notes", "notes/overview.md")]), () => true)).toEqual([{ title: "notes", href: "notes/overview.html" }]);
  });

  test("no declaration, no links", () => {
    expect(landingLinks(undefined, () => true)).toEqual([]);
  });
});
