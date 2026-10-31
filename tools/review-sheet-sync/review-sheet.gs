/**
 * @OnlyCurrentDoc
 *
 * Review sheet: keeps its links and joins current. Two modes, set by the
 * sheet's Config tab: public-comment (Review Public Comments, Review Change
 * Sets, Agent) and drafting (Contributor Feedback, Agent; one row is one
 * change set).
 *
 * ONE SCRIPT FOR EVERY DOCUMENT. Nothing in this file is about one document:
 * the document's URLs, tab and column names and table of contents are read
 * from the sheet's Config tab, which the agent writes from the folio's
 * sheet-sync.json (folio-assistant-core tools/review-sheet-sync, skill
 * review-sheet-script). The Config tab is visible and locked to the sheet's
 * owner. A copy of the template therefore works for any document once its
 * Config tab is filled.
 *
 * Install once: Extensions > Apps Script, paste this file as Code.gs (the
 * only file to paste), save, pick installTriggers in the function
 * list, press Run and allow access, then reload the sheet. A "Review links"
 * menu appears. An edit marks the sheet dirty and a 5-minute trigger
 * rebuilds; "Refresh now" rebuilds at once. Columns are found by their header
 * text, so they may be moved freely.
 *
 * Trust: @OnlyCurrentDoc limits the script to this spreadsheet. It reads and
 * writes this sheet and its document properties only; it fetches no URL and
 * sends nothing anywhere. The same file is published once with its SHA-256,
 * so a pasted copy can be checked (skill review-sheet-script, "Trusting the
 * script").
 */
/*@@VERSION@@*/

const CONFIG_TAB = 'Config';
let CFG = null, COLS = null, DATA = null, DRAFTING = false, WATCHED = [];

/**
 * Read CFG, COLS and DATA from the Config tab: column A a key, column B its
 * JSON. A long value continues on the next rows under the same key. Every
 * value starts with "|" so a sheet never reads it as a number or formula.
 */
function loadConfig(ss) {
  if (CFG) return;
  const sh = ss.getSheetByName(CONFIG_TAB);
  if (!sh) {
    throw new Error('This sheet has no "' + CONFIG_TAB + '" tab, so the script does not know which document it reviews. ' +
      'The agent writes it from the folio\'s sheet-sync.json (skill review-sheet-script).');
  }
  const parts = {};
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getDisplayValues().slice(1).forEach(([k, v]) => {
    k = String(k).trim();
    if (k) parts[k] = (parts[k] || '') + String(v).replace(/^\|/, '');
  });
  const json = k => {
    if (!parts[k]) throw new Error('The "' + CONFIG_TAB + '" tab has no ' + k + ' row. Ask the agent to write it again.');
    return JSON.parse(parts[k]);
  };
  CFG = json('CFG');
  COLS = json('COLS');
  DATA = json('DATA');
  DRAFTING = CFG.MODE === 'drafting';
  WATCHED = DRAFTING ? [CFG.FEEDBACK, CFG.AGENT] : [CFG.RPC, CFG.AGENT, CFG.RCS];
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Review links')
    .addItem('Refresh now', 'refreshAll')
    .addItem('Install automatic refresh', 'installTriggers')
    .addToUi();
}

function installTriggers() {
  const ss = SpreadsheetApp.getActive();
  loadConfig(ss);
  checkSheet(ss);
  ScriptApp.getProjectTriggers()
    .filter(t => ['markDirty', 'refreshIfDirty'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('markDirty').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('refreshIfDirty').timeBased().everyMinutes(5).create();
  refreshAll();
}


/**
 * Stop with a plain message when the Config tab was written for another
 * sheet, or names tabs this sheet does not have: otherwise the refresh would
 * fail deep inside, on a missing tab.
 */
function checkSheet(ss) {
  const built = 'The Config tab was written from ' + CFG.SOURCE + ' for a ' + CFG.MODE + ' sheet';
  if (CFG.SHEET && ss.getId() !== CFG.SHEET) {
    throw new Error(built + ' (spreadsheet ' + CFG.SHEET + '), not this one. Ask the agent to write this sheet\'s Config.');
  }
  const need = DRAFTING ? [CFG.FEEDBACK] : [CFG.RPC, CFG.AGENT, CFG.RCS];
  const missing = need.filter(n => !ss.getSheetByName(n));
  if (missing.length) {
    throw new Error(built + ', which needs the tab(s) ' + need.map(n => '"' + n + '"').join(', ') +
      '. This spreadsheet has no ' + missing.map(n => '"' + n + '"').join(', ') +
      '. Ask the agent to write this sheet\'s Config, or rename the tab.');
  }
}

function markDirty(e) {
  const name = e && e.range && e.range.getSheet().getName();
  if (!name || name === CONFIG_TAB) return;
  try { loadConfig(SpreadsheetApp.getActive()); } catch (err) { return; }
  if (WATCHED.includes(name)) {
    PropertiesService.getDocumentProperties().setProperty('dirty', '1');
  }
}

function refreshIfDirty() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('dirty') !== '1') return;
  props.deleteProperty('dirty');
  refreshAll();
}

