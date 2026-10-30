---
input: schemas/skills/public-comment/input.schema.json
output: schemas/skills/public-comment/output.schema.json
---

# public-comment

> Skill id: `public-comment` · Package: `folio-document-adapter` · Process:
> `folio-assistant-core/processes/content/public-comment.bpmn`
> (`Process_PublicComment`) · Tool: `folio-assistant-core/scripts/public-comment.ts`
> · Schema: `folio-assistant-core/schemas/public-comment.ts` · Bean `v26p`,
> issue #197.

Run a **public review** of a document folio. A frozen, line-numbered draft goes
out. Comments come back as spreadsheets, form exports, letters and GitHub
comments. Each comment is placed on the block it is about, triaged, weighed by
a review committee and decided by an editor. Where a decision changes the
document, the change lands on a feature branch whose staging preview shows the
text before and after.

## The one fact everything rests on: a comment cites the REVIEW VERSION

A reviewer writes "§3.4.5, p.22, l.618–624". Those numbers exist only in the
PDF the reviewer read. Word computes pages and lines at layout time and stores
neither. Once an editor changes the folio, the numbers no longer describe the
current text.

So the review version is frozen in the library, and the folio is extracted from
it in two halves:

1. `docx-structure.py` reads the **structure** from the .docx: headings, lists,
   tables, figures, footnotes, call-out boxes.
2. `pdf-line-map.py` reads the **page and line** of every item from the
   line-numbered PDF, by matching letters only. A miss is reported, never
   guessed.
3. `docx-to-folio.ts` writes the editable folio. Every block's `meta.source`
   records its page, printed page and lines. `review-anchors.json` is the same
   index in one file, which is what the importer reads.

**Never regenerate the folio over editors' work.** `docx-to-folio.ts` refuses
a non-empty folio without `--force`. The anchors keep resolving after edits,
because they point at the frozen version, not at the current text.

Read the alignment stats (`pdf-line-map.json` → `stats`) before trusting a
comment's anchor. On the DPI-H draft, 97% of text items aligned to exact lines.
The `unaligned` rest are listed by method, not hidden.

## Intake: one store, four routes, nothing dropped

| route | command | anchor comes from |
|---|---|---|
| comment matrix (.xlsx) | `import <file>` | section, page, line or Table/Figure columns |
| online-form export (.csv) | `import <file> --channel online-form` | the same columns, per row |
| narrative letter or email | `import-narrative <file> --reviewer …` | section, page/line, table or quotation in each paragraph |
| committee or editor on GitHub | the `github` job, from an issue or PR comment | the `pc:` reference |

### A consolidated review log

A secretariat often keeps one workbook for the whole review: a master log, a
tab per large submission, and a contributors sheet. `import` reads **every**
sheet that holds a comment table, records the sheet on each comment, and
passes over a blank template tab. Pass `--series <id>` naming the log. A copy
re-sent later is a different file holding the same rows, and each comment
carries the log's own row number ("No."), so a re-import adds only the rows
it has not seen.

What the log already says is carried, not re-done:

- **Status.** "Accepted", "Partially accepted", "Not accepted", "Noted" and
  "Deferred" arrive *decided*, with the log's disposition as the reason and
  `review-log` as who recorded it. "Reviewed" arrives *triaged*. A refusal
  with no rationale arrives triaged and is listed as held, because the
  commenter is owed a reason.
- **Categorisations.** Theme, stakeholder type, committee routing, a review
  question or priority ("Q9 - Conformance and testing", "P1") are kept in
  `labels`, verbatim and keyed by the column header. The three comment types
  stay `type`.
- **Consent.** Read from the contributors sheet by name, and only the name
  and consent columns are read. "NAIR, Tapas" and "Tapas Nair" are one
  person.

Rules that are not negotiable:

- **A row that resolves to nothing is `unplaced`, not dropped.** Triage places
  it (`triage <ref> --to <label>`) or leaves it as a general comment.
- **A narrative is split only where it cites something.** Paragraphs that cite
  nothing stay together as ONE general comment. Inventing an anchor for them
  would put a reviewer's words on a paragraph they never mentioned.
- **Re-importing a file is a no-op.** Batches are keyed by sha256.
- **Privacy.** The reviewer's email is never written, and an address typed
  into a comment's text is removed too. Their name is written
  only when they answered the acknowledgement question "Yes". Keep the
  original spreadsheets OUT of the folio's repository, because they hold
  emails. Record the batch, and keep the file in the review owner's private
  store.

