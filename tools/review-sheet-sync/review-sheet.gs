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
 * menu appears. In a drafting sheet an edit rebuilds at once; in a
 * public-comment sheet it marks the sheet dirty and a 5-minute trigger
 * rebuilds. "Refresh now" rebuilds at once. Columns are found by their header
 * text, so they may be moved freely. After each rebuild, and on the 5-minute
 * timer, a hidden Watch tab lists the change sets that need the agent, so a
 * watching agent checks one small range instead of the whole log.
 *
 * Trust: @OnlyCurrentDoc limits the script to this spreadsheet. It reads and
 * writes this sheet and its document properties only; it fetches no URL and
 * sends nothing anywhere. The same file is published once with its SHA-256,
 * so a pasted copy can be checked (skill review-sheet-script, "Trusting the
 * script").
 */
/*@@VERSION@@*/

/**
 * Run this one, once, from the editor (or Review links, then Install automatic
 * refresh): it is first in the file so the editor's Run button picks it by
 * default (owner, 2026-10-31: Run picked loadConfig and failed). Every other
 * function here is called by it, the menu or a trigger, never run by hand.
 */
function installTriggers() {
  const ss = SpreadsheetApp.getActive();
  loadConfig(ss);
  checkSheet(ss);
  host_().ScriptApp.getProjectTriggers()
    .filter(t => ['markDirty', 'refreshIfDirty'].includes(t.getHandlerFunction()))
    .forEach(t => host_().ScriptApp.deleteTrigger(t));
  host_().ScriptApp.newTrigger('markDirty').forSpreadsheet(ss).onEdit().create();
  host_().ScriptApp.newTrigger('refreshIfDirty').timeBased().everyMinutes(5).create();
  refreshAll();
  applyEditors(ss);
  if (DRAFTING) checkDropdown(ss);
}

/**
 * Library use (owner, 2026-10-31: "this is annoying. lets move to library
 * script"). The same file serves as a library: each sheet holds a short stub
 * (dist/Stub.gs) that calls init(...) with its own services, so the document
 * properties, the lock and the triggers are the sheet's, not the library's.
 * Pasted straight into a sheet, init is never called and the sheet's own
 * services are used.
 */
let HOST_ = null;
function init(services) { HOST_ = services || null; }
function host_() {
  return HOST_ || {
    PropertiesService: typeof PropertiesService === 'undefined' ? undefined : PropertiesService,
    LockService: typeof LockService === 'undefined' ? undefined : LockService,
    ScriptApp: typeof ScriptApp === 'undefined' ? undefined : ScriptApp,
  };
}
function docProps_() { return host_().PropertiesService.getDocumentProperties(); }
function docLock_() { return host_().LockService.getDocumentLock(); }

const CONFIG_TAB = 'Config';
// Which build this is, and where the latest is published (owner, 2026-10-31:
// "sheets likely to drift anyways ... they need to know where to see latest
// published"). The build stamps SCRIPT_VERSION; the script never fetches.
const SCRIPT_VERSION = '@@STAMP@@';
const LIBRARY_URL = 'https://script.google.com/home/projects/1us7_ApIq_XvDG-V1XtqdcyHucF0hSlST0qracv1Tw9KTb4-lAFvK1bMQ/edit';
const LATEST_URL = 'https://github.com/litlfred/folio-assistant-core/blob/main/tools/review-sheet-sync/dist/Code.gs';
const RUN_THIS = 'This function is not meant to be run by hand. In the toolbar, pick installTriggers ' +
  'in the function list (next to Run and Debug), then press Run.';
let CFG = null, COLS = null, DATA = null, DRAFTING = false, WATCHED = [], EDITORS = null, EDITORS_SKIPPED = [];

/**
 * Read CFG, COLS and DATA from the Config tab: column A a key, column B its
 * JSON. A long value continues on the next rows under the same key. Every
 * value starts with "|" so a sheet never reads it as a number or formula.
 */
function loadConfig(ss) {
  if (CFG) return;
  if (!ss) throw new Error(RUN_THIS);
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
  if (!parts.CFG) throw new Error(notLinked(ss));
  const json = k => {
    if (!parts[k]) throw new Error('The "' + CONFIG_TAB + '" tab has no ' + k + ' row. Ask the agent to write it again.');
    return JSON.parse(parts[k]);
  };
  CFG = json('CFG');
  COLS = json('COLS');
  DATA = json('DATA');
  // Old short names, from a Config written before 2026-10-31.
  [['K', 'SECTIONS'], ['ABBR', 'ABBREVIATIONS'], ['LP', 'PAGE_LINES'], ['OFFSET', 'PAGE_OFFSET'], ['MAX', 'LAST_PAGE']]
    .forEach(([o, n]) => { if (DATA[n] === undefined && DATA[o] !== undefined) DATA[n] = DATA[o]; });
  // EDITORS: plain emails, kept by a person. No row: leave the Ready columns alone.
  // Anything else in the cell (a name, a typo) is left out and reported by
  // applyEditors, never silently dropped.
  const words = parts.EDITORS === undefined ? [] : parts.EDITORS.split(/[\s,;]+/).filter(Boolean);
  EDITORS = parts.EDITORS === undefined ? null : words.filter(x => /^[^@\s]+@[^@\s]+$/.test(x));
  EDITORS_SKIPPED = words.filter(x => !/^[^@\s]+@[^@\s]+$/.test(x));
  DRAFTING = CFG.MODE === 'drafting';
  // Public comment: the agent's per-comment rows on CFG.AGENT and, since
  // 2026-10-31 (owner), its per-change-set rows on their own tab, CFG.AGENT_CS.
  // Without AGENT_CS both halves sit side by side on CFG.AGENT, as before.
  WATCHED = DRAFTING ? [CFG.FEEDBACK, CFG.AGENT] : [CFG.RPC, CFG.AGENT, CFG.RCS].concat(CFG.AGENT_CS ? [CFG.AGENT_CS] : []);
}

/**
 * A copy of a template is not linked to a repository until the agent writes
 * its Config from the folio's sheet-sync.json. Say so, with what to ask for,
 * rather than leaving an empty dropdown to explain itself.
 */
function notLinked(ss) {
  return 'This sheet is not linked to a document repository yet, so its Config tab is empty and ' +
    'the Selected Sections dropdown has nothing to offer. Ask the agent to link it: name the repository ' +
    'and give this spreadsheet\'s ID, ' + ss.getId() + '. The agent adds review/<mode>/sheet-sync.json ' +
    'there and writes this Config tab (skill review-sheet-script, "Linking a sheet to a repository").';
}

function showVersion() {
  SpreadsheetApp.getUi().alert('Review sheet script',
    'This sheet runs: ' + SCRIPT_VERSION + '\n\n' +
    'The latest published script: ' + LATEST_URL + '\n' +
    'Its stamp is near the top ("at ..."). If it differs, the owner pastes it once into the Folio Review Library ' +
    '(' + LIBRARY_URL + '); every sheet that uses the library then runs it. A sheet with the whole script pasted in ' +
    'instead: Extensions, then Apps Script, replace Code.gs, save, and Review links, then Refresh now.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Review links')
    .addItem('Refresh now', 'refreshAll')
    .addItem('Install (first time, or after pasting a new Code.gs)', 'installTriggers')
    .addItem('Which version is this?', 'showVersion')
    .addToUi();
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(CONFIG_TAB);
    const keys = sh ? sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getDisplayValues().map(r => String(r[0]).trim()) : [];
    if (!keys.includes('CFG')) ss.toast(notLinked(ss), 'Not linked to a repository yet', 30);
  } catch (e) { /* a toast is a courtesy; never block the menu */ }
}


const READY_DESC = 'Ready columns: who may set them is the Config tab\'s EDITORS row (the script keeps this).';

/**
 * Lock the "Ready for ..." columns to the owner and the Config tab's EDITORS,
 * so the owner can delegate who decides without touching protections. The
 * script's own protection is rebuilt each time; others are left alone. An
 * empty EDITORS row locks them to the owner alone; no row leaves them as
 * they are.
 */
