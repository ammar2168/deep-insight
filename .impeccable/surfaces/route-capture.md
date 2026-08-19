---
version: 1
slug: "route-capture"
primary_target: "route:/capture"
related_targets: []
---

## Scope & visitor mode

Route: `/capture`. Operate mode — a signed-in user completing the app's core input task (turn a photographed journal page into a saved entry), not a marketing surface. Expression must never obscure the task.

## Audience, job, action, proof, constraints

- Audience: an existing user, mid-journalling ritual, phone in hand right after (or shortly after) writing by hand.
- Job: get from photo(s) of today's page to a saved entry with as little friction as possible, while trusting that what gets saved is accurate.
- Action: add photo(s) → extract → freely edit the extracted text → review insights (discard any that don't look right, add any that were missed) → save → return to insights.
- Proof: the flow itself is the proof — an editable text field, a view of the actual extracted insights, and the ability to add your own are what earn trust, not marketing copy.
- Constraints from PRODUCT.md: one entry per calendar date (multiple photos merge into one entry); OCR failure routes to manual correction (this is pre-save text editing, distinct from PRODUCT.md's "no entry-edit feature" rule, which is about editing an already-saved entry); entries are never shown back to the user post-save, only insights are; photos discarded after OCR; English only.
- Backend is real (Claude vision OCR, structured insight extraction, Postgres persistence) — verified end to end against a live database.

## Chosen direction and memorable moment

Orizuru Fold Sequence (see DESIGN.md's Creative North Star), recolored from the original saturated vermilion to a calmer indigo "aizome" palette on user feedback — structure and paper/ink material logic unchanged. The three real steps (capture, correct, confirm) are carried by the world's numbered-fold-sequence device — margin rail with fold-state glyphs (pending/active/locked) — without inventing 32 literal folds.

Interaction decisions, all from direct user feedback:
- **Correction is real editing, not confirm-only.** Stage 2 is a genuine `<textarea>` on the paper surface pre-filled with OCR text.
- **Insight review is keep-or-discard, not verify-correct.** Stage 3 shows each insight with a single trash-icon action to remove it, with inline confirm before it's removed (not immediate).
- **The saved state has a clear exit, not a dead end.** "Back to your insights" (`rounded-full`, links to `/`) after saving.
- **Every non-home page has an exit link.** "← Home" text link at the top.
- **Crisis check-in on real crisis content (2026-08-14).** Fixed OCR hardening (forced tool-use, can't inject commentary) plus `CrisisCheckInModal` (see DESIGN.md Components) when `checkForCrisisSignal` flags OCR'd text — the one legitimate modal in this system.
- **Manual insight adding (2026-08-19).** An "Add an insight" affordance (dashed-border trigger, matching the stage-1 upload dropzone's language at a smaller scale) sits below the insight list. Clicking swaps it for an inline form — category select, label, value — Cancel/Add, same "trigger swaps to form in place" pattern as the discard-confirm row. Scoped deliberately: pre-save review only, never editing an already-saved entry. Same fix closed a real dead end — the empty-insights state used to say "go back and add photos again" with no other path forward; now the add form is the escape hatch, and Save entry is disabled until at least one insight exists (extracted or added).
- **Insight editing (2026-08-19).** Each insight row now carries an Edit (pencil) icon next to Discard. Clicking it swaps that row for the same inline form used by "Add an insight," pre-filled with its current category/label/value, Cancel/Save instead of Cancel/Add — reuses the add flow's form rather than a second implementation. Edit, discard-confirm, and add-new are mutually exclusive; opening one closes any other that's open.

## Unresolved decisions

- Undo-after-confirm for a discarded insight is deferred (confirm-before-delete is built; undo is not).
- Crisis screening runs once, on the OCR'd text at `extractText` time — not re-checked if the user edits stage 2's text, or adds a manual insight, afterward. Acceptable for now; revisit if that assumption stops holding.
- Multi-photo reordering — considered and deliberately not building it: insight display order is fully decided by category-priority ranking, independent of photo/entry order, and entries are never shown to the user, so there's no visible payoff.