### The live review sheet: "Ready for agent" and the Agent tab

A secretariat may keep working in the log after the import, as a shared Google
Sheet (owner, 2026-10-30, smart-ra). The master log is then split into tabs,
joined by the log's own row number, **No.** Exactly one tab is written by the
agent. Every other agent-facing column is a formula over it, so the views stay
current without anyone, person or agent, refreshing them.

| tab | who writes it | holds |
|---|---|---|
| **Source Comments** | people | No., date received, channel, reviewer, organisation, country, stakeholder type |
| **Review** | people, plus formula columns | No., section, page, line, comment type, theme, the two TWG categorisations, comment, `Suggested revision (call notes)` and any number of `Suggested revision (<initials>)` columns, status, disposition, **Ready for agent** (Yes/No), **Ready for merge** (Yes/No, set by the owner only); then formula columns read from Agent by No.: agentic status (a link to its PR when it has one), staging review page, public comment (PC) link, change-set (CS) link, pull request link, and a link to the page in the frozen review draft |
| **Agent** | **the agent, and only the agent** | A–J, one row per No.: No., comment ref, agentic status, agentic action taken, agentic applied in (section / version), agentic handled by, agentic date actioned, pull request, staging review page, change-set. L–N: the change-set list (id, title, status from the record) |
| **Change Sets** | formulas only | one row per change-set from Agent L–N, with its comment count, its comment Nos., how many are Ready for agent, and a link to the public-comments page |
| **By Change Set** | formulas only | the Review tab regrouped: one row per comment, sorted by change-set then No., carrying every Suggested revision column, status, disposition, Ready for agent and agentic status. Its headers are Review's own, so renaming a Suggested revision header there renames it here |

**Locks** (owner, 2026-10-30). Protected ranges leave editors only the
comment type, theme, both TWG categorisations, Suggested revision and
"Ready for agent" cells (not their headers) on the
Review tab. "Ready for merge" is protected too: only the owner sets it, because
a Yes makes the agent merge. Every other Review column and every other tab is
protected. The
owner's account, which is also the account the agent's connector uses, can
still edit everything: Google always lets the owner through.

The agent reads **every** Review column whose header starts with "Suggested
revision". It does not read a fixed column letter. A board adds its column
beside the others and renames `(initials)` to its own.

**Moving columns.** People may reorder the Review tab. By Change Set finds
its columns by header name (`MATCH` on Review's first row, and every header
starting "Suggested revision"), so a move does not break it. A renamed
header that it looks up by name (No., Section no., Comment / issue, Status,
Disposition / rationale, Ready for agent) does, and the formula must be
updated with the new name. Never write a fixed column number into a view.

**How the views update.** Change Sets and By Change Set are `FILTER`, `SORT`,
`VLOOKUP` and `BYROW` formulas over Review and Agent. Setting Ready for agent
to Yes, editing a revision, or the agent writing an Agent row shows in them at
once. Nothing is run to refresh them. Two things are not automatic:

- **A new or retitled change-set** reaches the sheet only when the agent
  rewrites Agent L–N from `review/public-comment/changesets/`.
- **A comment's change-set** (Agent J) is the change-set whose `refs` hold the
  comment. The agent rewrites it when a comment is moved between change-sets.

**When the agent runs.** A *sheet sync* runs three ways:

- **Scheduled.** A scheduled task in the project runs it (for smart-ra:
  "DPI-H review sheet sync", every 2 hours on weekdays; owner, 2026-10-30).
  Each run is a fresh thread with no memory of earlier ones, so everything it
  needs is in the sheet, the records and this section.
- **Manual.** Anyone asks for it ("sync the sheet", "work the ready rows") in
  a project thread, or presses *Run now* on the scheduled task. A thread may
  also fire the scheduled task itself.
- **Active mode.** On demand only, and it lasts **two hours** (owner,
  2026-10-30). The owner asks for it in a project thread ("active mode on").
  That thread then checks the sheet about every ten minutes, waking itself
  with reminders rather than a loop. It compares Review's "Ready for agent"
  and Suggested revision columns with what it saw last, and runs a sheet
  sync, or fires the scheduled task, when a row has newly turned Yes. Two
  hours after it was switched on, it stops and says so in one line. The
  regular schedule keeps running throughout. A sheet edit cannot wake an
  agent by itself, so active mode is frequent checking, not a push.

Each sync does the steps below, in this order.

