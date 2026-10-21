/**
 * Scope generated CSS under one class, for a page that sits inside the site's
 * Jekyll layout and must restyle nothing of the theme's: the themed document
 * page (`build-document-site.ts --document-layout`) and the comment notes
 * `public-comment-site.ts` adds to it.
 */

/**
 * Put every rule of `css` under `scope`: `a, b {…}` becomes `scope a, scope b {…}`,
 * `:root`, `html` and `body` become `scope` itself, and `@media` / `@supports`
 * blocks are scoped inside. Comments are dropped. For flat generated CSS (the
 * block actions'), not a general CSS parser.
 */
export function scopeCss(css: string, scope: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const sel = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    for (; j < src.length && depth > 0; j++) depth += src[j] === "{" ? 1 : src[j] === "}" ? -1 : 0;
    const inner = src.slice(open + 1, j - 1);
    if (/^@(media|supports)\b/.test(sel)) out += `${sel} {\n${scopeCss(inner, scope)}}\n`;
    else if (sel.startsWith("@")) out += `${sel} {${inner}}\n`;
    else if (sel) out += `${sel.split(",").map((p) => p.trim()).map((p) => (/^(:root|html|body)$/.test(p) ? scope : `${scope} ${p}`)).join(", ")} {${inner}}\n`;
    i = j;
  }
  return out;
}
