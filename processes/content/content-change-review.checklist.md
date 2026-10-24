<!-- GENERATED from folio-assistant-core/processes/content/content-change-review.bpmn by cat-harness-tools/scripts/bpmn-checklist.ts. Do not edit: change the diagram and regenerate (bun run cat bpmn:checklist). -->

# Checklist — Content Change and Review

> **Generated, and not the authority.** This is `folio-assistant-core/processes/content/content-change-review.bpmn` (process `Process_ContentChangeReview`) walked as a state machine. The diagram and the workflow engine decide; this list only reads them. Follow the `next:` line of each step rather than the order on the page, and record each step with the call it names, so the engine's committed state — not this list — says which edge was taken.

Getting a change to a folio's CONTENT from a request into a published rendering: the author says what they want, an agent works out its scope and makes it, a review committee accepts or refuses it, and the pipeline deploys.

## Begin — Author requests content change (`Start_Author`)

- Begin here.
- Call `workflow_start` with `process: "Process_ContentChangeReview"` and the subject this run is about; keep the instance id it returns.
- next: → `Task_DescribeChange` (Describe the desired change)

## Begin — Receive change request (`Start_Agent`)

- Begin here.
- Call `workflow_start` with `process: "Process_ContentChangeReview"` and the subject this run is about; keep the instance id it returns.
- next: → `Task_DetectScope` (Detect change scope & impact)

## Begin — PR submitted for review (`Start_Reviewer`)

- Begin here.
- Call `workflow_start` with `process: "Process_ContentChangeReview"` and the subject this run is about; keep the instance id it returns.
- next: → `Task_CompareBeforeAfter` (Compare main vs staging)

## Begin — Push to feature branch (`Start_Pipeline`)

- Begin here.
- Call `workflow_start` with `process: "Process_ContentChangeReview"` and the subject this run is about; keep the instance id it returns.
- next: → `Task_BuildStaging` (Build staging site)

### 1. Describe the desired change (`Task_DescribeChange`)

- Who: the `Content Author` lane (role `author`).
- What: Author describes the content change in natural language.
- Record it: `workflow_complete` with `node: "Task_DescribeChange"`.
- next: → `Start_Agent` (Receive change request)

### 2. Detect change scope & impact (`Task_DetectScope`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- What: Agent analyses the requested change: - Which content blocks are affected?
- Record it: `workflow_complete` with `node: "Task_DetectScope"`.
- next: → `Task_CreateBranch` (Create feature branch)

### 3. Compare main vs staging (`Task_CompareBeforeAfter`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `staging-review`, `visual-diff`, `rendered-impact`.
- What: The review starts from the Change Set's RENDERED list (skill rendered-impact): every rendered file the change alters, predicted from each renderer's dependency cone and checked against the build.
- Record it: `workflow_complete` with `node: "Task_CompareBeforeAfter"`.
- next: → `Task_IngestComments` (Ingest tagged review comments)

### 4. Build staging site (`Task_BuildStaging`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `feature-staging`.
- What: feature-staging.yml triggers: 1.
- Record it: `workflow_complete` with `node: "Task_BuildStaging"`.
- next: → `Task_DeployStaging` (Deploy to STAGING/<slug>/)

### 5. Create feature branch (`Task_CreateBranch`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `feature-staging`.
- What: Agent creates a feature branch from main.
- Record it: `workflow_complete` with `node: "Task_CreateBranch"`.
- next: → `Task_EditContent` (Edit narrative content blocks)

### 6. Ingest tagged review comments (`Task_IngestComments`)

- Who: the `Review Coordinator` lane (role `review-coordinator`).
- Skill: `review-comments`.
- What: Every PR conversation comment that starts with `block: <label>` becomes a `review-comment/1.0.0` todo (open), idempotently, and is published with the preview as `review-comments.json`.
- Record it: `workflow_complete` with `node: "Task_IngestComments"`.
- next: → `Task_SliceAndAssign` (Slice the change and assign reviewers)

### 7. Deploy to STAGING/<slug>/ (`Task_DeployStaging`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `feature-staging`.
- What: peaceiris/actions-gh-pages deploys to gh-pages branch under STAGING/<branch-slug>/ with keep_files: true so other staging deployments and the main site are preserved.
- Record it: `workflow_complete` with `node: "Task_DeployStaging"`.
- next: → `Task_CommentPR` (Comment staging URL on PR)

