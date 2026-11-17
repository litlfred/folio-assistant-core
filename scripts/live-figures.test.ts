import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkedSvgFigures, liveFiguresFor, withLiveFigures, type FigureTarget } from "./live-figures.ts";

const target: FigureTarget = {
  block: "folio/doc/ch1/f-1.md",
  label: "Figure 1",
  model: "1.0.0",
  view: "id-v1",
  viewName: "Overview",
  svg: "archimate/1.0.0/views/id-v1.svg",
  page: "en/inst/archimate/1.0.0/views/overview/",
};

describe("a figure that is a model view is drawn from the model", () => {
  const root = mkdtempSync(join(tmpdir(), "live-figures-"));
  mkdirSync(join(root, "folio/doc/ch1"), { recursive: true });
  writeFileSync(join(root, target.block), "![Figure](media/image1.png)\n");
  const live = liveFiguresFor([target, { ...target, block: "folio/doc/gone.md" }], root, "en/doc");

  it("findsBlockImage", () => {
    expect([...live.keys()]).toEqual(["media/image1.png"]);
    expect(live.get("media/image1.png")).toMatchObject({ svg: "../../archimate/1.0.0/views/id-v1.svg", page: "../inst/archimate/1.0.0/views/overview/" });
  });

  it("embedsObjectKeepsPng", () => {
    const html = withLiveFigures(`<p><img src="media/image1.png" alt="Figure"></p>\n<p><img src="media/other.png" alt="x"></p>`, live);
    expect(html).toContain(`<object class="fa-live-figure" type="image/svg+xml" data="../../archimate/1.0.0/views/id-v1.svg"`);
    // A link inside an SVG loaded through <img> is never clickable, and a link
    // around the drawing would take every click to the view page instead.
    expect(html).not.toContain(`<img src="../../archimate/1.0.0/views/id-v1.svg"`);
    expect(html).not.toContain(`<a class="fa-live-figure"`);
    expect(html).toContain(`><img src="media/image1.png" alt="Figure 1: view &quot;Overview&quot; of ArchiMate model 1.0.0, drawn from the model" loading="lazy"></object>`);
    expect(html).toContain(`<a href="../inst/archimate/1.0.0/views/overview/">view &ldquo;Overview&rdquo;</a> (1.0.0)`);
    expect(html).toContain(`<img src="media/other.png" alt="x">`);
  });

  it("noMappingNoChange", () => {
    expect(withLiveFigures(`<img src="media/image1.png">`, new Map())).toBe(`<img src="media/image1.png">`);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("a linked SVG of the document's own is embedded so its links work", () => {
  const doc = mkdtempSync(join(tmpdir(), "linked-svg-"));
  mkdirSync(join(doc, "media"));
  writeFileSync(join(doc, "media/linked.svg"), '<svg><a href="https://x/entry/" target="_top"><title>Entry</title><rect/></a></svg>');
  writeFileSync(join(doc, "media/plain.svg"), '<svg><a href="#self"><rect/></a></svg>');

  it("linkedSvgBecomesObject", () => {
    const html = linkedSvgFigures('<p><img src="media/linked.svg" alt="DIIG phases"></p>', doc);
    expect(html).toBe('<p><object class="fa-live-figure" type="image/svg+xml" data="media/linked.svg" aria-label="DIIG phases"><img src="media/linked.svg" alt="DIIG phases"></object></p>');
  });

  it("unlinkedMissingOrOutsideStayImg", () => {
    for (const src of ["media/plain.svg", "media/gone.svg", "media/image.png", "../media/linked.svg", "https://x/linked.svg"]) {
      const tag = `<img src="${src}" alt="x">`;
      expect(linkedSvgFigures(tag, doc)).toBe(tag);
    }
  });

  it("modelViewFallbackNotWrappedAgain", () => {
    const html = '<object class="fa-live-figure" type="image/svg+xml" data="../v.svg"><img src="media/linked.svg" alt="x"></object>';
    expect(linkedSvgFigures(html, doc)).toBe(html);
  });
});
