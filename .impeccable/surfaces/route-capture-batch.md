---
version: 1
slug: "route-capture-batch"
primary_target: "route:/capture/batch"
related_targets: []
---

---
version: 1
slug: "route-capture-batch"
primary_target: "route:/capture/batch"
related_targets: ["route:/capture"]
---

## Scope & visitor mode

Route: `/capture/batch`. Operate mode — a signed-in user catching up on a backlog of already-written pages (several missed days, or a full stack of old physical journals being digitized for the first time), not a marketing surface.

## Audience, job, action, proof, constraints

- Audience: a signed-in user with more than one day's worth of already-handwritten pages to get into the app in one sitting — either falling behind on daily capture, or a brand-new user digitizing an existing paper journal to get real accumulated insight from day one instead of waiting weeks for value to compound.
- Job: get from a pile of photos to saved, dated entries with as little manual work as possible — ideally zero clicks between "select pages" and "done" beyond the occasional date the app genuinely can't determine.
- Action: select every page at once → (rare) confirm a date the app couldn't detect → land on home with real insights already live.
- Constraints from PRODUCT.md: one entry per calendar date (same-day photos still need to merge into a single entry); OCR failure has no correction UI here (this flow explicitly has no review step — a page that fails OCR is skipped and named in the summary, not blocked on); entries are never shown back to the user; photos discarded after OCR (no retention beyond the existing per-photo compress-then-discard pattern `/capture` already uses).
- Backend is real and unchanged from `/capture`: the same three procedures (`entry.extractText`, `entry.extractInsights`, `entry.save`) — verified end to end against a live database using real photographs run through real Claude OCR, not synthetic entries inserted directly.

## Chosen direction and memorable moment

Same Orizuru Fold Sequence world as `/capture` — indigo chrome, paper working surface, no new tokens or components introduced. The one deliberate structural departure: **no numbered margin rail**. `/capture`'s rail exists because the user actively navigates three discrete stages (capture, correct, confirm) themselves; this flow has no stages the user drives — it's one continuous background operation with rare interrupts — so forcing a rail onto it would describe a structure that isn't there. This mirrors how `/` and `/settings` already skip the rail for the same reason (no discrete user-driven stages), so this isn't a new exception, just the same existing precedent applied to a new surface.

**Redesigned in full (2026-09-10)**, replacing the original manual-grouping implementation: previously the user created a "day" card by hand, picked its date from a date picker, added that day's photos to it, repeated per day, then stepped through the full `/capture`-style review-and-confirm pipeline once per day via "Next day." Real product feedback: a user with an actual backlog of old journals to digitize doesn't want to hand-group dozens of pages by day before even starting, and doesn't get the "spark" of the product — real accumulated insight and something to ask chat about — until they've clicked through review and confirm for every single day. The whole point of feeding in a backlog at once is to skip the empty-account cold start; a slow, review-heavy path to get there defeats it.

New shape:
1. **One upload.** A single `PhotoPicker` (reused as-is from `/capture` — no new component) takes every page at once, capped at 50 photos. No day-grouping UI at all.
2. **Auto-date per photo, not per pre-made group.** Each photo is OCR'd individually (not batched up to 10 like `/capture` does) specifically so its own detected dateline can be read before grouping happens — batched OCR only returns one combined date list for the whole batch with no way to attribute a date back to a specific photo, which is exactly the information this flow needs first. This is the one real cost of the redesign: more OCR calls for the same page count than the original flow made. Accepted deliberately as the price of removing manual grouping, not an oversight.
3. **Date resolution order**: the photo's own detected dateline → the previous photo's resolved date (multi-page entries rarely repeat the date on every page, so a continuation page correctly folds into the prior day) → ask the user. Only the third case interrupts the pipeline, and only long enough to type one date — an inline paper-100 panel (not a modal; the crisis check-in remains the system's only modal) showing the actual photo thumbnail and its OCR'd text so the user has enough context to answer, then resumes automatically.
4. **No review step, anywhere.** Neither the OCR'd text nor the extracted insights are shown for editing or per-item confirm — text and insights for a finished day-group save straight through. This is the flow's core trade: speed and zero friction over the chance to catch an OCR or extraction mistake before it's saved, matching what was explicitly asked for.
5. **Crisis check-in is preserved exactly**, not weakened for the sake of speed: if any individual photo's OCR trips `checkForCrisisSignal`, the pipeline pauses and shows the real `CrisisCheckInModal` — the system's one exception to "no modals" — before continuing, exactly like `/capture` does. Safety behavior is never a casualty of the "no review" simplification.
6. **A live, honest progress readout** while running ("Processing page 7 of 34," mono/tabular figures matching the system's convention for count data) plus a running list of days already saved — since a 50-photo batch, OCR'd one photo at a time, can genuinely take a few minutes, copy says so directly rather than leaving a bare spinner to imply something faster than reality.
7. **A summary panel on completion** — days added, how many needed a manually-entered date, any pages that failed OCR and were skipped (named individually, pointed at `/capture` to add by hand) — before linking back to `/`. Silently dropping the user back on home after a multi-minute unattended run without any acknowledgment would read as untrustworthy given how long the wait can be.

## Unresolved decisions

- No server-side background job — this is a client-driven sequential loop across real tRPC calls. If the tab closes or the user navigates away mid-run, whatever groups already finalized stay saved (real, atomic per-group writes), but anything not yet processed is simply lost, not resumable. Accepted as the right v1 scope; a real job queue is a separate, larger infrastructure decision, not assumed here.
- Sequential processing only, no concurrency — simpler and avoids rate-limit/state complexity for v1, at the cost of total wall-clock time on a large batch. Revisit if batch sizes in practice make this feel too slow.
- The 50-photo cap is a flat ceiling, not tuned against real usage yet — chosen as the upper end of the range discussed, not derived from a cost or latency budget.
- Duplicate-entry detection (`entry.findPossibleDuplicate`, used by `/capture`) is intentionally not wired into this flow — a user digitizing an old backlog is very unlikely to already have entries on those dates, and surfacing a duplicate warning mid-unattended-run would be an unwanted interrupt for a case that mostly doesn't apply here.