function refreshAll() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return;
  try {
    loadConfig(SpreadsheetApp.getActive());
    checkSheet(SpreadsheetApp.getActive());
    if (DRAFTING) return refreshDraft();
    const ss = SpreadsheetApp.getActive();
    const rpc = readSheet(ss.getSheetByName(CFG.RPC));
    const agent = readSheet(ss.getSheetByName(CFG.AGENT));
    const rcs = readSheet(ss.getSheetByName(CFG.RCS));
    const pcOf = {}, csOf = {}, csOfNo = {}, stOf = {}, prOf = {};
    const aNo = col(agent, COLS.agent.no), aPc = col(agent, COLS.agent.pc), aCs = col(agent, COLS.agent.cs);
    const aSt = col(agent, COLS.agent.agentic);
    const aId = col(agent, COLS.agent.csId), aPrs = col(agent, COLS.agent.prs), aCh = col(agent, COLS.agent.changes);
    const aDone = col(agent, COLS.agent.done);
    agent.rows.forEach(r => {
      const n = String(r[aNo]).trim();
      if (n) {
        if (aPc >= 0 && r[aPc]) pcOf[n] = String(r[aPc]).trim();
        if (aSt >= 0) stOf[n] = String(r[aSt]).trim();
        if (aCs >= 0 && r[aCs]) String(r[aCs]).split(/[,\s]+/).filter(Boolean).forEach(cs => {
          (csOf[cs] = csOf[cs] || []).push(n);
          (csOfNo[n] = csOfNo[n] || []).push(cs);
        });
      }
      // A change-set's pull requests: any number of URLs, one per line, and
      // on the same lines of the next column what each one changed.
      const id = aId >= 0 ? String(r[aId]).trim() : '';
      if (id && aPrs >= 0) {
        const descs = aCh >= 0 ? String(r[aCh]).split('\n').map(x => x.trim()) : [];
        const dones = aDone >= 0 ? String(r[aDone]).split('\n').map(x => x.trim()) : [];
        prOf[id] = String(r[aPrs]).split('\n').map(x => x.trim()).filter(Boolean)
          .map((line, i) => ({ url: prUrl(line), desc: descs[i] || '', done: dones[i] || '' }))
          .filter(x => x.url);
      }
    });
    refreshRpc(rpc, pcOf, csOfNo, stOf, prOf);
    refreshRcs(rcs, rpc, csOf, stOf, prOf);
  } finally {
    lock.releaseLock();
  }
}
// ---------- sheet helpers ----------

function readSheet(sh) {
  const last = sh.getLastRow();
  const width = sh.getLastColumn();
  const values = sh.getRange(1, 1, Math.max(last, 1), width).getDisplayValues();
  return { sh, header: values[0].map(h => String(h).trim()), rows: values.slice(1) };
}
function col(s, name) { return s.header.indexOf(name); }
function cols(s, name) { return s.header.map((h, i) => (h === name ? i : -1)).filter(i => i >= 0); }
/** Columns whose header is `name` or `name (…)`, e.g. "Contributor Feedback (CL)". */
function colsLike(s, name) {
  return s.header.map((h, i) => (h === name || String(h).indexOf(name + ' (') === 0 ? i : -1)).filter(i => i >= 0);
}

function writeRich(s, c, rich) {
  if (c < 0 || !rich.length) return;
  s.sh.getRange(2, c + 1, rich.length, 1).setRichTextValues(rich.map(v => [v]));
}

/** parts: [{t, url?, bold?}] -> RichTextValue */
function rich(parts) {
  let text = '';
  const spans = [];
  parts.forEach(p => {
    const a = text.length;
    text += p.t;
    if ((p.url || p.bold) && text.length > a) spans.push([a, text.length, p]);
  });
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  const bold = SpreadsheetApp.newTextStyle().setBold(true).build();
  spans.forEach(([a, z, p]) => {
    if (p.url) b.setLinkUrl(a, z, p.url);
    if (p.bold) b.setTextStyle(a, z, bold);
  });
  return b.build();
}

