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
- Action: add photo(s) → extract → freely edit the extracted text → review insights, discarding any that don't look right → save → return to insights.
- Proof: the flow itself is the proof — an editable text field (not a confirm-only interaction) and a view of the actual extracted insights are what earn trust, not marketing copy.
- Constraints from PRODUCT.md: one entry per calendar date (multiple photos merge into one entry); OCR failure routes to manual correction (this is pre-save text editing, distinct from PRODUCT.md's "no entry-edit feature" rule, which is about editing an already-saved entry); entries are never shown back to the user post-save, only insights are; photos discarded after OCR (not represented visually — no "your photo is safe" messaging, since nothing is retained); English only.
- Backend is real (Claude vision OCR, structured insight extraction, Postgres persistence) — verified end to end against a live database.

## Chosen direction and memorable moment

Orizuru Fold Sequence (see DESIGN.md's Creative North Star), recolored from the original saturated vermilion to a calmer indigo "aizome" palette on user feedback — structure and paper/ink material logic unchanged. The three real steps (capture, correct, confirm) are carried by the world's numbered-fold-sequence device — margin rail with fold-state glyphs (pending/active/locked) — without inventing 32 literal folds.

Interaction decisions, all from direct user feedback:
- **Correction is real editing, not confirm-only.** Stage 2 is a genuine `<textarea>` on the paper surface pre-filled with OCR text.
- **Insight review is keep-or-discard, not verify-correct.** Stage 3 shows each insight with a single trash-icon action to remove it, with inline confirm before it's removed (not immediate).
- **The saved state has a clear exit, not a dead end.** "Back to your insights" (`rounded-full`, links to `/`) after saving.
- **Every non-home page has an exit link.** "← Home" text link at the top.
- **Crisis check-in on real crisis content (2026-08-14).** A real user upload containing genuine suicidal-ideation language surfaced two bugs at once: (1) the OCR model appended its own safety commentary directly into the transcribed text, polluting the entry; (2) even correctly-transcribed crisis content had nowhere to go except straight into the editable stage-2 textarea, forcing the user to re-read their own words. Fixed both: `entry.extractText` now uses forced tool-use (structurally can't emit anything but the verbatim transcription) and runs `checkForCrisisSignal` on the result; when flagged, the client shows `CrisisCheckInModal` (see DESIGN.md Components) instead of advancing to stage 2, and only proceeds once the user continues past it. The modal never quotes what they wrote, uses a warm/personal tone, and gives US and Europe crisis resources equal visual weight (explicit user feedback: don't treat US as the special case). This is the one legitimate use of a modal in this system.

## Unresolved decisions

- Multi-photo reordering/removal before extraction is supported (remove button) but there's no way to reorder pages within a session yet.
- Undo-after-confirm for a discarded insight is deferred (confirm-before-delete is built; undo is not).
- Crisis screening runs once, on the OCR'd text at `extractText` time — not re-checked if the user edits stage 2's text afterward. Acceptable for now since editing can only remove what was already screened or add new content the user is actively choosing to write with the modal already dismissed; revisit if that assumption stops holding.
