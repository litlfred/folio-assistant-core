<!-- GENERATED from folio-assistant-core/processes/library/l1-document-ingestion.bpmn by cat-harness-tools/scripts/bpmn-checklist.ts. Do not edit: change the diagram and regenerate (bun run cat bpmn:checklist). -->

# Checklist — L1 document ingestion — a document to the L1 source knowledge graph

> **Generated, and not the authority.** This is `folio-assistant-core/processes/library/l1-document-ingestion.bpmn` (process `Process_L1DocumentIngestion`) walked as a state machine. The diagram and the workflow engine decide; this list only reads them. Follow the `next:` line of each step rather than the order on the page, and record each step with the call it names, so the engine's committed state — not this list — says which edge was taken.

folio-assistant — L1 document ingestion — a document to the L1 source knowledge graph.

## Begin — A document is offered for L1 ingestion (`StartEvent_Document`)

- Begin here: A document whose text and structure are wanted as L1 source content.
- Call `workflow_start` with `process: "Process_L1DocumentIngestion"` and the subject this run is about; keep the instance id it returns.
- next: → `CallActivity_Basic` (Basic ingestion (harness))

### 1. Basic ingestion (harness) (`CallActivity_Basic`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `library-ingestion`.
- What: The harness's `document-ingestion.bpmn`: accept the upload by a declared route, extract its metadata into the KG, and catalogue the asset in library/ — placed if materialized, recorded as referenced if not.
- A subprocess (`Process_Ingestion`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `Task_Detect` (Detect media type and mint a doc id)

### 2. Detect media type and mint a doc id (`Task_Detect`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: Sniff the media type rather than trusting the extension, and mint the doc id from the page-1 arXiv stamp where there is one, else from the filename.
- Record it: `workflow_complete` with `node: "Task_Detect"`.
- next: → `Task_Licence` (Establish the licence from the upload alone)

### 3. Establish the licence from the upload alone (`Task_Licence`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: EARLY, by the owner's ruling on bean 7bg9 (2026-09-20): before any derivation, because library/ is holds: content and anything derived first is committed, so refusing it later is a deletion nobody may take unasked.
- Record it: `workflow_complete` with `node: "Task_Licence"`.
- next: → `CallActivity_Extract` (Extract structure)

### 4. Extract structure (`CallActivity_Extract`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: See ingest-extract-structure.bpmn.
- A subprocess (`Process_ExtractStructure`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `CallActivity_Derive` (Derive content from the assets)

### 5. Derive content from the assets (`CallActivity_Derive`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: See ingest-derive-content.bpmn.
- A subprocess (`Process_DeriveContent`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `Gateway_ThemeSource` (A theme source? (author's judgement))

### Decide — A theme source? (author's judgement) (`Gateway_ThemeSource`)

- Wired 2026-09-23 on the owner's ruling for bean `j66n`, choosing "human/agentic judgement at the gateway" over a declared predicate.
- Call `workflow_complete` with `node: "Gateway_ThemeSource"` and `outcome` set to the label that holds:
  - «yes» → `CallActivity_IngestTheme` (Ingest the theme)
  - «no» → `CallActivity_BuildKg` (Build the L1 knowledge graph)

### 6. Ingest the theme (`CallActivity_IngestTheme`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `theme-art-intake`.
- What: See ingest-theme.bpmn.
- A subprocess (`Process_IngestTheme`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `CallActivity_BuildKg` (Build the L1 knowledge graph)

### 7. Build the L1 knowledge graph (`CallActivity_BuildKg`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: See ingest-build-l1-kg.bpmn.
- A subprocess (`Process_BuildL1Kg`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `CallActivity_Gate` (L1 completeness gate)

### 8. L1 completeness gate (`CallActivity_Gate`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `l1-document-ingestion`.
- What: See ingest-l1-completeness-gate.bpmn.
- A subprocess (`Process_L1Gate`): `workflow_next` reports its own steps; complete those — this call activity itself is not completable.
- next: → `Gateway_Complete` (L1 complete?)

### Decide — L1 complete? (`Gateway_Complete`)

- The verdict of the L1 completeness gate.
- Call `workflow_complete` with `node: "Gateway_Complete"` and `outcome` set to the label that holds:
  - «gap» → `Task_OpenBean` (Record the gap as a bean)
  - «complete» → `Task_Promote` (Move into library/<bib-slug>/)

### 9. Record the gap as a bean (`Task_OpenBean`)

- Who: the `Work plan — beans (shared by humans and agents)` lane (role `work-plan`).
- Skill: `todo-manager`.
- What: A missing derived artefact is a tracked gap, not a silent omission.
- Record it: `workflow_complete` with `node: "Task_OpenBean"`.
- next: → `CallActivity_Derive` (Derive content from the assets)

### 10. Move into library/<bib-slug>/ (`Task_Promote`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `document-intake`.
- What: The folder name IS the bibliography citation key, so a citation and a directory are the same string.
- Record it: `workflow_complete` with `node: "Task_Promote"`.
- next: → `Task_SummaryQueue` (Prose blocks enter the summary queue)

### 11. Prose blocks enter the summary queue (`Task_SummaryQueue`)

- Who: the `Ingestion Engine (agent, runs unattended)` lane (role `ingestion-agent`).
- Skill: `l1-document-ingestion`.
- What: Owner, 2026-09-24: "Make as QA sidecar as part of general doc ingestion to slowly drain." Nothing is written to ENQUEUE a block: the queue is derived (every prose block in every declared library, minus those whose summaries.json record is a current draft or confirmation), so a promoted entry is in i
- Record it: `workflow_complete` with `node: "Task_SummaryQueue"`.
- next: → `Task_Citeable` (Available to cite as an L1 source)

### 12. Available to cite as an L1 source (`Task_Citeable`)

- Who: the `Corpus — L1 source knowledge graph` lane (role `corpus`).
- Skill: `document-intake`.
- What: Every knowledge-graph reference to this source now resolves through library/.
- Record it: `workflow_complete` with `node: "Task_Citeable"`.
- next: → `EndEvent_Ingested` (Ingested)

## Done — Ingested (`EndEvent_Ingested`)

- The instance completes here. `workflow_next` then reports nothing enabled — that, not this line, is the record of completion.