function applyEditors(ss) {
  if (!ss) throw new Error(RUN_THIS);
  if (EDITORS === null) return;
  const sh = ss.getSheetByName(DRAFTING ? CFG.FEEDBACK : CFG.RCS);
  const s = readSheet(sh);
  const cols = s.header.map((h, i) => /^Ready for /.test(h) ? i : -1).filter(i => i >= 0);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription() === READY_DESC).forEach(p => p.remove());
  // An empty row means the owner alone (owner, 2026-10-31: "should start w/
  // empty list (owner is default editor)").
  cols.forEach(c => {
    const p = sh.getRange(s.top, c + 1, sh.getMaxRows() - s.top + 1, 1).protect().setDescription(READY_DESC);
    p.removeEditors(p.getEditors());
    if (EDITORS.length) p.addEditors(EDITORS);
  });
  if (EDITORS_SKIPPED.length) {
    try {
      ss.toast('Not an email, so left out: ' + EDITORS_SKIPPED.join(', ') +
        '. Write each editor as a plain email, one per line (e.g. ana@example.org).', 'Config EDITORS', 20);
    } catch (e) { /* a toast is a courtesy */ }
  }
}

/**
 * Drafting: make sure Selected Sections is a dropdown of the hidden TOC tab,
 * and tell the person the steps a script cannot take. A missing dropdown is
 * added; an existing one is left alone, since writing it again would clear
 * its "Allow multiple selections" tick. Neither Apps Script nor the Sheets
 * API can read that tick, so the box is skipped only on
 * evidence: a cell already holding two sections from the list, or the person
 * having said it is done (Yes). The same steps are in the Config tab's Instructions row.
 */
function checkDropdown(ss) {
  if (!ss) throw new Error(RUN_THIS);
  const sh = ss.getSheetByName(CFG.FEEDBACK);
  const s = readSheet(sh);
  const at = s.header.indexOf(COLS.draft.sections);
  if (at < 0) return;
  const cells = sh.getRange(s.top, at + 1, sh.getMaxRows() - s.top + 1, 1);
  const had = cells.getDataValidation();
  if (!had) {
    cells.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getSheetByName(CFG.TOC).getRange('A2:A'), true)
      .setAllowInvalid(true).build());
  }
  const props = docProps_();
  if (had && (props.getProperty('dropdownDone') || multiPicked(cells))) return;
  const range = "'" + sh.getName() + "'!" + cells.getA1Notation();
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert('Finish the Selected Sections dropdown',
    (had ? 'Selected Sections is a dropdown' : 'Selected Sections is now a dropdown of the document\'s sections') +
    ', but one setting only a person can make:\n\n' +
    '\u2022 Click the column letter above "' + COLS.draft.sections + '" to select the column\n' +
    '\u2022 Choose Data, then Data validation\n' +
    '\u2022 Open the rule for ' + range + ' (it says "Dropdown (from a range)")\n' +
    '\u2022 Tick Allow multiple selections\n' +
    '\u2022 Press Done\n\n' +
    'The script keeps the list and every pick current after that. These steps are also on the Config tab.\n\n' +
    'Is this done already? Yes stops this message; No shows it again next time.',
    ui.ButtonSet.YES_NO);
  if (answer === ui.Button.YES) props.setProperty('dropdownDone', '1');
}

/** True when some cell holds two or more sections from the list, which only a multi-select rule allows. */
function multiPicked(cells) {
  const names = new Set(DATA.TOC.map(t => bareName(t[0])));
  return cells.getDisplayValues().some(([v]) => {
    const parts = String(v).split(',').map(x => x.trim()).filter(Boolean);
    return parts.length > 1 && parts.every(x => names.has(bareName(x)));
  });
}

/**
 * Stop with a plain message when the Config tab was written for another
 * sheet, or names tabs this sheet does not have: otherwise the refresh would
 * fail deep inside, on a missing tab.
 */
function checkSheet(ss) {
  if (!ss) throw new Error(RUN_THIS);
  const built = 'The Config tab was written from ' + CFG.SOURCE + ' for a ' + CFG.MODE + ' sheet';
  if (CFG.SHEET && ss.getId() !== CFG.SHEET) {
    throw new Error(built + ' (spreadsheet ' + CFG.SHEET + '), not this one. Ask the agent to write this sheet\'s Config.');
  }
  const need = DRAFTING ? [CFG.FEEDBACK] : [CFG.RPC, CFG.AGENT, CFG.RCS].concat(CFG.AGENT_CS ? [CFG.AGENT_CS] : []);
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
  if (!WATCHED.includes(name)) return;
  const props = docProps_();
  if (DRAFTING) {
    // Incremental: remember which Contributor Feedback rows the edit touched
    // and rebuild only those, at once. An edit of the header row, or of the
    // Agent tab by hand, rebuilds everything.
    const r0 = e.range.getRow ? e.range.getRow() : 1;
    const top = name === CFG.FEEDBACK ? topRow(e.range.getSheet()) : 2;
    if (name === CFG.FEEDBACK && r0 >= top) {
      const rows = (props.getProperty('rows') || '').split(',').filter(Boolean);
      const n = e.range.getNumRows();
      for (let r = r0; r < r0 + Math.min(n, MAX_ROWS + 1); r++) rows.push(String(r - top));
      const uniq = rows.filter((x, i) => rows.indexOf(x) === i);
      // A large paste rebuilds everything: a long row list would overflow a
      // document property (9 kB) and stop the refresh (finding F4).
      if (uniq.length > MAX_ROWS) props.setProperty('dirty', '1');
      else props.setProperty('rows', uniq.join(','));
    } else {
      props.setProperty('dirty', '1');
    }
    return refreshIfDirty();
  }
  props.setProperty('dirty', '1');
  // Public-comment mode rebuilds the whole sheet, since a comment's row feeds
  // its change sets' rows. It does so at once while that is quick; once a
  // rebuild takes longer than FAST_MS (an 800-row log takes about 20 s),
  // edits are gathered and the 5-minute trigger rebuilds, so runs do not
  // pile up.
  if (+(props.getProperty('lastMs') || 0) <= FAST_MS) refreshIfDirty();
}

const FAST_MS = 5000;
const MAX_ROWS = 200;

/**
 * The 5-minute trigger, and each edit. Drafting: rebuild the rows edited
 * since the last run and the rows whose change set's Agent row changed (the
 * agent writes Agent through the API, which fires no edit, so this is how
 * its writes reach the sheet). Public comment: rebuild all, if dirty.
 */
function refreshIfDirty() {
  const props = docProps_();
  try { loadConfig(SpreadsheetApp.getActive()); } catch (err) { return; }
  try { colourInstructions(SpreadsheetApp.getActive()); } catch (err) { /* cosmetic only */ }
  if (!DRAFTING) {
    // The agent writes Agent through the API, which fires no edit, so the
    // timer also rebuilds when the Agent tab's contents have changed.
    const seen = hashOf(JSON.stringify([CFG.AGENT, CFG.AGENT_CS].filter(Boolean).map(n => {
      const a = SpreadsheetApp.getActive().getSheetByName(n);
      return a ? a.getRange(1, 1, Math.max(a.getLastRow(), 1), Math.max(a.getLastColumn(), 1)).getDisplayValues() : [];
    })));
    const moved = seen !== (props.getProperty('agentHash') || '');
    if (props.getProperty('dirty') !== '1' && !moved) return writeWatch(SpreadsheetApp.getActive());
    // Cleared before the run, so an edit made during it marks it dirty
    // again; put back when the run could not start or failed, so the edit is
    // not lost but retried on the next tick.
    props.deleteProperty('dirty');
    let ok = false;
    try { ok = refreshAll() === true; } finally {
      if (ok) props.setProperty('agentHash', seen);
      else props.setProperty('dirty', '1');
    }
    return;
  }
  const lock = docLock_();
  if (!lock.tryLock(10000)) return;
  const t0 = Date.now();
  try {
    const full = props.getProperty('dirty') === '1';
    const rows = (props.getProperty('rows') || '').split(',').filter(Boolean).map(Number);
    props.deleteProperty('dirty');
    props.deleteProperty('rows');
    checkSheet(SpreadsheetApp.getActive());
    refreshDraft(full ? null : rows);
    writeWatch(SpreadsheetApp.getActive());
  } finally {
    props.setProperty('lastMs', String(Date.now() - t0));
    lock.releaseLock();
  }
}

