/**
 * A document figure that is a view of an ArchiMate model is shown as the
 * model's own drawing, not as the screenshot pasted into the text.
 *
 * Owner, 2026-10-31: *"i dont really like native UML, rather derived"*
 * (smart-ra#166, follow-up D3b). The instance's ArchiMate config maps a
 * figure's block to the view it shows (`figures` in `cat-archimate.config.json`,
 * cat-harness-tools#1064), and `archimate-pages --out` draws every view as SVG
 * into the same site. Here each `<img>` in a mapped block is pointed at that
 * SVG, wrapped in a link to the view's page, with a line saying where it is
 * drawn from. The PNG stays in `media/` as the fallback: `onerror` swaps back
 * to it when a build ran without the ArchiMate step.
 *
 * @module folio-assistant-core/scripts/live-figures
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { figureTargets, type FigureTarget } from "@litlfred/cat-harness-tools/archimate/scripts/gen-archimate-pages.js";
import { fromPageDir } from "./document-site-route.js";

/** One image the document links (`media/…`), and the view that replaces it, as links from the document page. */
export interface LiveFigure {
  /** The image as the block links it, e.g. `media/image28.png`. */
  src: string;
  label: string;
  viewName: string;
  model: string;
  /** From the document page to the view's SVG. */
  svg: string;
  /** From the document page to the view's page. */
  page: string;
}

const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** The images the mapped blocks of one document link, each with its view. */
export function liveFiguresFor(targets: FigureTarget[], repoRoot: string, pageDir: string): Map<string, LiveFigure> {
  const out = new Map<string, LiveFigure>();
  for (const t of targets) {
    const file = join(repoRoot, t.block);
    if (!existsSync(file)) continue; // check-archimate reports it
    for (const m of readFileSync(file, "utf8").matchAll(IMAGE)) {
      out.set(m[1], { src: m[1], label: t.label, viewName: t.viewName, model: t.model, svg: fromPageDir(pageDir, t.svg), page: `${fromPageDir(pageDir, t.page)}/` });
    }
  }
  return out;
}

/** {@link liveFiguresFor} for an instance: empty when it holds no ArchiMate config or maps no figure. */
export function liveFigures(repoRoot: string, pageDir: string): Map<string, LiveFigure> {
  return liveFiguresFor(figureTargets(repoRoot), repoRoot, pageDir);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Rendered HTML with every mapped `<img>` drawn from the model, linked to its view. */
export function withLiveFigures(html: string, figures: Map<string, LiveFigure>): string {
  if (figures.size === 0) return html;
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = /\ssrc="([^"]*)"/.exec(tag)?.[1];
    const f = src === undefined ? undefined : figures.get(src);
    if (f === undefined) return tag;
    const alt = `${f.label}: view "${f.viewName}" of ArchiMate model ${f.model}, drawn from the model`;
    // The swap back runs only when the drawing is missing; the URL is the page's own `media/` copy.
    const fallback = `this.onerror=null;this.src=${JSON.stringify(f.src)}`;
    return (
      `<a class="fa-live-figure" href="${esc(f.page)}"><img src="${esc(f.svg)}" alt="${esc(alt)}" loading="lazy" onerror="${esc(fallback)}"></a>` +
      `<span class="fa-live-figure-note">Drawn from the ArchiMate model: <a href="${esc(f.page)}">view &ldquo;${esc(f.viewName)}&rdquo;</a> (${esc(f.model)})</span>`
    );
  });
}