### 8. Edit narrative content blocks (`Task_EditContent`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `content-author`.
- What: Agent modifies the relevant content blocks (.md files, block manifests).
- Record it: `workflow_complete` with `node: "Task_EditContent"`.
- next: → `Task_EditLogic` (Edit deterministic logic (if needed))

### 9. Slice the change and assign reviewers (`Task_SliceAndAssign`)

- Who: the `Review Coordinator` lane (role `review-coordinator`).
- Skill: `review-heatmap`, `staging-review`, `rendered-impact`.
- What: From the ChangeSet, its rendered list (skill rendered-impact: each changed rendered page is assigned like a changed block) and the heat map on the review page: cut the change into slices a reviewer can hold (usually a section, or a run of sections where the heat map clusters), and assign each slice 
- Record it: `workflow_complete` with `node: "Task_SliceAndAssign"`.
- next: → `Call_ReviewSlices` (Review each slice)

### 10. Comment staging URL on PR (`Task_CommentPR`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `feature-staging`, `rendered-impact`.
- What: Bot comments or updates the staging URL on the PR.
- Record it: `workflow_complete` with `node: "Task_CommentPR"`.
- next: → `Call_BeanOpen` (Open the bean)

### 11. Edit deterministic logic (if needed) (`Task_EditLogic`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `content-author`.
- What: If the content change affects decision logic, indicators, or workflows: - Update CQL expressions - Update DMN decision tables - Adjust indicator definitions skill: dak-authoring, fhir-pipeline
- Record it: `workflow_complete` with `node: "Task_EditLogic"`.
- next: → `Task_AssessImpact` (Assess downstream impact)