1. **Reconcile.** For every Agent row with a pull request, read the PR's
   state from GitHub. Open: *PR open*, with its staging review page. Merged:
   *Change merged*, and clear the staging link, because a merged branch's
   preview is gone and its link 404s. Closed unmerged: back to *Not
   started*, and say so in "agentic action taken". Rewrite L–N and J from the
   change-set records as above.
2. **Work the ready rows.** For each Review row with **Ready for agent = Yes**
   whose agentic status is *Not started* or *Needs human*:
   1. Find the comment by No.: the record whose `public.source` names the
      log's sheet and that `entry`. A row with no record is set to *Not in
      comment record*, and the agent goes no further with it.
   2. Read the suggested revision(s) and the comment, and propose the change
      the way every change is proposed: in its change-set (see
      **Change-sets** below), on a branch, with a PR. "Ready for agent" says
      the row is ready to draft. It is not the editor's decision, and the
      comment's status still moves only through this tool. Where the
      revisions conflict, or one asks for something the document cannot say
      without a decision, set *Needs human* and write what is needed in
      "agentic action taken".
   3. Publish the branch's staging preview (`STAGING/<slug>/`).
   4. Write the Agent row, and nothing anywhere else in the sheet: status
      (*Working*, *PR open*, *Ready for review*, *Change merged*), what was
      done, the blocks or sections changed, who acted (the agent and its
      session), the date, the PR, and `STAGING/<slug>/en/review/`. A PR that
      covers a whole change-set is written on every row of that change-set.

3. **Merge the released PRs.** For each open PR named on an Agent row whose
   Review row has **Ready for merge = Yes**, merge it (owner, 2026-10-30). One
   Yes on any row that names the PR is enough: the column is protected, so
   only the owner can set it. Only a PR in the folio's own repository is
   merged, never one on a WHO repository. After the merge, set every row that
   names it to *Change merged*, clear its staging link, and comment on the
   PR's issue. If the merge is refused (a session safety check, a conflict, a
   required review), set the rows to *Merge blocked*, write why in "agentic
   action taken", and say so in the run's summary. Do not route around a
   refusal.

