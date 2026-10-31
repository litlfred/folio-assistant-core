---
# folio-core-xpsq
$schema: bean/1.0.0
title: 'Fetch scripts follow server-supplied links without a destination check'
status: todo
type: bug
priority: low
tags:
    - security
    - security-review-2026-10-31
    - red-flag-security
created_at: 2026-10-31T04:01:25Z
updated_at: 2026-10-31T04:01:25Z
---

Found by the 2026-10-31 security and QA review of the folio-assistant layers (SOP: cat-harness `skills/conduct/security/`, the 16 rules of `skills/voices/secure-code-authoring/voice.json`, RED FLAG categories of cat-harness-tools `schemas/sdlc/red-flag.ts`). No fix PR yet: fixes wait for the owner's go-ahead.

**Category:** security · **Severity:** minor

Rule `scz-guard-outbound-requests`.

- `scripts/fetch-dspace-item.ts:154`: fetches `pdfs[0]._links.content.href` from the DSpace JSON, any host.
- `scripts/fetch-who-publication.ts:158`: fetches an `href` read from the fetched page, any host.
- `scripts/source-liveness.ts:59`: `redirect: "follow"` for every library source URL.

These are CLI and CI scripts, so the impact is limited to where the runner can reach (for example cloud metadata endpoints on a self-hosted runner). Check the scheme is https and the host is the expected repository host (or an allow-list) before each fetch and after each redirect.

## Done when

- [ ] Each fetch refuses non-https and unexpected hosts, including after redirects