/** text + [{a, z, url}] -> RichTextValue */
function linked(text, links) {
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  links.forEach(l => b.setLinkUrl(l.a, l.z, l.url));
  return b.build();
}

const prUrl = line => (line.match(/https:\/\/github\.com\/[^\s,;]+\/pull\/\d+/) || [''])[0];

/**
 * Agentic status with its pull requests, one line per PR, like the joined
 * Public Comments column: "smart-ra#97 (PR open, 2026-10-30 22:30Z) · what it
 * changed", the PR linked and the status and the agent's completion time
 * bold. With no PR, the status alone.
 */
function agenticCell(status, prs) {
  if (!prs.length) return rich([{ t: status }]);
  return rich(prs.flatMap((p, i) => (i ? [{ t: '\n' }] : []).concat(
    [{ t: prLabel(p.url), url: p.url }],
    status || p.done ? [{ t: ' ' }, { t: '(' + [status, p.done].filter(Boolean).join(', ') + ')', bold: true }] : [],
    p.desc ? [{ t: ' · ' + p.desc }] : [])));
}

/** "smart-ra#97": the repository and number, since Sheets' link popup cuts the URL short. */
const prLabel = url => { const m = url.match(/\/([^/]+)\/pull\/(\d+)$/); return m[1] + '#' + m[2]; };

/** The PRs of some change-sets, each once, in order. */
function prsOfAll(css, prOf) {
  const seen = {};
  return css.flatMap(cs => prOf[cs] || []).filter(p => !seen[p.url] && (seen[p.url] = 1));
}

const pdfUrl = printed => CFG.DRAFT + (printed + DATA.OFFSET);

// ---------- parsing ----------

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keysWith = p => Object.keys(DATA.K || {}).filter(k => k.startsWith(p)).map(k => k.slice(2)).sort((a, b) => b.length - a.length);
const alt = xs => (xs.length ? xs.map(esc).join('|') : '(?!)');
const SEC_RE = () => new RegExp(
  'Appendix\\s+([A-Z])\\b|\\b([A-Z]\\.\\d+(?:\\.\\d+)*)\\b|\\b(\\d+(?:\\.\\d+)+)\\b|(' + alt(keysWith('c:')) +
  ')|\\b(' + alt(Object.keys(DATA.ABBR || {})) + ')\\b|(' + alt(keysWith('f:')) + ')|\\b(?:Chapter|Ch\\.?)\\s*(\\d+)\\b', 'gi');

function sectionKey(m) {
  if (m[1]) return DATA.K[m[1].toUpperCase()] ? m[1].toUpperCase() : null;
  const num = m[2] || m[3];
  if (num) {
    const parts = num.toUpperCase().split('.');
    while (parts.length) {
      const k = parts.length === 1 && /^\d+$/.test(parts[0]) ? 'ch' + parts[0] : parts.join('.');
      if (DATA.K[k]) return k;
      parts.pop();
    }
    return null;
  }
  if (m[4]) return DATA.K['c:' + m[4].toLowerCase()] ? 'c:' + m[4].toLowerCase() : null;
  if (m[5]) return m[5] === m[5].toUpperCase() && DATA.ABBR[m[5]] ? 'c:' + DATA.ABBR[m[5]] : null;
  if (m[6]) {
    const k = 'f:' + m[6].toLowerCase();
    return DATA.K[k] ? k : null;
  }
  if (m[7]) return DATA.K['ch' + m[7]] ? 'ch' + m[7] : null;
  return null;
}

/** [{a, z, key}] for each section reference in text */
function sections(text) {
  const out = [];
  const re = SEC_RE();
  let m;
  while ((m = re.exec(text))) {
    const key = sectionKey(m);
    if (key) out.push({ a: m.index, z: m.index + m[0].length, key });
  }
  return out;
}

const PAGE_RE = () => /(?<![\w.])(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?![\w.])/g;

/** [{a, z, from, to}] printed-page tokens */
function pageTokens(text) {
  const out = [];
  const re = PAGE_RE();
  let m;
  while ((m = re.exec(text))) {
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a >= 1 && a <= DATA.MAX && b >= a && b <= DATA.MAX && b - a < 30) out.push({ a: m.index, z: m.index + m[0].length, from: a, to: b });
  }
  return out;
}