/** Rebuild everything. True when it ran; false when another run held the lock. */
function refreshAll() {
  const lock = docLock_();
  if (!lock.tryLock(1000)) return false;
  const t0 = Date.now();
  try {
    refreshLocked();
    applyEditors(SpreadsheetApp.getActive());
    try { colourInstructions(SpreadsheetApp.getActive()); } catch (err) { /* cosmetic only */ }
    try { styleConfig(SpreadsheetApp.getActive()); } catch (err) { /* cosmetic only */ }
    return true;
  } finally {
    docProps_().setProperty('lastMs', String(Date.now() - t0));
    lock.releaseLock();
  }
}

function refreshLocked() {
  {
    loadConfig(SpreadsheetApp.getActive());
    checkSheet(SpreadsheetApp.getActive());
    if (DRAFTING) {
      refreshDraft();
      return writeWatch(SpreadsheetApp.getActive());
    }
    const ss = SpreadsheetApp.getActive();
    const rpc = readSheet(ss.getSheetByName(CFG.RPC));
    const agent = readSheet(ss.getSheetByName(CFG.AGENT));
    const agentCs = CFG.AGENT_CS ? readSheet(ss.getSheetByName(CFG.AGENT_CS)) : agent;
    const rcs = readSheet(ss.getSheetByName(CFG.RCS));
    const pcOf = {}, csOf = {}, csOfNo = {}, stOf = {}, prOf = {};
    const aNo = col(agent, COLS.agent.no), aPc = col(agent, COLS.agent.pc), aCs = col(agent, COLS.agent.cs);
    const aSt = col(agent, COLS.agent.agentic);
    const aId = col(agentCs, COLS.agent.csId), aPrs = col(agentCs, COLS.agent.prs), aCh = col(agentCs, COLS.agent.changes);
    const aDone = col(agentCs, COLS.agent.done);
    const aBasis = COLS.agent.basis ? col(agentCs, COLS.agent.basis) : -1;
    const basisOfCs = {}, stagingOf = {}, builtOf = {};
    const aStaging = COLS.agent.staging ? col(agentCs, COLS.agent.staging) : -1;
    const aBuilt = COLS.agent.built ? col(agentCs, COLS.agent.built) : -1;
    const aHead = col(agentCs, COLS.agent.head || 'PR head (change set)');
    const aFrom = col(agentCs, COLS.agent.builtFrom || 'Staging built from (change set)');
    const aDeploy = col(agentCs, COLS.agent.deploy || 'Staging deploy (change set)');
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
    });
    agentCs.rows.forEach(r => {
      // A change-set's pull requests: any number of URLs, one per line, and
      // on the same lines of the next column what each one changed.
      const id = aId >= 0 ? String(r[aId]).trim() : '';
      if (id && aBasis >= 0) basisOfCs[id] = String(r[aBasis]).trim();
      if (id && aStaging >= 0) stagingOf[id] = (String(r[aStaging]).match(/https:\/\/\S+/) || [''])[0];
      if (id) builtOf[id] = builtInfo(r, aBuilt, aFrom, aDeploy);
      if (id && aPrs >= 0) {
        const descs = aCh >= 0 ? String(r[aCh]).split('\n').map(x => x.trim()) : [];
        const dones = aDone >= 0 ? String(r[aDone]).split('\n').map(x => x.trim()) : [];
        const heads = aHead >= 0 ? String(r[aHead]).split('\n').map(x => x.trim()) : [];
        prOf[id] = String(r[aPrs]).split('\n').map(x => x.trim()).filter(Boolean)
          .map((line, i) => ({ url: prUrl(line), desc: descs[i] || '', done: dones[i] || '', head: heads[i] || '' }))
          .filter(x => x.url);
      }
    });
    refreshRpc(rpc, pcOf, csOfNo, stOf, prOf);
    refreshRcs(rcs, rpc, csOf, stOf, prOf);
    markStale(rcs, col(rcs, 'Change-set'), basisOfCs, ['Title', 'TWG (CS)'], 'Committee Feedback', COLS.rcs.agentFeedback || 'Change Set Feedback (agent)');
    // Staging review page, from Agent: only where Agent names a preview, so a
    // sheet whose agent writes the cell directly keeps it.
    const rSt = COLS.rcs.staging ? col(rcs, COLS.rcs.staging) : -1, rCs = col(rcs, COLS.rcs.cs);
    if (rSt >= 0 && rCs >= 0) rcs.rows.forEach((r, k) => {
      const id = String(r[rCs]).trim();
      if (stagingOf[id] || awaitsPreview(prOf[id])) rcs.sh.getRange(k + rcs.top, rSt + 1, 1, 1).setRichTextValues([[stagingCell(stagingOf[id], builtOf[id], prOf[id])]]);
    });
    writeWatch(ss);
  }
}

// ---------- Watch: the rows the agent has to look at ----------

const WATCH_TAB = 'Watch';

/**
 * The change sets the agent has to act on, worked out mechanically from the
 * sheet, so a watching agent reads one small tab instead of the whole log
 * (owner, 2026-10-31: "can we make it mostly mechanical to see if row(s)
 * changed?"). Each entry is [change set, what it needs]:
 * - proposal: the green `(agent)` proposal is empty, or the row's blue cells
 *   changed since it was written (its basis differs from Agent's Feedback
 *   basis). Drafting: only rows a person has written feedback on.
 * - issue (drafting): the change set has no issue on the Agent tab yet.
 * - ready: Ready for agent is Yes and its work has not started.
 * - merge: Ready for merge is Yes and its PR is still open.
 */
function watchList(ss) {
  const agentSh = ss.getSheetByName(CFG.AGENT);
  const agent = agentSh ? readSheet(agentSh) : { header: [], rows: [] };
  const agentCsSh = !DRAFTING && CFG.AGENT_CS ? ss.getSheetByName(CFG.AGENT_CS) : null;
  const agentCs = agentCsSh ? readSheet(agentCsSh) : agent;
  const A = DRAFTING ? COLS.draftAgent : COLS.agent;
  const aId = col(agentCs, A.csId), aSt = col(agent, A.agentic);
  const aBasis = A.basis ? col(agentCs, A.basis) : -1;
  const aIssue = DRAFTING && A.issue ? col(agentCs, A.issue) : -1;
  const aNo = DRAFTING ? -1 : col(agent, COLS.agent.no), aCs = DRAFTING ? -1 : col(agent, COLS.agent.cs);
  const basisOfCs = {}, issueOfCs = {}, stOfCs = {};
  agentCs.rows.forEach(r => {
    const id = aId >= 0 ? String(r[aId]).trim() : '';
    if (id) {
      if (aBasis >= 0) basisOfCs[id] = String(r[aBasis]).trim();
      if (aIssue >= 0) issueOfCs[id] = String(r[aIssue]).trim();
      if (DRAFTING && aSt >= 0) stOfCs[id] = [String(r[aSt]).trim()];
    }
  });
  agent.rows.forEach(r => {
    // Public comment: a change set's status is its comments' statuses.
    if (aNo >= 0 && aCs >= 0 && String(r[aNo]).trim()) {
      const st = aSt >= 0 ? String(r[aSt]).trim() : '';
      String(r[aCs]).split(/[,\s]+/).filter(Boolean).forEach(cs => (stOfCs[cs] = stOfCs[cs] || []).push(st));
    }
  });
  const s = readSheet(ss.getSheetByName(DRAFTING ? CFG.FEEDBACK : CFG.RCS));
  const exact = DRAFTING ? [COLS.draft.title, COLS.draft.sections] : ['Title', 'TWG (CS)'];
  const prefix = DRAFTING ? COLS.draft.feedback : 'Architect Feedback';
  const csCol = col(s, DRAFTING ? COLS.draft.cs : COLS.rcs.cs);
  const ag = col(s, prefix + ' (agent)'), people = colsLike(s, prefix);
  const rfa = col(s, 'Ready for agent'), rfm = col(s, 'Ready for merge');
  const yes = (r, c) => c >= 0 && /^yes$/i.test(String(r[c]).trim());
  const out = [];
  if (csCol < 0) return out;
  s.rows.forEach(r => {
    const id = String(r[csCol]).trim();
    if (!id) return;
    const sts = stOfCs[id] || [];
    const needs = [];
    if (ag >= 0 && (!DRAFTING || people.some(i => String(r[i]).trim()))) {
      const bare = String(r[ag]).replace(STALE + '\n', '').trim();
      if (!bare || [].concat(basisOf(s.header, r, exact, prefix)).indexOf(basisOfCs[id]) < 0) needs.push('proposal');
    }
    if (DRAFTING && !issueOfCs[id]) needs.push('issue');
    if (yes(r, rfa) && sts.every(x => !x || x === 'Not started')) needs.push('ready');
    if (yes(r, rfm) && sts.some(x => x === 'PR open' || x === 'Ready for review')) needs.push('merge');
    if (needs.length) out.push([id, needs.join(', ')]);
  });
  return out;
}