### 12. Review each slice (`Call_ReviewSlices`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `content-review`, `review-comments`.
- What: review-task.bpmn, once per slice, in parallel lanes by role.
- A subprocess (`Process_Review`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `GW_Withdraw` (A comment withdrawn?)

### 13. Open the bean (`Call_BeanOpen`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `bean-coordination`.
- What: Process_BeanOpen: check before you create, find out whose the bean is, and claim it — or leave it alone when it is someone else's.
- A subprocess (`Process_BeanOpen`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `GW_BeanYours` (Bean claimed?)

### 14. Assess downstream impact (`Task_AssessImpact`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `content-graph`.
- What: Agent reviews downstream implications: - Will indicators need adjustment?
- Record it: `workflow_complete` with `node: "Task_AssessImpact"`.
- next: → `Call_OptionsAnalysis` (Options analysis how to absorb the impact)

### Decide — A comment withdrawn? (`GW_Withdraw`)

- Asked after the slices are reviewed: did a reviewer withdraw a comment?
- Call `workflow_complete` with `node: "GW_Withdraw"` and `outcome` set to the label that holds:
  - «Yes» → `Task_WithdrawComment` (Withdraw a review comment)
  - «No» → `GW_Disputed` (A finding disputed?)

### Decide — Bean claimed? (`GW_BeanYours`)

- Reads which end Process_BeanOpen reached.
- Call `workflow_complete` with `node: "GW_BeanYours"` and `outcome` set to the label that holds:
  - «claimed» → `Task_WatchBranchCI` (Open the branch-watch bean)
  - «not yours» → `End_BeanNotYours` (Not yours — left alone)

### 15. Options analysis how to absorb the impact (`Call_OptionsAnalysis`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- What: On the edge OUT of `Task_AssessImpact` and before `Task_CommitPush`, because the impact assessment is the evidence the options are weighed against.
- A subprocess (`Process_OptionsAnalysis`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `Task_CommitPush` (Commit, push, update PR)

### 16. Withdraw a review comment (`Task_WithdrawComment`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `review-comments`.
- What: The reviewer who made a comment takes it back (it was a misreading, or a later slice answered it).
- Record it: `workflow_complete` with `node: "Task_WithdrawComment"`.
- next: → `GW_Disputed` (A finding disputed?)

### Decide — A finding disputed? (`GW_Disputed`)

- Is any finding disputed between author and reviewer?
- Call `workflow_complete` with `node: "GW_Disputed"` and `outcome` set to the label that holds:
  - «Yes» → `Call_Adjudication` (Adjudicate the disagreement)
  - «No» → `GW_Covered` (Every changed block and page reviewed?)

### 17. Open the branch-watch bean (`Task_WatchBranchCI`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `watch`, `todo-manager`.
- What: First dispatch point for a CI watcher: the feature branch has changed and a staging build now exists to watch.
- Record it: `workflow_complete` with `node: "Task_WatchBranchCI"`.
- next: → `Task_ReviewStaging` (Review staged rendering)

## Done — Not yours — left alone (`End_BeanNotYours`)

- The instance completes here: Someone else holds the bean; this run stops without touching it. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 18. Commit, push, update PR (`Task_CommitPush`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `prepare-merge-auto`, `before-after-preview`.
- What: Agent commits all changes to the feature branch and pushes.
- Record it: `workflow_complete` with `node: "Task_CommitPush"`.
- next: → `Start_Pipeline` (Push to feature branch)

### 19. Adjudicate the disagreement (`Call_Adjudication`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `adjudication`.
- What: adjudication.bpmn.
- A subprocess (`Process_Adjudication`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `GW_Covered` (Every changed block and page reviewed?)

### Decide — Every changed block and page reviewed? (`GW_Covered`)

- Computed, not chosen: `decisions/review-coverage-gate.dmn` reads `uncoveredBlocks` (changed blocks with neither a verdict nor a reasoned waiver) and `openDefects`, and, where the build published a rendered impact, `unreviewedPages`, `undeterminedInputs` and `missedPages` with their `rendered` and `m
- Computed by the DMN table `decisions/review-coverage-gate.dmn#Decision_ReviewCoverageGate`: call `workflow_complete` with `node: "GW_Covered"` and the `facts` it reads — the table returns the branch; pass no `outcome`.
  - «no» → `Task_SliceAndAssign` (Slice the change and assign reviewers)
  - «yes» → `Task_ReviewUses` (Review the editorial dependencies)

### 20. Review staged rendering (`Task_ReviewStaging`)

- Who: the `Content Author` lane (role `author`).
- Skill: `staging-review`.
- What: Author reviews the rendered feature branch at <pages-url>/STAGING/<branch-slug>/ and compares against the main site.
- Record it: `workflow_complete` with `node: "Task_ReviewStaging"`.
- next: → `GW_AuthorSatisfied` (Satisfied with changes?)

### 21. Review the editorial dependencies (`Task_ReviewUses`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `uses-editorial-review`.
- What: `uses[]` is what a READER must have read to follow the block — never populated from the formal dependency graph.
- Record it: `workflow_complete` with `node: "Task_ReviewUses"`.
- next: → `Task_ReviewImpact` (Review impact assessment)

### Decide — Satisfied with changes? (`GW_AuthorSatisfied`)

- The author's own call after looking at the staged rendering.
- Call `workflow_complete` with `node: "GW_AuthorSatisfied"` and `outcome` set to the label that holds:
  - «No» → `Task_RequestRevision` (Request further revisions)
  - «Yes» → `Task_SubmitForReview` (Submit to review committee)

### 22. Review impact assessment (`Task_ReviewImpact`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `content-review`.
- What: Committee reviews the agent's impact assessment: - Were all downstream effects identified?
- Record it: `workflow_complete` with `node: "Task_ReviewImpact"`.
- next: → `GW_Approved` (Changes approved?)

### 23. Request further revisions (`Task_RequestRevision`)

- Who: the `Content Author` lane (role `author`).
- Skill: `staging-review`.
- What: Author provides feedback on what needs adjustment.
- Record it: `workflow_complete` with `node: "Task_RequestRevision"`.
- next: → `Task_Iterate` (Iterate on author feedback)

### 24. Submit to review committee (`Task_SubmitForReview`)

- Who: the `Content Author` lane (role `author`).
- Skill: `staging-review`.
- What: Author submits the PR for formal review by the guidance review committee.
- Record it: `workflow_complete` with `node: "Task_SubmitForReview"`.
- next: → `Call_BeanClose_2` (Close the bean), → `Start_Reviewer` (PR submitted for review)

### Decide — Changes approved? (`GW_Approved`)

- The committee's decision on the impact assessment.
- Call `workflow_complete` with `node: "GW_Approved"` and `outcome` set to the label that holds:
  - «No» → `Task_RequestChanges` (Request changes)
  - «Yes» → `Task_Approve` (Approve)

### 25. Iterate on author feedback (`Task_Iterate`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `content-author`, `before-after-preview`.
- What: Agent receives revision requests from the author and applies changes.
- Record it: `workflow_complete` with `node: "Task_Iterate"`.
- next: → `Call_BeanClose` (Close the bean), → `Start_Pipeline` (Push to feature branch)

### 26. Close the bean (`Call_BeanClose_2`)

- Who: the `Content Author` lane (role `author`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `End_Author` (Change submitted)

### 27. Request changes (`Task_RequestChanges`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `content-review`, `content-review`.
- What: Committee provides feedback.
- Record it: `workflow_complete` with `node: "Task_RequestChanges"`.
- next: → `Task_Iterate` (Iterate on author feedback)

### 28. Approve (`Task_Approve`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `decision-audit`.
- What: The committee approves the change: the judgement, recorded with the evidence it rests on.
- Record it: `workflow_complete` with `node: "Task_Approve"`.
- next: → `Task_Merge` (Merge, on explicit confirmation)

### 29. Close the bean (`Call_BeanClose`)

- Who: the `Folio-Assistant Agent` lane (role `authoring-agent`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `End_Agent` (Feature branch ready)

## Done — Change submitted (`End_Author`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 30. Merge, on explicit confirmation (`Task_Merge`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `prepare-merge`.
- What: The owner says "merge it", and only then is the branch merged.
- Record it: `workflow_complete` with `node: "Task_Merge"`.
- next: → `Call_BeanClose_5` (Close the bean), → `GW_Merged` (PR merged?)

## Done — Feature branch ready (`End_Agent`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 31. Close the bean (`Call_BeanClose_5`)

- Who: the `Review Committee` lane (role `reviewer`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `End_Reviewer` (Change accepted)

### Decide — PR merged? (`GW_Merged`)

- Was the PR merged?
- Call `workflow_complete` with `node: "GW_Merged"` and `outcome` set to the label that holds:
  - «Yes» → `Task_CleanupStaging` (Remove STAGING/<slug>/)
  - «No» → `Call_BeanClose_3` (Close the bean)

## Done — Change accepted (`End_Reviewer`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 32. Remove STAGING/<slug>/ (`Task_CleanupStaging`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `feature-staging`.
- What: When the PR is merged or closed, the cleanup job removes the STAGING/<slug>/ directory from gh-pages so stale previews don't accumulate.
- Record it: `workflow_complete` with `node: "Task_CleanupStaging"`.
- next: → `Task_RebuildMain` (Rebuild main site)

### 33. Close the bean (`Call_BeanClose_3`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `End_NotMerged` (Not merged: preview kept)

### 34. Rebuild main site (`Task_RebuildMain`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `content-publish`.
- What: docs-site.yml triggers on the merge commit to main, rebuilding the root of gh-pages with the accepted changes.
- Record it: `workflow_complete` with `node: "Task_RebuildMain"`.
- next: → `Task_WatchMainCI` (Note the main-branch watch)

## Done — Not merged: preview kept (`End_NotMerged`)

- The instance completes here: The approval did not end in a merge. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.

### 35. Note the main-branch watch (`Task_WatchMainCI`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `watch`, `todo-manager`.
- What: Second dispatch point: the change was approved and merged, and the root of the site has been rebuilt from main.
- Record it: `workflow_complete` with `node: "Task_WatchMainCI"`.
- next: → `Call_BeanClose_4` (Close the bean)

### 36. Close the bean (`Call_BeanClose_4`)

- Who: the `CI/CD Pipeline` lane (role `build-pipeline`).
- Skill: `todo-manager`.
- What: Process_BeanClose: end the bean in a state that says why — complete and archive it, scrap it with its reasons and archive it, or record the blocker and hand it back.
- A subprocess (`Process_BeanClose`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `End_Pipeline` (Deployment complete)

## Done — Deployment complete (`End_Pipeline`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.
