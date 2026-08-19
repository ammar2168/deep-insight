# Backlog

Working list of known gaps and deferred decisions. Not prioritized/estimated yet — just capturing them so they don't get lost. Candidate for migrating into Linear once that's set up (see note at bottom).

## Insights

- ~~**Proper insight prioritization logic.**~~ Minimal version shipped 2026-08-15 — `rankInsights` (src/server/insights/priority.ts) orders by a fixed category priority (`mood > health > goal > sleep > relationships > movement > other`), recency as tie-break within a category. Deliberately a pure function taking the priority order as a parameter, not a hardcoded default baked into the sort — that's the seam for the next step.
- **Onboarding priority questionnaire + settings.** The real next step for prioritization: ask the user their priorities at signup (which of mood/sleep/goals/etc. matters most to them) and store it per-user, then pass that into `rankInsights` instead of `DEFAULT_CATEGORY_PRIORITY`. Add a settings page to edit it later. Not built yet — the current static ranking exists specifically so this is a call-site change (swap the priority-order argument) rather than a rewrite of the ranking logic.
- ~~**Manual insight adding.**~~ Shipped 2026-08-19 — an "Add an insight" affordance on `/capture` stage 3 (category select + label + value), scoped exactly as discussed: pre-save review only, no editing of already-saved entries. Also fixed a related dead end while in there: the empty-insights state previously had no way forward ("go back and add photos again"); now the same add-insight form is the escape hatch, and Save entry is disabled until at least one insight exists (extracted or added).
- **Multi-photo reordering — reconsidered, not pursuing.** Considered building drag-to-reorder for photos before OCR, then realized it doesn't matter: all photos in one session combine into one entry, insights get extracted from the whole text, and insight *display* order is fully decided by category-priority ranking, independent of photo/paragraph order. Entries themselves are never shown to the user, so there's no visible payoff. Not building this.
- **Undo after discard.** Confirm-before-delete exists on insight discard in `/capture`; undo does not. Deferred on purpose.
- **Insight history beyond "latest."** Home only shows the most recent entry's insights, capped, no pagination. PRODUCT.md's future RAG/knowledge-base layer will probably want to expose deeper history browsing — that's a separate surface decision when the time comes.

## Chat

- **No persistence.** Conversations live in local component state only — lost on refresh or navigating away. Whether to persist/resume conversations is a real product decision, not assumed.
- **`?q=` auto-ask from home.** Typing a question on home and hitting Ask navigates to `/chat` and auto-submits immediately. Worth revisiting whether that's the right feel now that real answers come back (vs. requiring a second confirmation on the chat page).

## Safety

- **Crisis screening covers entry text and chat questions, not chat answers.** `checkForCrisisSignal` runs on OCR'd entry text (`entry.extractText`) and chat questions (`chat.ask`) before the user sees them. It does not screen what the model itself generates in an answer — low risk given the system prompt's constraints, but not verified either way. Revisit if it ever seems necessary.
- **Crisis screening runs once per entry, not on edits.** If a user's stage-2 text edit introduces new crisis language after the OCR check already passed, it won't be re-screened before save. Low-probability edge case, deliberately not built.
- ~~**No crisis-language guardrail on capture/OCR text.**~~ Fixed 2026-08-14 — see `CrisisCheckInModal` / `checkForCrisisSignal`. A real user upload surfaced this as a live bug (the OCR model injected its own safety commentary into the transcription, and even clean transcriptions had nowhere to route flagged content); root-caused and fixed same day.

## Other

- **Signed-out landing page** is intentionally minimal (one card, one sentence, sign-in button) — never got a real Persuade-mode pass. Fine for now since this is a personal-use-first product, revisit if/when it's meant for strangers.
- **Error/loading state polish** for real network failures (Claude API errors, DB errors) hasn't been stress-tested — only happy-path plus the "not configured" case have been exercised.

---

**On Linear:** no Linear MCP connector was available in this environment's registry when checked (2026-08-10), so nothing's wired up yet. Once you've got a Linear workspace, worth deciding: copy this list in by hand (good way to actually learn Linear's UI/workflow), or script a one-time import via Linear's GraphQL API with a personal API key. Recommend starting manual.