/**
 * Write the Watch tab (hidden; the script's own): A1 "Signature", B1 a hash
 * of the list, C1 "Checked (UTC)", D1 when; row 2 the headers; then one row
 * per change set that needs the agent. The watching agent reads A1:D1 and
 * reads on only when the list is not empty. The list is rewritten only when
 * it changes; the time on every run, so a stopped script shows.
 */
function writeWatch(ss) {
  try {
    const list = watchList(ss);
    let sh = ss.getSheetByName(WATCH_TAB);
    if (!sh) {
      sh = ss.insertSheet(WATCH_TAB);
      sh.hideSheet();
    }
    const sig = hashOf(JSON.stringify(list));
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
    const old = sh.getLastRow() >= 1 ? String(sh.getRange(1, 2, 1, 1).getDisplayValues()[0][0]).trim() : '';
    if (old !== sig) {
      sh.getRange(1, 1, Math.max(sh.getLastRow(), 2 + list.length), 4).clearContent();
      sh.getRange(1, 1, 2 + list.length, 4).setValues(
        [['Signature', sig, 'Checked (UTC)', now], ['Change-set', 'Needs', '', '']]
          .concat(list.map(([id, n]) => [asText(id), n, '', ''])));
    } else {
      sh.getRange(1, 4, 1, 1).setValues([[now]]);
    }
  } catch (err) {
    // A Watch tab that cannot be written must never stop the refresh.
  }
}
// ---------- sheet helpers ----------

/**
 * Rows above the header whose first cell starts "Instructions" (or, before
 * 2026-10-31 09:30Z, "Colour key") are for people: the header is the first row
 * after them, and `top` is the sheet row of the first data row (2 with none).
 * Every write goes through `top`.
 */
const LEGEND_RE = /^(instructions|colou?r key)\b/i;
function legendCount(firstCells) {
  let h = 0;
  while (h < firstCells.length - 1 && LEGEND_RE.test(String(firstCells[h]).trim())) h++;
  return h;
}
/**
 * The colour words in each tab's Instructions text are shown in their own
 * colour (owner, 2026-10-31: "no color coded instructions"). The key on the
 * first line ("Blue = your input ...") is coloured segment by segment, and
 * every later Blue, Green, Orange or Grey word by itself, bold. A cell is
 * only rewritten when its first colour word is not yet coloured, so this is
 * cheap enough to run on every refresh; the agent rewrites the text through
 * the API, which drops the colours, and the next refresh puts them back.
 * Links in the text are kept as links.
 */
const KEY_COLOURS = { blue: '#1f5fa8', green: '#2e7d32', orange: '#c25e00', grey: '#666666' };
const KEY_WORD_RE = /\b(blue|green|orange|grey)\b/gi;
function keyRuns(text) {
  const runs = [];
  const nl = text.indexOf('\n');
  const first = nl < 0 ? text : text.slice(0, nl);
  let keyEnd = 0;
  if (/^(blue|green|orange|grey) = /i.test(first)) {
    const seg = /(blue|green|orange|grey) = .*?(?=\s{3,}|$)/gi;
    let m;
    while ((m = seg.exec(first))) runs.push([m.index, m.index + m[0].length, KEY_COLOURS[m[1].toLowerCase()]]);
    keyEnd = first.length;
  }
  let m;
  KEY_WORD_RE.lastIndex = keyEnd;
  while ((m = KEY_WORD_RE.exec(text))) runs.push([m.index, m.index + m[0].length, KEY_COLOURS[m[1].toLowerCase()]]);
  return runs;
}
/**
 * The Config tab's colours, kept by every refresh so a row the agent wrote
 * with the Sheets connector (which writes values, not colours) still reads
 * right (owner, 2026-10-31: "key cfg and COLS need to be grey"). The Key
 * row is a Grey header; EDITORS, the one row a person keeps, is Orange; every
 * other row below the Instructions (CFG, COLS, DATA and their continuation
 * rows) is Grey, written by the agent. The Instructions rows are left as
 * they are.
 */
const CONFIG_COLOURS = { header: '#b7b7b7', person: '#f4b26b', agent: '#efefef' };
function styleConfig(ss) {
  if (!ss) throw new Error(RUN_THIS);
  const sh = ss.getSheetByName(CONFIG_TAB);
  if (!sh) return;
  const n = sh.getLastRow();
  if (n < 1) return;
  const keys = sh.getRange(1, 1, n, 1).getDisplayValues().map(r => String(r[0]).trim());
  const start = keys.indexOf('Key');
  if (start < 0) return;
  // The Instructions rows fit their text: a row inserted next to a tall one
  // inherits its height (owner, 2026-10-31: "row too high").
  try { if (start > 0) sh.autoResizeRows(1, start); } catch (e) { /* cosmetic */ }
  keys.forEach((k, i) => {
    if (i < start || /^Instructions/.test(k)) return;
    const bg = k === 'Key' ? CONFIG_COLOURS.header : k === 'EDITORS' ? CONFIG_COLOURS.person : CONFIG_COLOURS.agent;
    const row = sh.getRange(i + 1, 1, 1, 2).setBackground(bg).setVerticalAlignment('top');
    if (k === 'Key' || k === 'EDITORS') row.setFontWeight('bold');
  });
}

function colourInstructions(ss) {
  if (!ss) throw new Error(RUN_THIS);
  ss.getSheets().forEach(sh => {
    const n = Math.min(5, sh.getLastRow());
    if (n < 2 || sh.getLastColumn() < 2) return;
    const h = legendCount(sh.getRange(1, 1, n, 1).getDisplayValues().map(r => r[0]));
    for (let r = 1; r <= h; r++) {
      const cell = sh.getRange(r, 2);
      const now = cell.getRichTextValue();
      const text = now ? now.getText() : '';
      const runs = keyRuns(text);
      if (!runs.length || (now.getTextStyle(runs[0][0], runs[0][1]).getForegroundColor() || '').toLowerCase() === runs[0][2]) continue;
      const b = SpreadsheetApp.newRichTextValue().setText(text);
      runs.forEach(([a, z, c]) => b.setTextStyle(a, z, SpreadsheetApp.newTextStyle().setForegroundColor(c).setBold(true).build()));
      const url = /https?:\/\/\S+/g;
      let u;
      while ((u = url.exec(text))) b.setLinkUrl(u.index, u.index + u[0].length, u[0]);
      cell.setRichTextValue(b.build());
    }
  });
}
/** The sheet row of the first data row, reading only column A's top cells. */
function topRow(sh) {
  const a = sh.getRange(1, 1, Math.min(5, Math.max(sh.getLastRow(), 1)), 1).getDisplayValues();
  return legendCount(a.map(r => r[0])) + 2;
}
function readSheet(sh) {
  const last = sh.getLastRow();
  const width = sh.getLastColumn();
  const values = sh.getRange(1, 1, Math.max(last, 1), width).getDisplayValues();
  const h = legendCount(values.map(r => r[0]));
  return { sh, top: h + 2, header: values[h].map(x => String(x).trim()), rows: values.slice(h + 1) };
}
/**
 * Public comment's people's columns were "Architect Feedback ..." until
 * 2026-10-31, when the owner had them named for the process role, "Committee
 * Feedback ..." (the Feedback Review Committee). A header is found under
 * either name, so a sheet works before and after its columns are renamed.
 */