**Which PR counts.** Only a PR that edits the document for the comment. A
change-set record's `pr` can name the PR that *proposed* the change-set, long
merged (smart-ra #9 and #16 proposed and triaged 288 change-sets). That is not
a change PR. Read the PR's diff or body before writing it to a row. The
dashboard draws a staging link only for a PR that is open now, for the same
reason (`openPullRequests` in `scripts/public-comment-site.ts`).

**Page links.** The Review tab's page link opens the frozen review version in
the site's library viewer,
`<site>/assets/vendor/pdfjs/web/viewer.html?src=<raw PDF URL>#page=<n>`. The
log cites printed page numbers. The PDF page is the printed page plus the
front matter, read from the library entry's `pdf-line-map.json` (`pages.<pdf
page>.printed`). In the DPI-H review draft it is printed + 11 for pages 1–243.
The formula takes the first number in the Page cell.

A row whose comment already has an agent PR has **Ready for agent = Yes**, so
the sheet never shows agent work on a row nobody released. When the owner
releases rows that way, it is the owner's call, written on the owner's
instruction (smart-ra #97's eight CS-004 rows, owner, 2026-10-30).

The agent never writes the Review, Source Comments, Change Sets or By Change
Set tabs except on the owner's explicit instruction, as above. It never sets
"Ready for agent" or "Ready for merge" on its own, and it never copies a reviewer's
name or email from Source Comments into the repository. The sheet is reached
through the session's Google Sheets connector. No credential for it is
committed. Google cannot stop the owner's own account editing any tab, so the
one-writer rule is kept by the agent, not enforced by the sheet.

## Placing a comment: how much to trust the anchor

`anchor.method` says how the place was found, and `confidence` says how far to
trust it:

- `caption` (high): "Table 3.1" named a captioned block.
- `page` (medium or low): a page with no usable line. A lines cell such as
  "Requirement 5" or "A14.01" names an item, not a line, so it is not read
  as one. Lands on the page's first block in the cited section.
- `page-line` (high, when the cited section agrees): the page is read as the
  **printed** page first, then as the PDF page index. Printed numbering restarts
  in the front matter, so the cited section breaks ties. "Section does NOT
  agree" in `anchor.note` is a triage signal. Check the comment.
- `quote` (medium or low): a quotation found in the text. Low means it occurs
  more than once. The other places are in `candidates`.
- `section` (medium): only the section resolved, by its number or by its
  title or acronym ("PHSP" is the Public Health Surveillance Platform). The
  anchor is the section label.
- `manual`: a person placed it with `reassign`.

## The lifecycle, and who moves it

`received → triaged → assigned → recommended → decided → editing → incorporated`, plus
`duplicate` and `withdrawn`. Every move is a task in `public-comment.bpmn`.
`transition()` refuses any other move. Do not edit a comment's `status` by
hand: the dashboard counts statuses, and a hand-closed comment reads as
adjudicated when no one decided it.

| who (role) | does | how |
|---|---|---|
| intake agent (`intake`) | propose change-sets as records, with no issue ([below](#the-agent-proposes-nobody-is-notified)) | `public-comment-changesets.ts seed`, `propose` |
| review coordinator (`review-coordinator`) | triage, place, mark duplicates, assign | `triage`, `reassign`, `duplicate`, `assign` |
| committee and editor | agree each change-set's requirements, and change it, on its issue | the issue thread, and `cs-*` commands |
| committee member (`reviewer`) | recommend a decision, with a rationale | a GitHub comment `pc: PC-0042` / `recommend: accepted-modified`, or `recommend` |
| editor (`editor`) | decide, with a reason unless accepted | `decide: …` on GitHub (editors only) or `decide` |
| author (`author`), human or agentic | once a comment is dispensed with a changing decision, make the edit on a feature branch | `edit <ref> --branch … [--to <login>]` |
| pipeline (`build-pipeline`) | build the change set's staging preview, mark it incorporated on merge | staging workflow, `incorporate` |

Who can move a comment from GitHub. Both roles are read from the repository
itself by default (owner, 2026-10-05), so nobody maintains a list:

- **Editor: the repository's owner.** Only the editor decides.
- **Committee: the repository's collaborators** (owner, member or
  collaborator). Adding someone as a collaborator on GitHub is the whole
  on-boarding.

GitHub marks every comment with the commenter's relationship to the
repository, and that mark is what is checked. An `editors` or `committee` list
in `config.json` replaces that role's default with exactly those logins.
Anyone may *discuss* a comment there, but the record is not open to everyone.

The five decision codes (owner, 2026-10-04): `accepted`, `accepted-modified`,
`not-accepted`, `noted`, `deferred`. Every code but `accepted` needs a reason,
because the commenter is owed one.

## Change-sets: an issue to agree it, a PR to approve it

One editorial change often answers several comments, and one comment sometimes
needs several changes. So a comment belongs to **zero or more change-sets**, and
a change-set is discussed and made in two GitHub objects with different jobs
(owner, 2026-10-05):

| object | what people do there |
|---|---|
| **the change-set's ISSUE** | discuss and agree the *requirements*: what the document should say, which comments the change answers |
| **the PR that closes it** | preview the change on staging, review it, approve the merge to `main` |

Requirements argued on a PR get lost when it is closed and reopened; a diff
argued on an issue has nothing to point at. Keep each on its own object.

### One record, everything else rendered from it

`review/public-comment/changesets/CS-012.json` is the **only** record of a
change-set: title, requirements, members, status, primary issue, every other
issue that discusses it, its PR, and its history. Nothing else stores any of
that (owner: *"no drift of metadata"*):

- a comment's change-sets are **derived** from the records, never written on
  the comment;
- the change-set section at the top of its issue is **rendered** from the
  record, and a hand-edit to it is put back with a pointer to the commands;
- the dashboard is built from the records. It is published per document at
  `<site>/en/folio-assistant-core/public-comments/<folio>/<slug>/`, the handler
  route every viewer follows (`<base>/<handler>/<kind>/<subject>`, the subject
  being the materialised document's path in the folio) under the page locale,
  with its `comments.json` at the same route without the locale (issue #2527);
  the flat
  `public-comments/` it had until 2026-10-07 is gone, with no redirect (owner:
  *"clean break, no deprecated/redirect links"*). `public-comment-route.ts` is
  the one place that says so: the site, the change-set issues and the
  rendered-impact predictor all ask it.

The folio's `public-comment.yml` workflow is the **only writer**, one run at a
time, never cancelled half-way. People and agents ask; it writes. Two gates
keep it honest: `public-comment-changesets.ts check` fails a PR whose records
contradict each other (no network), and the nightly `reconcile` re-renders every
issue from its record, opens or closes it as its status says, and opens the
issue a change-set decided outside GitHub is owed. It reports and never deletes.

### The agent proposes; nobody is notified

`Task_ProposeChangeSets` (intake agent). An agent may draft **every**
change-set, and drafting one opens nothing: a proposal has no issue, so
2,000 comments do not become 300 notifications nobody asked for.

1. `seed --out seed.json` lists the open or decided comments in no change-set
   yet, bucketed by section. **A bucket is not a change-set.** One section's
   comments usually ask for several different changes, and one change (a term
   used throughout, say) spans sections.
2. Decide the changes. One change-set is **one change a reviewer can approve or
   refuse as a whole**. Good signs: the comments ask for the same edit, or for
   edits that must land together. Bad signs: the title needs "and", or the
   requirements list unrelated edits. Cross-cutting themes (consent, a
   terminology standard, normative keywords) are ONE change-set touching
   several sections, not one per section: when several agents draft in
   parallel by section, run a merge pass over their drafts before recording.
3. Write requirements as what the text must do ("define *actor* once, in 2.1,
   and use it consistently"), not as the new text: the text is the PR's job.
4. `propose --file proposals.json` records them (`[{title, requirements,
   refs, anchor?}]`), or `add` one at a time. Status: *proposed*.

A comment the agent cannot place is left out, not forced in. It shows on the
dashboard's *open, in no change-set* tile.

### The issue appears when somebody engages

`Task_GroupChangeSets`. A change-set gets its **primary issue** the first time
anybody engages with it (owner: *"dont create issue until someone
comments/provides feedback/dispensation information"*):

| what somebody does | what the workflow does |
|---|---|
| presses **Discuss** on the dashboard (the `change-set` issue form, prefilled with the id) | adopts that issue as the primary one and renders the record at its top; their text stays below |
| recommends or decides on one of its comments, in any thread | records it, opens the primary issue, and quotes the tag there with a link back |
| mentions it, or one of its comments, in any issue | links that issue, and opens the primary issue (at most five from one mention; past that it replies with Discuss links instead) |
| opens a PR that links it by keyword (`Closes CS-012`, `fixes`/`resolves CS-012`, or a `cs: CS-012` line) or closes one of its issues | records the PR, opens the primary issue if there is none. A bare mention of `CS-012` in prose links nothing, and a change-set already *incorporated* or *closed* is never re-linked to another PR: reopen its issue first |
| decides through the CLI | nothing at once; the nightly reconcile opens the issue |

**People are disorganised, and that is fine.** Any number of other issues may
discuss a change-set: each is linked (the record's `issues`), listed under
*Also discussed in* on the primary issue, and told where the primary one is.
Nobody's own issue is rewritten, and a tag recorded in a linked issue counts
exactly as one in the primary.

### Changing a change-set on its issue

In a comment, from the committee or the editor. Anyone else's command is
answered with why it changed nothing.

| command | effect |
|---|---|
| `cs-add: PC-0311, PC-0312` | add comments |
| `cs-remove: PC-0107` | remove a comment |
| `cs-title: …` | rename |
| `cs-requirements:` then the text on the following lines | replace the requirements |
| `cs-committee: <TWG> — <reason>` | re-route the change-set to another TWG review committee, with a reason (`Task_RerouteChangeSet`, person-only; also `reroute <CS-012> --to <TWG> --why "reason" --by <login>`) |
| `cs-merge: CS-087` | fold CS-087 in; its issue is linked, and closed with a pointer (or adopted, if this one had none) |
| `cs-split: PC-0311, PC-0312 as New title` | move those comments into a new change-set, which gets its own issue |
| `cs-close: reason` | no change is needed |
| `cs-new: Title` with a `pc:` line | a new change-set (the dashboard's *New change-set from the selected comments* opens the form for it) |

A change-set's committee is rolled up from its comments' TWG routing unless a
person in the committee or editor lane re-routes it by hand (`cs-committee:
<TWG> — <reason>` or `public-comment-changesets.ts reroute`). Each move is
recorded on the change-set (`who`, `when`, `from`, `to`, `why`) so re-ingesting
comments never resets it, and the dashboard shows the new committee and the move
history. Agents cannot re-route a change-set on their own (`Task_RerouteChangeSet`
is a `userTask` in `public-comment.bpmn`).

`cs: CS-012` names the change-set where a thread discusses several. In a
change-set's issue a bare `decide: accepted` (or `recommend: …`) applies to all
its comments; `pc: PC-0042` first narrows it.

Closing a primary issue by hand while its comments still need a change reopens
it, with the list. Closing it when every comment is decided without a change
closes the change-set. Reopening a primary issue puts its change-set back to
`discussing`, whether it was `closed` or `incorporated`: a person reopening it
is saying it is not done. `reopen <CS-012> --note "why"` makes the same move
when the reopen event has already been handled.

### The issue forms

`public-comment-changesets.ts install` writes three forms and the two
workflows into the folio's `.github/`, from this layer's `templates/public-comment/`.
A form renders as `### Label` and the value, and the tool reads it as the same
lines a person would type, so there is one parser for both:

| form | for | reads as |
|---|---|---|
| **Discuss a change-set** (`change-set.yml`) | the dashboard's Discuss link | `cs: CS-012` and the discussion |
| **New change-set** (`change-set-new.yml`) | the dashboard's picks | `cs-new: Title`, `pc: …`, `cs-requirements:` |
| **Recommend or decide** (`comment-decision.yml`) | a person who would rather not type a tag | `pc:` / `cs:`, `recommend:` or `decide:`, the reason |

Blank issues stay enabled: a person who ignores the forms is still linked by
what they mention.

### The PR

1. Branch from `main`, named for the change. Open the PR at the first commit
   ([`continual-progress`](../../../../cat-harness/skills/sdlc/sdlc-core/continual-progress.md)),
   with `Closes #<the primary issue>` (or any of its issues, or
   `Closes CS-012`, or a `cs: CS-012` line) in its body. Only those keywords
   link: a PR that mentions the id in passing, a pin bump say, does not.
2. Opening it moves the change-set to *editing* and its **accepted** comments
   to *editing*, with the branch and PR. Comments not yet decided, or decided
   `not-accepted`/`noted`/`deferred`, do not move.
3. Edit the folio's blocks. An agent in the `author` role edits only what the
   decisions and the issue's requirements say.
4. The staging preview is published to `STAGING/<branch>/`. The dashboard links
   each comment's anchor on `main` (before) and on the preview (after). See
   [`staging-review`](../../../../cat-harness/skills/sdlc/sdlc-core/staging-review.md).
5. Merging moves the accepted comments to *incorporated*. The change-set is
   *incorporated*, and its primary issue closed, only when **every** comment in
   it is settled (decided, incorporated, duplicate or withdrawn). If any is
   still undecided, the change-set stays open and so does its issue, and the
   workflow log says how many are left. Before 2026-10-06 a merge closed the
   whole set regardless, which closed CS-236 and CS-237 in smart-ra with 13 of
   their 15 comments undecided (bean `uphx`, D-1). A PR closed without merging
   puts the change-set back to *discussing*.

## The dashboard's filters

Status, Type, Section, Search and the count tiles filter **both** tables: the
comments, and the change-sets above them. A change-set shows when any of its
comments match, and its count then reads "10 of 18". Before 2026-10-06 they
moved only the comment table, about 17,000 px below an open change-set table,
so the chief editor saw filters that "did not change anything".

- **Show its comments** clears every other filter and shows all of that
  change-set's comments. Any later Status, Type, Section or tile choice
  replaces it; the search box narrows within it. (It used to persist hidden,
  which made the Type filter look broken: D-2.)
- **Every filter change is a history entry**, with the filters in the query
  string (`?status=open&section=1.1.3`). Back restores the previous view, and
  the URL of a filtered view can be pasted into an issue or a chat.
- **Closed** in the Status box means incorporated, duplicate or withdrawn; the
  page says so above the tiles.

This is the same review loop as any content change
(`content-change-review.bpmn`), with a different intake. Reuse it rather than
building a parallel review.

## Change-sets beyond public comment

Since 2026-10-06 (owner, issue #971) the change-set is the Change Set for ANY
change to a folio: one that answers no comment has empty `refs`. It applies to
the materialised `folio/`, never to the `library/` source it was materialised
from. Its PR carries `rendered`, one list per renderer of the rendered files
the change alters, and review approves against those lists (skill
`rendered-impact`).

## What not to do

- Do not answer a comment by editing the review version in `library/`. It is
  frozen, and every anchor depends on it.
- Do not re-anchor by renaming a block. Labels are the anchors. A block that
  is split or merged records its old label in `renamedFrom`.
- Do not put a decision in a commit message only. The comment record is the
  record. A commit is evidence.
