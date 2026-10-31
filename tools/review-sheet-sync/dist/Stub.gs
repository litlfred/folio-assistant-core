/**
 * Folio review sheet: the stub that stays in each sheet.
 *
 * The code itself lives once, in the Apps Script library "Folio Review
 * Library" (Script ID 1us7_ApIq_XvDG-V1XtqdcyHucF0hSlST0qracv1Tw9KTb4-lAFvK1bMQ),
 * added to this project under Libraries with the identifier Review and
 * version HEAD. Updating the library updates every sheet; this file never
 * changes. Each function hands the library this sheet's own services, so its
 * settings, lock and triggers stay this sheet's.
 *
 * First time: save, then pick installTriggers in the function list and press
 * Run (or, in the sheet, Review links > Install).
 * @OnlyCurrentDoc
 */
function installTriggers() { use_(); Review.installTriggers(); }
function onOpen() {
  // The menu is built here, so it shows even when the library cannot run
  // before the script is allowed (a simple trigger cannot ask for that).
  SpreadsheetApp.getUi().createMenu('Review links')
    .addItem('Refresh now', 'refreshAll')
    .addItem('Install (first time)', 'installTriggers')
    .addItem('Which version is this?', 'showVersion')
    .addToUi();
}
function refreshAll() { use_(); Review.refreshAll(); }
function markDirty(e) { use_(); Review.markDirty(e); }
function refreshIfDirty() { use_(); Review.refreshIfDirty(); }
function showVersion() { use_(); Review.showVersion(); }
function use_() { Review.init({ PropertiesService: PropertiesService, LockService: LockService, ScriptApp: ScriptApp }); }