const RENAMED = [['Committee Feedback', 'Architect Feedback']];
function aliasOf(name) {
  for (const [now, was] of RENAMED) {
    if (String(name).indexOf(now) >= 0) return String(name).replace(now, was);
    if (String(name).indexOf(was) >= 0) return String(name).replace(was, now);
  }
  return null;
}
/**
 * The agent's proposal columns, renamed by the owner on 2026-10-31:
 * "Contributor Feedback (agent)" is "Feedback (agent)", and the public-comment
 * "Architect Feedback (agent)" (briefly "Committee Feedback (agent)") is
 * "Change Set Feedback (agent)". Each is found under any of its names.
 */
const SAME_COLUMN = [
  ['Feedback (agent)', 'Contributor Feedback (agent)'],
  ['Change Set Feedback (agent)', 'Committee Feedback (agent)', 'Architect Feedback (agent)'],
];
function col(s, name) {
  const i = s.header.indexOf(name);
  if (i >= 0) return i;
  const same = SAME_COLUMN.filter(g => g.indexOf(name) >= 0)[0];
  if (same) {
    for (const n of same) { const j = s.header.indexOf(n); if (j >= 0) return j; }
    return -1;
  }
  const a = aliasOf(name);
  return a === null ? -1 : s.header.indexOf(a);
}
function cols(s, name) {
  const a = aliasOf(name);
  return s.header.map((h, i) => (h === name || (a !== null && h === a) ? i : -1)).filter(i => i >= 0);
}
/**
 * Columns whose header is `name` or `name (...)`, e.g. "Contributor Feedback
 * (CL)": the people's. `name (agent)` is the agent's proposal, not a
 * person's feedback, so it is left out.
 */
function colsLike(s, name) {
  const like = n => s.header.map((h, i) => ((h === n || String(h).indexOf(n + ' (') === 0) &&
    h !== n + ' (agent)' ? i : -1)).filter(i => i >= 0);
  const a = aliasOf(name);
  return like(name).concat(a === null ? [] : like(a)).sort((x, y) => x - y);
}

/** Write f(row, k) into column c: every row, or only the rows in `only`. */
function writeRows(s, c, only, f) {
  if (c < 0) return;
  if (!only) return writeRich(s, c, s.rows.map(f));
  only.forEach(k => s.sh.getRange(k + s.top, c + 1, 1, 1).setRichTextValues([[f(s.rows[k], k)]]));
}

/**
 * Text as a cell value that Sheets can never read as a formula: a leading
 * =, +, - or @ gets an apostrophe, which Sheets keeps out of the shown text.
 * Every value the script writes with setValues that a person or the agent
 * typed goes through it (security review 2026-10-31, finding F1).
 */
