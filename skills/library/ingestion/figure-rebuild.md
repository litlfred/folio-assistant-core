---
name: figure-rebuild
description: >
  Turn a source publication's figures into computable diagrams when a folio
  is built from its L1 entry. Every declared figure gets a block, and each one
  is rebuilt in the form its type calls for: an ArchiMate view, BPMN, DMN, a
  class diagram, Mermaid, or an SVG generated from data. The PDF crop stays
  beside the rebuild as the cited source. The figure-coverage check counts
  what is missing and what is still only a picture.
graph-typologies:
  - library
---

# Figure rebuild: a figure is data, not a picture

Owner, 2026-10-31, after reading the ingested product catalogue and supply
chain handbooks (litlfred/dth-pc, litlfred/dth-sc): *"the ingested dth-pc and
dth-sc did not have any of the figures that i could see.... where they
extracted into KG? can we recreate them computably?"* The owner then chose to
**pick the form by figure type** (option A).

Two separate failures sat behind that question:

1. **Figures went missing silently.** The vector arm matched only `Fig.` and
   `Figure`, and the supply chain handbook writes `Fig 1.`, so nine of its 32
   figures had no render and no block (cat-harness-tools#1119). Nothing
   compared the publication's declared figures with the folio's blocks.
2. **The figures that did arrive were pictures.** A `figure` block whose
   `file` is `vfig-pNNN.png` has a caption, a page and glossary links in the
   KG. Its boxes, arrows and labels are pixels: no query can reach them.

## The steps, after the folio is seeded

1. **Every declared figure has a block.** Run
   `bun run cat figure:coverage --entry <library>/<doc-id> --folio folio/<doc>`.
   A `missing` figure is a bug in extraction or seeding. Fix that (re-run the
   vector arms, inspect, place the block) rather than excluding it. The one
   legitimate block exclusion is content the folio may not copy, such as a
   third-party figure used by permission. It is signed off by a person
   (`scope: "block"`), and the folio says in prose what the figure was.
2. **Classify each figure by what it draws**, by looking at the render, never
   by its labels alone (see `l1-document-ingestion`, "the text layer is not
   the figure"):

   | The figure draws | Rebuild as | Where it lives |
   |---|---|---|
   | actors, systems, components, layers of an architecture | an **ArchiMate view** | the reference architecture the folio mounts (e.g. smart-ra `tools/archimate-dth/`), linked from the block's `meta.figureViews` |
   | a workflow with tasks, gateways, lanes | **BPMN 2.0** | the folio's `processes/`, or the DAK it is adapted from |
   | a decision or a transition rule | **DMN 1.3** | `processes/decisions/` |
   | classes, attributes, cardinalities | a **class diagram** (Mermaid `classDiagram`, or the ArchiMate data objects) | the block, or the information-model view |
   | a graph of named boxes and arrows with no architecture semantics | **Mermaid** `flowchart` | the block |
   | phases, layers, nested shapes, a tree, a staircase | an **SVG generated from data**: a data file plus a generator script, like dth-hrh `scripts/folio/diig_phases_hrh.py` | the folio's `media/` with the generator beside it |
   | a table of values drawn as a picture | a **table** block | the block |
   | a country example, a photograph, a screenshot, a third-party figure | **keep the cited picture** (`scope: "rebuild"` exclusion, signed off) | unchanged |

   One figure that appears in several publications (the DIIG phases chart,
   the SMART Guidelines layers, the ANC workflow) is rebuilt **once**, in
   the layer they all mount, and each folio points at it.
3. **Start from the drawing's own structure.** `pdf-vector-figures.py`
   already records, per render, the labelled boxes (`assembly.boxes`) and
   which open strokes join two of them. That is a draft node and edge list.
   Check it against the render: the assembly does not know arrow direction
   or meaning, and a label in white space belongs to no box.
4. **Keep the picture as evidence.** The rebuilt block cites the PDF page and
   keeps `meta.source.file` pointing at the crop, so a reviewer can compare.
   Record how it was made in `meta.source.method`: `archimate-view`, `bpmn`,
   `dmn`, `mermaid`, `class-diagram`, `generated` or `redrawn`, plus
   `generator` when a script draws it.
5. **Assert nothing the figure does not draw.** A rebuild is a transcription
   of the drawing. A relation the figure does not draw is not added, and
   counts, dates and country facts stay cited source content, never model
   facts (the L2 DTH workplan rule: no empirical claims in formal content).
   smart-ra's `dth_sc.py` states the same rule in its view documentation.
6. **Re-run the check.** `--require-computable` fails while any figure is
   still a `picture` or only `linked`, so a folio can adopt it as a gate once
   the rebuilds are done.

## Reading the report

| State | Meaning |
|---|---|
| `missing` | declared by the publication, no block in the folio |
| `excluded` | no block, by a signed-off `scope: "block"` exclusion |
| `picture` | only crop or image blocks |
| `linked` | a picture whose block links a model view; the view may not draw the whole figure |
| `computable` | a diagram or table block, or a figure block with a rebuild method |
| `cited` | kept as a picture on purpose, by a signed-off `scope: "rebuild"` exclusion |

As in `l1-coverage`, an agent may **propose** an exclusion, but only a person
signs one off. Declared figures are read with cat-harness-tools
`declaredFigureCaptions`, the same reading `check:l1-complete` uses, so the
two checks agree on what the publication declares.

## Related

- [`l1-document-ingestion`](l1-document-ingestion.md): the vector arms that render and label figures
- [`l1-coverage`](l1-coverage.md): the same question asked of normative sentences
- [`archimate-models`](../../../../cat-harness/skills/ui/ui-core/archimate-models.md): authoring the views