/** PDF page holding draft line `line`, preferring pages near the printed candidates */
function pageOfLine(line, printedCands) {
  const holds = DATA.LP.filter(([, lo, hi]) => line >= lo && line <= hi).map(([p]) => p);
  for (const q of printedCands) {
    const pdf = q + DATA.OFFSET;
    for (const d of [0, 1, -1, 2]) if (holds.includes(pdf + d)) return pdf + d;
  }
  if (holds.length === 1) return holds[0];
  return printedCands.length ? printedCands[0] + DATA.OFFSET : null;
}

/** links for the Line no(s) column: p.N and line references */
function lineLinks(text, rowPrinted) {
  const links = [];
  const pRe = /\bp(?:p|age)?\.\s*(\d{1,3})\b/gi;
  const ctx = []; // [index, printed page] from p.N tokens in this cell
  let m;
  while ((m = pRe.exec(text))) {
    const n = +m[1];
    if (n >= 1 && n <= DATA.MAX) {
      links.push({ a: m.index, z: m.index + m[0].length, url: pdfUrl(n) });
      ctx.push([m.index, n]);
    }
  }
  const lRe = /\b(?:[Ll]ines?|ll\.?|L)\s*(\d{1,4})(?:\s*[-–—]\s*(\d{1,4}))?/g;
  while ((m = lRe.exec(text))) {
    const before = ctx.filter(([i]) => i < m.index).map(([, n]) => n);
    const cands = before.length ? [before[before.length - 1]] : rowPrinted;
    const pdf = pageOfLine(+m[1], cands);
    if (pdf) links.push({ a: m.index, z: m.index + m[0].length, url: CFG.DRAFT + pdf });
  }
  return links.sort((x, y) => x.a - y.a).filter((l, i, arr) => !i || l.a >= arr[i - 1].z);
}

function compact(pages) {
  const ps = [...new Set(pages)].sort((a, b) => a - b), out = [];
  ps.forEach(p => (out.length && p === out[out.length - 1][1] + 1 ? (out[out.length - 1][1] = p) : out.push([p, p])));
  return out;
}

// ---------- Review Public Comments ----------

function refreshRpc(s, pcOf, csOfNo, stOf, prOf) {
  const c = {};
  Object.entries(COLS.rpc).forEach(([k, h]) => (c[k] = col(s, h)));
  // No. -> link to the comment on the smart-ra review page
  if (c.no >= 0) {
    const f = s.rows.map(r => {
      const n = String(r[c.no]).trim();
      const pc = pcOf[n];
      return [pc ? '=HYPERLINK("' + CFG.PC_PAGE + pc + '",' + (isNaN(+n) ? '"' + n + '"' : n) + ')' : (n === '' ? '' : isNaN(+n) ? n : +n)];
    });
    if (f.length) s.sh.getRange(2, c.no + 1, f.length, 1).setValues(f);
  }
  const printedOf = r => (c.page >= 0 ? pageTokens(String(r[c.page])).map(t => t.from) : []);
  writeRich(s, c.sections, s.rows.map(r => {
    const t = String(r[c.sections]);
    return linked(t, sections(t).map(x => ({ a: x.a, z: x.z, url: CFG.DRAFT + DATA.K[x.key][1] })));
  }));
  writeRich(s, c.page, s.rows.map(r => {
    const t = String(r[c.page]);
    return linked(t, pageTokens(t).map(x => ({ a: x.a, z: x.z, url: pdfUrl(x.from) })));
  }));
  writeRich(s, c.lines, s.rows.map(r => {
    const t = String(r[c.lines]);
    return linked(t, lineLinks(t, printedOf(r)));
  }));
  // Agentic status -> the comment's status and every PR of its change-sets
  writeRich(s, c.agentic, s.rows.map(r => {
    const n = String(r[c.no]).trim();
    return agenticCell(stOf[n] || '', prsOfAll(csOfNo[n] || [], prOf));
  }));
}

// ---------- Review Change Sets ----------

