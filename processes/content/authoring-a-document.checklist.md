<!-- GENERATED from folio-assistant-core/processes/content/authoring-a-document.bpmn by cat-harness-tools/scripts/bpmn-checklist.ts. Do not edit: change the diagram and regenerate (bun run cat bpmn:checklist). -->

# Checklist — Authoring a document

> **Generated, and not the authority.** This is `folio-assistant-core/processes/content/authoring-a-document.bpmn` (process `Process_DocumentAuthoring`) walked as a state machine. The diagram and the workflow engine decide; this list only reads them. Follow the `next:` line of each step rather than the order on the page, and record each step with the call it names, so the engine's committed state — not this list — says which edge was taken.

How a document folio — structured prose and policy guidance, with no Lean and no required TeX — is authored, built and reviewed end to end.

## Begin — New document (`StartEvent_NewDocument`)

- Begin here.
- Call `workflow_start` with `process: "Process_DocumentAuthoring"` and the subject this run is about; keep the instance id it returns.
- next: → `Task_Plan` (1 · Plan the document)

### 1. 1 · Plan the document (`Task_Plan`)

- Who: the `Author (person)` lane (role `author`).
- Skill: `content-plan`.
- What: Scope it: chapters, the blocks each needs, which statements are normative.
- Record it: `workflow_complete` with `node: "Task_Plan"`.
- next: → `Call_BeanOpen` (Open the bean)

### 2. Open the bean (`Call_BeanOpen`)

- Who: the `Work plan — beans (shared by humans and agents)` lane (role `work-plan`).
- Skill: `bean-coordination`.
- What: Process_BeanOpen: check before you create, find out whose the bean is, and claim it — or leave it alone when it is someone else's.
- A subprocess (`Process_BeanOpen`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `GW_BeanYours` (Bean claimed?)

### Decide — Bean claimed? (`GW_BeanYours`)

- Reads which end Process_BeanOpen reached.
- Call `workflow_complete` with `node: "GW_BeanYours"` and `outcome` set to the label that holds:
  - «claimed» → `Task_SeedPlan` (2 · Seed the work plan)
  - «not yours» → `End_BeanNotYours` (Not yours — left alone)

### 3. 2 · Seed the work plan (`Task_SeedPlan`)

- Who: the `Work plan — beans (shared by humans and agents)` lane (role `work-plan`).
- Skill: `todo-manager`.
- What: The plan becomes beans, so a resumed session or a sibling agent can pick it up.
- Shared step `GT_SeedWorkPlan`.
- Record it: `workflow_complete` with `node: "Task_SeedPlan"`.
- next: → `Task_Scaffold` (3 · Scaffold the folio)

## Done — Not yours — left alone (`End_BeanNotYours`)

- The instance completes here: Someone else holds the bean; this run stops without touching it. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 4. 3 · Scaffold the folio (`Task_Scaffold`)

- Who: the `Authoring agent (system)` lane (role `authoring-agent`).
- Skill: `document-structure`.
- What: folio_init writes content/, uploads/, library/, the manifests, the builder shim and AGENTS.md.
- Record it: `workflow_complete` with `node: "Task_Scaffold"`.
- next: → `Task_AuthorBlocks` (4 · Author blocks)

### 5. 4 · Author blocks (`Task_AuthorBlocks`)

- Who: the `Authoring agent (system)` lane (role `authoring-agent`).
- Skill: `document-authoring`, `normative-statements`.
- What: Every block edit runs the HCI validation gate — see editing-hci-validation.bpmn.
- Record it: `workflow_complete` with `node: "Task_AuthorBlocks"`.
- next: → `Task_ProfileCheck` (5 · Check the profile)

### 6. 5 · Check the profile (`Task_ProfileCheck`)

- Who: the `Build pipeline — validate · render · publish` lane (role `build-pipeline`).
- Skill: `content-validate`.
- What: content_profile_check: no math kind, no lean field, no .lean sibling.
- Record it: `workflow_complete` with `node: "Task_ProfileCheck"`.
- next: → `Gateway_ProfileClean` (Within the declared profile?)

### Decide — Within the declared profile? (`Gateway_ProfileClean`)

- Answered by the profile check (step 5): does every block stay within the folio's declared content profile?
- Call `workflow_complete` with `node: "Gateway_ProfileClean"` and `outcome` set to the label that holds:
  - «violations» → `Task_AuthorBlocks` (4 · Author blocks)
  - «clean» → `Task_Validate` (6 · Validate)

### 7. 6 · Validate (`Task_Validate`)

- Who: the `Build pipeline — validate · render · publish` lane (role `build-pipeline`).
- Skill: `content-validate`.
- What: Schema and constraint checks over every block.
- Record it: `workflow_complete` with `node: "Task_Validate"`.
- next: → `Task_Render` (7 · Render MD / HTML / PDF)

### 8. 7 · Render MD / HTML / PDF (`Task_Render`)

- Who: the `Build pipeline — validate · render · publish` lane (role `build-pipeline`).
- Skill: `document-publishing`.
- What: Assemble to Markdown, then pandoc.
- Record it: `workflow_complete` with `node: "Task_Render"`.
- next: → `Task_Review` (8 · Review and feedback)

### 9. 8 · Review and feedback (`Task_Review`)

- Who: the `Reviewer / subject-matter expert` lane (role `reviewer`).
- Skill: `content-review`, `staging-review`.
- What: The reviewer this folio binds.
- Record it: `workflow_complete` with `node: "Task_Review"`.
- next: → `Gateway_ReviewOutcome` (Ready to publish?)

### Decide — Ready to publish? (`Gateway_ReviewOutcome`)

- The reviewer's call after step 8.
- Call `workflow_complete` with `node: "Gateway_ReviewOutcome"` and `outcome` set to the label that holds:
  - «iterate» → `Task_AuthorBlocks` (4 · Author blocks)
  - «approved» → `Task_Publish` (9 · Publish)
  - «Authoring Committee feedback» → `Call_ContributorFeedback` (Contributor feedback)

### 10. 9 · Publish (`Task_Publish`)

- Who: the `Build pipeline — validate · render · publish` lane (role `build-pipeline`).
- Skill: `content-publish`.
- What: See draft-to-publication.bpmn for the review and release path this expands into.
- Record it: `workflow_complete` with `node: "Task_Publish"`.
- next: → `Call_BeanClose` (Close the bean)

### 11. Contributor feedback (`Call_ContributorFeedback`)

- Who: the `Authoring Committee` lane (role `authoring-committee`).
- Skill: `review-sheet-script`.
- What: Process_ContributorFeedback: while the document is a working draft, the Authoring Committee gives feedback through the Contributor Feedback sheet, and each change set is edited and merged in its own pull request.
- A subprocess (`Process_ContributorFeedback`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `Task_Validate` (6 · Validate)

### 12. Close the bean (`Call_BeanClose`)

- Who: the `Build pipeline — validate · render · publish` lane (role `build-pipeline`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `EndEvent_Published` (Document published)

## Done — Document published (`EndEvent_Published`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.
