---
# folio-core-shsz
title: Translation info drawer on every translation warning (pointer → cat-tools-bbnd)
status: todo
type: feature
tags:
    - rehomed
created_at: 2026-10-10T17:26:40Z
updated_at: 2026-10-10T17:26:40Z
parent: folio-assistant-slw1
---

Owner request, 2026-10-10: open a drawer with more translation information from translation warnings, on content blocks, (sub)graphs and elsewhere.

**Rehomed on filing.** The work is filed as `litlfred/cat-harness-tools` bean **`cat-tools-bbnd`** (cat-harness-tools PR #76). That bean holds the full analysis and the owner's rulings:
- an inline drawer reusing the QA panel;
- JS-rendered, to keep the HTML slim;
- officiality recorded in both the PO header and status.json, checked to agree.

Core's share is the builders: `build-document-site.ts` and `build-library-site.ts` must emit the `fa-translation-meta` data hook the drawer reads. Today they emit no translation status at all. This copy closes when `cat-tools-bbnd` does.
