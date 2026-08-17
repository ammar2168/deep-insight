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
- Constraints from PRODUCT.md: one entry per calendar date (multiple photos merge into one entry); OCR failure routes to manual correction (this is pre-save text editing, distinct from PRODUCT.md's "no entry-edit feature" rule, which is about editing an already-saved entry); entries are never shown back to the user post-save, only insights are; photos discarded after OCR (not represented visually — no "your photo is safe" messaging, since nothing is retained); English only; this UI's insight/OCR data is currently mocked and labeled as such since the backend isn't wired up yet.

## Chosen direction and memorable moment

Orizuru Fold Sequence (see DESIGN.md's Creative North Star), recolored from the original saturated vermilion to a calmer indigo "aizome" palette on user feedback — structure and paper/ink material logic unchanged. The three real steps (capture, correct, confirm) are carried by the world's numbered-fold-sequence device — margin rail with fold-state glyphs (pending/active/locked) — without inventing 32 literal folds.

Interaction decisions, all from direct user feedback:
- **Correction is real editing, not confirm-only.** Stage 2 is a genuine `<textarea>` on the paper surface pre-filled with OCR text; low-confidence words are named in an informational caption below, not gated behind individual confirm clicks. Continue is enabled once the field has any content.
- **Insight review is keep-or-discard, not verify-correct.** Stage 3 shows each insight with a single trash-icon action to remove it; there's no per-item "looks right" confirmation and Save entry is available immediately (disabled only when the list is empty).
- **The saved state has a clear exit, not a dead end.** After saving, a "Back to your insights" button (`rounded-full`, links to `/`) is the primary action — flagged as a usability gap (task completion with no way forward) and fixed rather than left as an open item.
- **Discarding an insight requires inline confirmation.** Trash icon arms a "Remove '{label}'? Keep / Remove" state on that row rather than deleting immediately — a destructive one-click action always gets a confirm step in this system now (documented in DESIGN.md). Undo-after-confirm is explicitly deferred, not designed.
- **Every non-home page has an exit link.** A small "← Home" text link at the top of `/capture` (and `/chat`) fixes the same class of issue as the saved-state button: no multi-step flow should trap the user with only the browser back button as an escape route.

## Unresolved decisions

- Real OCR/insight extraction isn't wired up; stage 2 and 3 currently show fixed example content, clearly tagged.
- Multi-photo reordering/removal before extraction is supported (remove button) but there's no way to reorder pages within a session yet.
- Undo-after-confirm for a discarded insight is deferred (confirm-before-delete is built; undo is not) — noted explicitly as a "for now" simplification, revisit later.