function refreshRcs(s, rpc, csOf, stOf, prOf) {
  const c = {};
  Object.entries(COLS.rcs).forEach(([k, h]) => (c[k] = col(s, h)));
  const p = {};
  Object.entries(COLS.rpc).forEach(([k, h]) => (p[k] = col(rpc, h)));
  const fb = cols(rpc, COLS.rpc.feedback);
  const gid = rpc.sh.getSheetId();
  const rowOf = {};
  rpc.rows.forEach((r, i) => (rowOf[String(r[p.no]).trim()] = { r, at: i + 2 }));
  const ref = n => ({ t: 'No. ' + n, url: '#gid=' + gid + '&range=A' + rowOf[n].at });
  const get = (n, k) => (p[k] >= 0 ? String(rowOf[n].r[p[k]]).trim() : '');

  const join = (nos, sep, body) => {
    const parts = [];
    nos.forEach(n => {
      const b = body(n);
      if (!b) return;
      if (parts.length) parts.push({ t: sep });
      parts.push(...b);
    });
    return rich(parts);
  };

  const out = { sections: [], pages: [], comments: [], revisions: [], feedback: [], dispositions: [], agentic: [] };
  s.rows.forEach(r => {
    const cs = String(r[c.cs]).trim();
    const sts = [...new Set((csOf[cs] || []).map(n => stOf[n]).filter(Boolean))].join(', ');
    out.agentic.push(agenticCell(sts, prOf[cs] || []));
    const nos = (csOf[cs] || []).filter(n => rowOf[n]).sort((a, b) => a - b);

    const keys = {}, raw = [];
    nos.forEach(n => {
      const t = get(n, 'sections');
      const found = sections(t);
      found.forEach(x => (keys[x.key] = 1));
      if (!found.length && t && !raw.some(x => x.toLowerCase() === t.toLowerCase())) raw.push(t);
    });
    const secParts = Object.keys(keys)
      .sort((a, b) => DATA.K[a][1] - DATA.K[b][1] || a.localeCompare(b))
      .map(k => ({ t: DATA.K[k][0], url: CFG.DRAFT + DATA.K[k][1] }))
      .concat(raw.map(t => ({ t })));
    out.sections.push(rich(secParts.flatMap((x, i) => (i ? [{ t: ', ' }, x] : [x]))));

    const printed = [];
    nos.forEach(n => pageTokens(get(n, 'page')).forEach(t => { for (let q = t.from; q <= t.to; q++) printed.push(q); }));
    const pageParts = compact(printed).map(([a, b]) => ({ t: a === b ? String(a) : a + '–' + b, url: pdfUrl(a) }));
    out.pages.push(rich(pageParts.flatMap((x, i) => (i ? [{ t: ', ' }, x] : [x]))));

    out.comments.push(join(nos, '\n\n', n => {
      const v = get(n, 'comment');
      if (!v) return null;
      const st = get(n, 'status');
      return [ref(n)].concat(st ? [{ t: ' ' }, { t: '(' + st + ')', bold: true }] : [], [{ t: ' · ' + v }]);
    }));
    out.revisions.push(join(nos, '\n', n => {
      const v = get(n, 'revision');
      return v ? [ref(n), { t: ' · ' + v }] : null;
    }));
    out.feedback.push(join(nos, '\n', n => {
      const v = fb.map(i => String(rowOf[n].r[i]).trim()).filter(Boolean).join(' | ');
      return v ? [ref(n), { t: ' · ' + v }] : null;
    }));
    out.dispositions.push(join(nos, '\n\n', n => {
      const v = get(n, 'disposition');
      return v ? [ref(n), { t: ' · ' + v }] : null;
    }));
  });
  Object.keys(out).forEach(k => writeRich(s, c[k], out[k]));
}

// ---------- Drafting: Contributor Feedback ----------

/**
 * One row of Contributor Feedback is one change set. The script:
 * - gives a row with a Title, Sections or feedback but no Change-set the next
 *   id (CS-001, CS-002, ...), once; the id then stays with the row;
 * - writes Section links: each picked section, linked to its anchor on the
 *   document page, one per line (Sections itself stays the plain dropdown);
 * - fills Issue, Agentic status and Staging review page from the Agent tab,
 *   by change set;
 * - keeps the hidden TOC tab, the Sections dropdown's list, current.
 */