function asText(v) {
  const t = String(v == null ? '' : v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/** A string inside a formula's double quotes: each " doubled (finding F2). */
function q(v) { return String(v).replace(/"/g, '""'); }

/** A short hash of a string (djb2), to notice a change without keeping the text. */
function hashOf(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * What an agent proposal was written against: a hash of the row's blue
 * (people's) cells, by header: those in `exact`, and every `prefix` or
 * `prefix (...)` column but `prefix (agent)`. Picks are compared bare, so a
 * tree mark the script adds is no change. feedback-issue.ts feedbackBasis
 * computes the same hash for the agent, which keeps it in the Agent tab's
 * Feedback basis (change set).
 *
 * Empty cells are left out, so adding an empty column (a new reviewer's
 * initials) changes no row's basis. Returns that hash first, then the older
 * one that kept empty cells, so a basis an agent wrote before the change still
 * matches until it next writes one.
 */
function basisOf(header, row, exact, prefix) {
  const parts = [], legacy = [];
  header.forEach((h, i) => {
    let v = String(row[i] == null ? '' : row[i]).trim();
    if (h === 'Selected Sections') v = v.split(',').map(bareName).filter(Boolean).join(',');
    const alt = aliasOf(prefix);
    const isFb = p => p !== null && (h === p || h.indexOf(p + ' (') === 0) && h !== p + ' (agent)';
    if (exact.indexOf(h) >= 0 || isFb(prefix) || isFb(alt)) {
      legacy.push(h + '=' + v);
      if (v) parts.push(h + '=' + v);
    }
  });
  // A basis written before a rename (RENAMED) names the columns the old way.
  const was = t => t.map(x => { const a = aliasOf(x.split('=')[0]); return a === null || x.indexOf('Committee') !== 0 ? x : a + x.slice(x.indexOf('=')); });
  return [hashOf(parts.join('\n')), hashOf(legacy.join('\n')), hashOf(was(parts).join('\n')), hashOf(was(legacy).join('\n'))];
}

/** "2026-10-30 22:30Z" (or ISO) -> ms, or NaN. */
function utcMs(t) {
  return Date.parse(String(t).trim().replace(' ', 'T').replace(/(\d)$/, '$1Z'));
}

/**
 * The Staging review page cell: a "review" link to the change set's preview,
 * marked stale when a PR of the change set was completed after the preview
 * was built (Agent: Agent completed vs Staging built). Without a build time
 * nothing is claimed either way.
 */
function stagingCell(url, built, prs, readyAt) {
  const w = stagingWarning(url, built, prs, readyAt);
  if (!url) return rich(w ? [{ t: w, bold: true }] : []);
  return rich([{ t: 'review', url: url }].concat(w ? [{ t: ' ' + w, bold: true }] : []));
}

/**
 * Why the preview cannot be trusted, or '' (owner, 2026-10-31: "Staging
 * Review column should show warning when stale"). The agent checks GitHub and
 * writes what it found on the Agent tab; the script only compares, so it
 * needs no internet access:
 *   - PR head (change set): each PR's latest commit, one per line;
 *   - Staging built from (change set): the commit the preview was built from,
 *     as its gh-pages commit records it ("staging(slug): from <sha>");
 *   - Staging deploy (change set): the Pages deploy of that commit, deployed,
 *     pending or failed.
 * The active PR is the last one listed (one branch, one active PR per row).
 * Without those columns it falls back to times: Agent completed later than
 * Staging built.
 */
function stagingWarning(url, built, prs, readyAt) {
  const b = built || {};
  const active = (prs || []).filter(p => p.head).slice(-1)[0];
  if (!url) return active ? '\u26a0 no preview yet: not ready for merge' : '';
  const deploy = String(b.deploy || '').toLowerCase();
  if (/fail|error/.test(deploy)) return '\u26a0 deploy failed';
  if (active && b.from) {
    const n = Math.min(active.head.length, b.from.length, 40);
    if (n >= 7 && active.head.slice(0, n).toLowerCase() !== b.from.slice(0, n).toLowerCase())
      return '\u26a0 stale: built from ' + b.from.slice(0, 7) + ', PR now at ' + active.head.slice(0, 7);
  }
  if (/pend|queue|progress|build/.test(deploy)) return '\u26a0 deploy in progress';
  const at = utcMs(b.at);
  // An Editor sent the row back to the agent after this preview was built:
  // the PR is about to change, so the preview no longer shows the agreed text.
  if (readyAt && !isNaN(at) && utcMs(readyAt) > at)
    return '\u26a0 missing feedback from ' + readyAt;
  const done = (prs || []).map(p => utcMs(p.done)).filter(x => !isNaN(x));
  if (!isNaN(at) && !(active && b.from) && done.some(x => x > at))
    return '\u26a0 stale: built ' + String(b.at).trim() + ', PR changed since';
  return '';
}
/** A change set with a PR whose head the agent recorded, and so owes a preview. */
function awaitsPreview(prs) { return (prs || []).some(p => p.head); }
function builtInfo(r, at, from, deploy) {
  const v = c => (c >= 0 ? String(r[c]).trim() : '');
  return { at: v(at), from: v(from), deploy: v(deploy) };
}

/** Flag the agent's proposal (column `agentName`) of each row whose basis moved on. */
function markStale(s, csCol, basisOfCs, exact, prefix, agentName) {
  const ag = col(s, agentName);
  if (ag < 0 || csCol < 0) return;
  s.rows.forEach((r, k) => {
    const t = staleText(r[ag], basisOf(s.header, r, exact, prefix), basisOfCs[String(r[csCol]).trim()]);
    if (t !== null) s.sh.getRange(k + s.top, ag + 1, 1, 1).setValues([[asText(t)]]);
    unready(s, r, k, r[ag], t);
  });
}

/**
 * When a proposal turns stale, set the row's Ready for agent back to No, so
 * an Editor decides again: setting it to Yes tells the agent to update the
 * row's PR (owner, 2026-10-31). Only on the turn, so a Yes set while the row
 * is stale stays.
 */
function unready(s, r, k, before, after) {
  const ready = col(s, 'Ready for agent');
  if (ready < 0 || after === null || String(after).indexOf(STALE + '\n') !== 0) return;
  if (String(before).indexOf(STALE + '\n') === 0) return;
  if (/^yes$/i.test(String(r[ready]).trim())) s.sh.getRange(k + s.top, ready + 1, 1, 1).setValues([['No']]);
}

const STALE = '\u26a0 Stale: the row changed since this proposal; the agent will propose again.';

/**
 * Flag or unflag an agent proposal: its first line is STALE while the row's
 * basis differs from the one the agent wrote it against. Returns the new
 * text, or null when nothing changes.
 */
function staleText(text, basis, written) {
  // basis: the row's hash, or the list basisOf gives (current, then legacy).
  const ok = [].concat(basis).indexOf(written) >= 0;
  const bare = String(text).indexOf(STALE + '\n') === 0 ? String(text).slice(STALE.length + 1) : String(text);
  if (!bare.trim() || !written) return bare === String(text) ? null : bare;
  const want = ok ? bare : STALE + '\n' + bare;
  return want === String(text) ? null : want;
}

function writeRich(s, c, rich) {
  if (c < 0 || !rich.length) return;
  s.sh.getRange(s.top, c + 1, rich.length, 1).setRichTextValues(rich.map(v => [v]));
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
/**
 * Agentic status: the agent's status and its PRs, preceded by who has the
 * row now (owner, 2026-10-31: "agentic status to update saying that an agent
 * has it (w/ link to discussion/conversation)"). Ready for agent set after
 * the agent's last completion reads "Queued for the agent" until the agent
 * records Working; Working links its conversation when the agent gave one.
 */
function agenticCell(status, prs, o) {
  o = o || {};
  const done = prs.map(p => utcMs(p.done)).filter(x => !isNaN(x));
  const last = done.length ? Math.max.apply(null, done) : NaN;
  const queued = o.readyAt && !/working/i.test(status) && (isNaN(last) || utcMs(o.readyAt) > last);
  const head = queued ? [{ t: 'Waiting on the agent since ' + o.readyAt + ' (Ready for agent set)', bold: true }]
    : /working/i.test(status) && o.talk ? [{ t: 'An agent is working on it: ', bold: true }, { t: 'conversation', url: o.talk }]
    : /needs human/i.test(status) ? [{ t: NEEDS_YOU + ': it is under "Decision needed" in the agent\'s feedback column. Write your answer (the letter) in your Blue feedback column, then an Editor sets Ready for agent to Yes.', bold: true }] : [];
  const body = agenticParts(status, prs);
  return rich(head.length ? head.concat(body.length && body[0].t ? [{ t: '\n' }].concat(body) : []) : body);
}
function agenticParts(status, prs) {
  if (!prs.length) return [{ t: status }];
  return prs.flatMap((p, i) => (i ? [{ t: '\n' }] : []).concat(
    [{ t: prLabel(p.url), url: p.url }],
    status || p.done ? [{ t: ' ' }, { t: '(' + [status, p.done].filter(Boolean).join(', ') + ')', bold: true }] : [],
    p.desc ? [{ t: ' · ' + p.desc }] : []));
}

/** "smart-ra#97": the repository and number, since Sheets' link popup cuts the URL short. */
const prLabel = url => { const m = url.match(/\/([^/]+)\/pull\/(\d+)$/); return m[1] + '#' + m[2]; };

/** The PRs of some change-sets, each once, in order. */
function prsOfAll(css, prOf) {
  const seen = {};
  return css.flatMap(cs => prOf[cs] || []).filter(p => !seen[p.url] && (seen[p.url] = 1));
}

const pdfUrl = printed => CFG.DRAFT + (printed + DATA.PAGE_OFFSET);

// ---------- parsing ----------

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keysWith = p => Object.keys(DATA.SECTIONS || {}).filter(k => k.startsWith(p)).map(k => k.slice(2)).sort((a, b) => b.length - a.length);
const alt = xs => (xs.length ? xs.map(esc).join('|') : '(?!)');
const SEC_RE = () => new RegExp(
  'Appendix\\s+([A-Z])\\b|\\b([A-Z]\\.\\d+(?:\\.\\d+)*)\\b|\\b(\\d+(?:\\.\\d+)+)\\b|(' + alt(keysWith('c:')) +
  ')|\\b(' + alt(Object.keys(DATA.ABBREVIATIONS || {})) + ')\\b|(' + alt(keysWith('f:')) + ')|\\b(?:Chapter|Ch\\.?)\\s*(\\d+)\\b', 'gi');

function sectionKey(m) {
  if (m[1]) return DATA.SECTIONS[m[1].toUpperCase()] ? m[1].toUpperCase() : null;
  const num = m[2] || m[3];
  if (num) {
    const parts = num.toUpperCase().split('.');
    while (parts.length) {
      const k = parts.length === 1 && /^\d+$/.test(parts[0]) ? 'ch' + parts[0] : parts.join('.');
      if (DATA.SECTIONS[k]) return k;
      parts.pop();
    }
    return null;
  }
  if (m[4]) return DATA.SECTIONS['c:' + m[4].toLowerCase()] ? 'c:' + m[4].toLowerCase() : null;
  if (m[5]) return m[5] === m[5].toUpperCase() && DATA.ABBREVIATIONS[m[5]] ? 'c:' + DATA.ABBREVIATIONS[m[5]] : null;
  if (m[6]) {
    const k = 'f:' + m[6].toLowerCase();
    return DATA.SECTIONS[k] ? k : null;
  }
  if (m[7]) return DATA.SECTIONS['ch' + m[7]] ? 'ch' + m[7] : null;
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
    if (a >= 1 && a <= DATA.LAST_PAGE && b >= a && b <= DATA.LAST_PAGE && b - a < 30) out.push({ a: m.index, z: m.index + m[0].length, from: a, to: b });
  }
  return out;
}

/** PDF page holding draft line `line`, preferring pages near the printed candidates */
function pageOfLine(line, printedCands) {
  const holds = DATA.PAGE_LINES.filter(([, lo, hi]) => line >= lo && line <= hi).map(([p]) => p);
  for (const q of printedCands) {
    const pdf = q + DATA.PAGE_OFFSET;
    for (const d of [0, 1, -1, 2]) if (holds.includes(pdf + d)) return pdf + d;
  }
  if (holds.length === 1) return holds[0];
  return printedCands.length ? printedCands[0] + DATA.PAGE_OFFSET : null;
}

/** links for the Line no(s) column: p.N and line references */
function lineLinks(text, rowPrinted) {
  const links = [];
  const pRe = /\bp(?:p|age)?\.\s*(\d{1,3})\b/gi;
  const ctx = []; // [index, printed page] from p.N tokens in this cell
  let m;
  while ((m = pRe.exec(text))) {
    const n = +m[1];
    if (n >= 1 && n <= DATA.LAST_PAGE) {
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
      return [pc ? '=HYPERLINK("' + q(CFG.PC_PAGE + pc) + '",' + (isNaN(+n) ? '"' + q(n) + '"' : +n) + ')' : (n === '' ? '' : isNaN(+n) ? asText(n) : +n)];
    });
    if (f.length) s.sh.getRange(s.top, c.no + 1, f.length, 1).setValues(f);
  }
  const printedOf = r => (c.page >= 0 ? pageTokens(String(r[c.page])).map(t => t.from) : []);
  writeRich(s, c.sections, s.rows.map(r => {
    const t = String(r[c.sections]);
    return linked(t, sections(t).map(x => ({ a: x.a, z: x.z, url: CFG.DRAFT + DATA.SECTIONS[x.key][1] })));
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
  rpc.rows.forEach((r, i) => (rowOf[String(r[p.no]).trim()] = { r, at: i + rpc.top }));
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
  const status = [];
  s.rows.forEach(r => {
    const cs = String(r[c.cs]).trim();
    const sts = [...new Set((csOf[cs] || []).map(n => stOf[n]).filter(Boolean))].join(', ');
    out.agentic.push(agenticCell(sts, prOf[cs] || []));
    status.push([asText(csStatus((csOf[cs] || []).map(n => stOf[n]).filter(Boolean)))]);
    const nos = (csOf[cs] || []).filter(n => rowOf[n]).sort((a, b) => a - b);

    const keys = {}, raw = [];
    nos.forEach(n => {
      const t = get(n, 'sections');
      const found = sections(t);
      found.forEach(x => (keys[x.key] = 1));
      if (!found.length && t && !raw.some(x => x.toLowerCase() === t.toLowerCase())) raw.push(t);
    });
    const secParts = Object.keys(keys)
      .sort((a, b) => DATA.SECTIONS[a][1] - DATA.SECTIONS[b][1] || a.localeCompare(b))
      .map(k => ({ t: DATA.SECTIONS[k][0], url: CFG.DRAFT + DATA.SECTIONS[k][1] }))
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
  // One plain status per change set, for filtering (owner, 2026-10-31).
  const st = COLS.rcs.status ? col(s, COLS.rcs.status) : -1;
  if (st >= 0 && status.length) s.sh.getRange(s.top, st + 1, status.length, 1).setValues(status);
}

/**
 * The Agent tab's Agentic status values, in the order work moves through
 * them. A change set's one status for filtering: "Needs human" if any of its
 * comments needs a person, else the least advanced of them; "Not in comment
 * record" only when every one is. A value not in the list is kept as is.
 */
// What a person must do, said in the sheet instead of the agent's own
// "Needs human" (owner, 2026-10-31: "unclear: needs human to do what?").
const NEEDS_YOU = "Needs you: answer the agent's question";
const shownStatus = st => (/^needs human$/i.test(String(st).trim()) ? NEEDS_YOU : st);
const STATUS_ORDER = ['Not started', 'Working', 'PR open', 'Ready for review', 'Change merged'];
function csStatus(sts) {
  if (!sts.length) return '';
  if (sts.indexOf('Needs human') >= 0) return NEEDS_YOU;
  const known = sts.filter(x => x !== 'Not in comment record');
  if (!known.length) return 'Not in comment record';
  const odd = known.filter(x => STATUS_ORDER.indexOf(x) < 0);
  if (odd.length) return odd[0];
  return STATUS_ORDER[Math.min.apply(null, known.map(x => STATUS_ORDER.indexOf(x)))];
}

// ---------- Drafting: Contributor Feedback ----------

/**
 * One row of Contributor Feedback is one change set. The script:
 * - gives any row a person has filled in (other than "No") but with no
 *   Change-set the next id (CS-001, CS-002, ...), once; it stays with the row;
 * - keeps Selected Sections valid when the document changes: a pick is
 *   rewritten to the section's current name (found by its anchor, so a
 *   renamed or renumbered section follows), and a pick whose section is gone
 *   is kept and flagged in Section links, for a person to pick again;
 * - writes Section links: each picked section, linked to its anchor on the
 *   document page, one per line (Sections itself stays the plain dropdown);
 * - fills Issue, Agentic status and Staging review page from the Agent tab,
 *   by change set;
 * - keeps the hidden TOC tab, the Sections dropdown's list, current.
 */
function refreshDraft(rows) {
  const ss = SpreadsheetApp.getActive();
  const props = docProps_();
  const fb = readSheet(ss.getSheetByName(CFG.FEEDBACK));
  const agentSh = ss.getSheetByName(CFG.AGENT);
  const agent = agentSh ? readSheet(agentSh) : { header: [], rows: [] };
  // A changed table of contents (the agent rewrote Config) rebuilds all rows,
  // since any pick may need repair; otherwise only the rows asked for.
  const tocKey = hashOf(JSON.stringify(DATA.TOC));
  let only = rows ? rows.filter(k => k >= 0 && k < fb.rows.length) : null;
  if (props.getProperty('tocKey') !== tocKey) only = null;
  const prev = only ? {} : writeToc(ss);
  props.setProperty('tocKey', tocKey);

  const c = {};
  Object.entries(COLS.draft).forEach(([k, h]) => (c[k] = col(fb, h)));
  const fbCols = colsLike(fb, COLS.draft.feedback);
  const a = {};
  Object.entries(COLS.draftAgent).forEach(([k, h]) => (a[k] = col(agent, h)));
  // Columns added after a sheet's Config was written are found by their default names.
  [['head', 'PR head (change set)'], ['builtFrom', 'Staging built from (change set)'], ['deploy', 'Staging deploy (change set)'],
    ['conversation', 'Agent conversation (change set)']]
    .forEach(([k, h]) => { if (a[k] === undefined) a[k] = col(agent, h); });

  // Rows whose change set's Agent row changed since the last run.
  // One property per change set ("a:CS-001"), never one large JSON value,
  // which would pass the 9 kB property limit near 450 change sets (F4).
  const all = props.getProperties ? props.getProperties() : {}, keys = {}, put = {};
  agent.rows.forEach(r => {
    const id = a.csId >= 0 ? String(r[a.csId]).trim() : '';
    if (id) keys[id] = hashOf(r.join('\u0001'));
  });
  const seen = {};
  Object.keys(keys).forEach(id => {
    seen[id] = all['a:' + id] !== undefined ? all['a:' + id] : props.getProperty('a:' + id);
    if (seen[id] !== keys[id]) put['a:' + id] = keys[id];
  });
  if (Object.keys(put).length) props.setProperties ? props.setProperties(put) : Object.keys(put).forEach(k => props.setProperty(k, put[k]));
  if (only) {
    fb.rows.forEach((r, k) => {
      const id = String(r[c.cs]).trim();
      if (id && keys[id] !== seen[id] && only.indexOf(k) < 0) only.push(k);
    });
    if (!only.length) return;
  }
  const want = k => !only || only.indexOf(k) >= 0;

  // Change-set ids: mechanical, assigned once, never reused.
  // A row is used once any cell a person fills holds something; "No" (a
  // Yes/No dropdown's default) and the script's own columns do not count.
  const mech = [c.cs, c.sectionLinks, c.issue, c.agentic, c.staging, c.status,
    col(fb, COLS.draft.agentFeedback || 'Feedback (agent)')];
  if (c.cs >= 0) {
    let next = 1 + fb.rows.reduce((m, r) => {
      const x = /^CS-(\d+)$/.exec(String(r[c.cs]).trim());
      return x ? Math.max(m, +x[1]) : m;
    }, 0);
    const given = [];
    fb.rows.forEach((r, k) => {
      const cur = String(r[c.cs]).trim();
      const used = r.some((v, i) => !mech.includes(i) && !/^(no)?$/i.test(String(v).trim()));
      if (cur || !used || !want(k)) return;
      r[c.cs] = 'CS-' + String(next++).padStart(3, '0');
      given.push(k);
    });
    if (given.length && !only) {
      fb.sh.getRange(fb.top, c.cs + 1, fb.rows.length, 1).setValues(fb.rows.map(r => [asText(String(r[c.cs]).trim())]));
    } else {
      given.forEach(k => fb.sh.getRange(k + fb.top, c.cs + 1, 1, 1).setValues([[fb.rows[k][c.cs]]]));
    }
  }

  const prOf = {}, stOf = {}, issuesOf = {}, stagingOf = {}, basisOfCs = {}, builtOf = {}, talkOf = {};
  agent.rows.forEach(r => {
    const id = a.csId >= 0 ? String(r[a.csId]).trim() : '';
    if (!id) return;
    if (a.conversation >= 0) talkOf[id] = (String(r[a.conversation]).match(/https:\/\/\S+/) || [''])[0];
    if (a.agentic >= 0) stOf[id] = String(r[a.agentic]).trim();
    if (a.issue >= 0) issuesOf[id] = String(r[a.issue]).split('\n').map(issueUrl).filter(Boolean);
    if (a.staging >= 0) stagingOf[id] = (String(r[a.staging]).match(/https:\/\/\S+/) || [''])[0];
    builtOf[id] = builtInfo(r, a.built, a.builtFrom, a.deploy);
    if (a.basis >= 0) basisOfCs[id] = String(r[a.basis]).trim();
    if (a.prs >= 0) {
      const descs = a.changes >= 0 ? String(r[a.changes]).split('\n').map(x => x.trim()) : [];
      const dones = a.done >= 0 ? String(r[a.done]).split('\n').map(x => x.trim()) : [];
      const heads = a.head >= 0 ? String(r[a.head]).split('\n').map(x => x.trim()) : [];
      prOf[id] = String(r[a.prs]).split('\n').map(x => x.trim()).filter(Boolean)
        .map((line, i) => ({ url: prUrl(line), desc: descs[i] || '', done: dones[i] || '', head: heads[i] || '' }))
        .filter(x => x.url);
    }
  });


  const tocUrl = {}, marked = {}, nameOf = {};
  // Names are compared bare: the dropdown marks sections under their chapter.
  DATA.TOC.forEach(([name, anchor]) => {
    tocUrl[bareName(name)] = CFG.SECTION_URL + anchor;
    marked[bareName(name)] = name;
    nameOf[anchor] = name;
  });
  // Keep every pick valid: its current dropdown name (with its tree mark),
  // or, for a section renamed since, the new name of the same anchor. A pick
  // whose section is gone stays, and Section links flags it.
  const gone = [];
  if (c.sections >= 0) {
    const fixed = [];
    fb.rows.forEach((r, k) => {
      if (!want(k)) return;
      const was = String(r[c.sections]).split(',').map(x => x.trim()).filter(Boolean);
      const now = [];
      gone[k] = [];
      was.forEach(p => {
        const b = bareName(p);
        const n = marked[b] || nameOf[prev[b]] || p;
        if (!marked[bareName(n)]) gone[k].push(b);
        if (!now.includes(n)) now.push(n);
      });
      if (now.join('\n') !== was.join('\n')) {
        fixed.push(k);
        r[c.sections] = now.join(', ');
      }
    });
    fixed.forEach(k => fb.sh.getRange(k + fb.top, c.sections + 1, 1, 1).setValues([[asText(fb.rows[k][c.sections])]]));
  }
  // Selected Sections is the people's multi-select dropdown, so it stays plain
  // text (a dropdown chip cannot carry a link). Section links is grey: one
  // linked line per picked section, then a flag for each pick no longer in
  // the document.
  writeRows(fb, c.sectionLinks, only, (r, k) => {
    const names = String(r[c.sections]).split(',').map(bareName).filter(x => tocUrl[x]);
    const parts = names.map(n => [{ t: n, url: tocUrl[n] }])
      .concat((gone[k] || []).map(n => [{ t: '\u26a0 "' + n + '" is not in the document now: pick its section again' }]));
    return rich(parts.flatMap((p, i) => (i ? [{ t: '\n' }] : []).concat(p)));
  });
  writeRows(fb, c.issue, only, r => {
    const urls = issuesOf[String(r[c.cs]).trim()] || [];
    return rich(urls.flatMap((u, i) => (i ? [{ t: '\n' }] : []).concat([{ t: issueLabel(u), url: u }])));
  });
  // When each row's Ready for agent turned Yes (owner, 2026-10-31: "i just
  // set Ready for agent to Y ... expected Staging review to get a stale
  // warning"). Kept per change set as "ready:CS-001" = the time, cleared on
  // No.
  const readyCol = col(fb, 'Ready for agent'), readyAt = {};
  if (readyCol >= 0) {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
    fb.rows.forEach((r, k) => {
      const cs = String(r[c.cs]).trim();
      if (!cs) return;
      const key = 'ready:' + cs, was = props.getProperty(key);
      if (/^yes$/i.test(String(r[readyCol]).trim())) {
        // A Yes the script first sees on a row the agent has already worked
        // (the script was just installed or re-pasted) counts from the
        // agent's last completion, not from now: it may already be answered.
        const done = (prOf[cs] || []).map(p => utcMs(p.done)).filter(x => !isNaN(x));
        const first = done.length ? new Date(Math.max.apply(null, done)).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : now;
        if (!was && want(k)) props.setProperty(key, first);
        readyAt[cs] = was || (want(k) ? first : '');
      } else if (was && want(k)) props.deleteProperty(key);
    });
  }
  writeRows(fb, c.agentic, only, r => {
    const cs = String(r[c.cs]).trim();
    return agenticCell(stOf[cs] || '', prOf[cs] || [], { readyAt: readyAt[cs], talk: talkOf[cs] });
  });
  // The same status as one plain value, for a filter (owner, 2026-10-31).
  if (c.status >= 0) writeRows(fb, c.status, only, r => rich([{ t: shownStatus(stOf[String(r[c.cs]).trim()] || '') }]));
  // Staging review page: the change set's preview while its PR is open.
  writeRows(fb, c.staging, only, r => {
    const cs = String(r[c.cs]).trim();
    return stagingCell(stagingOf[cs], builtOf[cs], prOf[cs], readyAt[cs]);
  });
  // Feedback (agent): flagged stale while the row's blue cells differ from
  // what the proposal was written against.
  const ag = col(fb, COLS.draft.agentFeedback || 'Feedback (agent)');
  if (ag >= 0) {
    fb.rows.forEach((r, k) => {
      if (!want(k)) return;
      const cs = String(r[c.cs]).trim();
      const t = staleText(r[ag], basisOf(fb.header, r, [COLS.draft.title, COLS.draft.sections], COLS.draft.feedback), basisOfCs[cs]);
      if (t !== null) fb.sh.getRange(k + fb.top, ag + 1, 1, 1).setValues([[asText(t)]]);
      unready(fb, r, k, r[ag], t);
    });
  }
}
/** A dropdown name without its indent (U+2800 blanks; old "\u2514 "/"\u2502 " marks) or spaces. */
const bareName = n => String(n).replace(/^[\s\u2800\u2502\u2514]+/, '').trim();
const issueUrl = line => (String(line).match(/https:\/\/github\.com\/[^\s,;]+\/issues\/\d+/) || [''])[0];
const issueLabel = url => { const m = url.match(/\/([^/]+)\/issues\/(\d+)$/); return m[1] + '#' + m[2]; };

/** The hidden TOC tab: column A the dropdown names, column B each linked. */
function writeToc(ss) {
  if (!ss) throw new Error(RUN_THIS);
  let sh = ss.getSheetByName(CFG.TOC);
  if (!sh) {
    sh = ss.insertSheet(CFG.TOC);
    sh.hideSheet();
  }
  // The names the dropdown offered until now, by anchor (column C), so a pick
  // of a section since renamed can follow it.
  const prev = {};
  const last = sh.getLastRow();
  if (last > 1 && sh.getLastColumn() >= 3) {
    sh.getRange(2, 1, last - 1, 3).getDisplayValues()
      .forEach(([name, , anchor]) => { if (name && anchor) prev[bareName(name)] = anchor; });
  }
  const rows = [['Section', 'Link', 'Anchor']].concat(DATA.TOC.map(([name, anchor]) =>
    [asText(name), '=HYPERLINK("' + q(CFG.SECTION_URL + anchor) + '","open")', asText(anchor)]));
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  const extra = last - rows.length;
  if (extra > 0) sh.getRange(rows.length + 1, 1, extra, 3).clearContent();
  return prev;
}
