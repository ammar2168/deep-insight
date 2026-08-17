# Backlog

Working list of known gaps and deferred decisions. Not prioritized/estimated yet — just capturing them so they don't get lost. Candidate for migrating into Linear once that's set up (see note at bottom).

## Insights

- **Proper insight prioritization logic.** Right now the "lead" insight on home is just the first one Claude happened to extract (see [insight.ts](src/server/api/routers/insight.ts)) — that's a placeholder, not real ranking. Needs actual criteria: most emotionally significant? most recently changed? user-pinned? Explicitly deferred — flagged 2026-08-10, revisit once there's more real usage data to design against.
- **Manual insight adding.** No way to add an insight the extraction missed. Recommended scope (from prior discussion, not yet greenlit): allow adding one at the pre-save review stage in `/capture` only, not editing already-saved entries.
- **Undo after discard.** Confirm-before-delete exists on insight discard in `/capture`; undo does not. Deferred on purpose.
- **Insight history beyond "latest."** Home only shows the most recent entry's insights, capped, no pagination. PRODUCT.md's future RAG/knowledge-base layer will probably want to expose deeper history browsing — that's a separate surface decision when the time comes.

## Capture flow

- **Multi-photo reordering.** You can remove a photo before extraction but not reorder the set.

## Chat

- **No persistence.** Conversations live in local component state only — lost on refresh or navigating away. Whether to persist/resume conversations is a real product decision, not assumed.
- **`?q=` auto-ask from home.** Typing a question on home and hitting Ask navigates to `/chat` and auto-submits immediately. Worth revisiting whether that's the right feel now that real answers come back (vs. requiring a second confirmation on the chat page).

## Other

- **Signed-out landing page** is intentionally minimal (one card, one sentence, sign-in button) — never got a real Persuade-mode pass. Fine for now since this is a personal-use-first product, revisit if/when it's meant for strangers.
- **Error/loading state polish** for real network failures (Claude API errors, DB errors) hasn't been stress-tested — only happy-path plus the "not configured" case have been exercised.

---

**On Linear:** no Linear MCP connector was available in this environment's registry when checked (2026-08-10), so nothing's wired up yet. Once you've got a Linear workspace, worth deciding: copy this list in by hand (good way to actually learn Linear's UI/workflow), or script a one-time import via Linear's GraphQL API with a personal API key. Recommend starting manual.