function refreshDraft() {
  const ss = SpreadsheetApp.getActive();
  const fb = readSheet(ss.getSheetByName(CFG.FEEDBACK));
  const agentSh = ss.getSheetByName(CFG.AGENT);
  const agent = agentSh ? readSheet(agentSh) : { header: [], rows: [] };
  writeToc(ss);

  const c = {};
  Object.entries(COLS.draft).forEach(([k, h]) => (c[k] = col(fb, h)));
  const fbCols = colsLike(fb, COLS.draft.feedback);
  const a = {};
  Object.entries(COLS.draftAgent).forEach(([k, h]) => (a[k] = col(agent, h)));

  // Change-set ids: mechanical, assigned once, never reused.
  if (c.cs >= 0) {
    let next = 1 + fb.rows.reduce((m, r) => {
      const x = /^CS-(\d+)$/.exec(String(r[c.cs]).trim());
      return x ? Math.max(m, +x[1]) : m;
    }, 0);
    let changed = false;
    const ids = fb.rows.map(r => {
      const cur = String(r[c.cs]).trim();
      const used = [c.title, c.sections].concat(fbCols).some(i => i >= 0 && String(r[i]).trim());
      if (cur || !used) return [cur];
      changed = true;
      const id = 'CS-' + String(next++).padStart(3, '0');
      r[c.cs] = id;
      return [id];
    });
    if (changed && ids.length) fb.sh.getRange(2, c.cs + 1, ids.length, 1).setValues(ids);
  }

  const prOf = {}, stOf = {}, issuesOf = {}, stagingOf = {};
  agent.rows.forEach(r => {
    const id = a.csId >= 0 ? String(r[a.csId]).trim() : '';
    if (!id) return;
    if (a.agentic >= 0) stOf[id] = String(r[a.agentic]).trim();
    if (a.issue >= 0) issuesOf[id] = String(r[a.issue]).split('\n').map(issueUrl).filter(Boolean);
    if (a.staging >= 0) stagingOf[id] = (String(r[a.staging]).match(/https:\/\/\S+/) || [''])[0];
    if (a.prs >= 0) {
      const descs = a.changes >= 0 ? String(r[a.changes]).split('\n').map(x => x.trim()) : [];
      const dones = a.done >= 0 ? String(r[a.done]).split('\n').map(x => x.trim()) : [];
      prOf[id] = String(r[a.prs]).split('\n').map(x => x.trim()).filter(Boolean)
        .map((line, i) => ({ url: prUrl(line), desc: descs[i] || '', done: dones[i] || '' }))
        .filter(x => x.url);
    }
  });

  const tocUrl = {};
  DATA.TOC.forEach(([name, anchor]) => (tocUrl[name] = CFG.SECTION_URL + anchor));
  // Sections is the people's multi-select dropdown, so it stays plain text (a
  // dropdown chip cannot carry a link, and rich text there fights the
  // validation). Section links is green: one linked line per picked section.
  writeRich(fb, c.sectionLinks, fb.rows.map(r => {
    const names = String(r[c.sections]).split(', ').map(x => x.trim()).filter(x => tocUrl[x]);
    return rich(names.flatMap((n, i) => (i ? [{ t: '\n' }] : []).concat([{ t: n, url: tocUrl[n] }])));
  }));
  writeRich(fb, c.issue, fb.rows.map(r => {
    const urls = issuesOf[String(r[c.cs]).trim()] || [];
    return rich(urls.flatMap((u, i) => (i ? [{ t: '\n' }] : []).concat([{ t: issueLabel(u), url: u }])));
  }));
  writeRich(fb, c.agentic, fb.rows.map(r => {
    const cs = String(r[c.cs]).trim();
    return agenticCell(stOf[cs] || '', prOf[cs] || []);
  }));
  // Staging review page: the change set's preview while its PR is open.
  writeRich(fb, c.staging, fb.rows.map(r => {
    const u = stagingOf[String(r[c.cs]).trim()];
    return rich(u ? [{ t: 'review', url: u }] : []);
  }));
}

const issueUrl = line => (String(line).match(/https:\/\/github\.com\/[^\s,;]+\/issues\/\d+/) || [''])[0];
const issueLabel = url => { const m = url.match(/\/([^/]+)\/issues\/(\d+)$/); return m[1] + '#' + m[2]; };

/** The hidden TOC tab: column A the dropdown names, column B each linked. */
function writeToc(ss) {
  let sh = ss.getSheetByName(CFG.TOC);
  if (!sh) {
    sh = ss.insertSheet(CFG.TOC);
    sh.hideSheet();
  }
  const rows = [['Section', 'Link']].concat(DATA.TOC.map(([name, anchor]) =>
    [name, '=HYPERLINK("' + CFG.SECTION_URL + anchor + '","open")']));
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  const extra = sh.getLastRow() - rows.length;
  if (extra > 0) sh.getRange(rows.length + 1, 1, extra, 2).clearContent();
}
