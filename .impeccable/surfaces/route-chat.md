---
version: 1
slug: "route-chat"
primary_target: "route:/chat"
related_targets: []
---

## Scope & visitor mode

Route: `/chat`. Operate mode — a dedicated space for the "go deeper" conversation, split out of the home page on user direction: a growing multi-turn conversation deserved its own persistent space rather than living inline under the insights card indefinitely, and a modal was rejected for the chat experience itself since that isn't an interruptive quick task. (The crisis check-in is a distinct, later exception to that — see below — not a reversal of it.)

## Audience, job, action, proof, constraints

- Audience: a signed-in user who tapped "Go deeper" from home, either with a question already typed or cold.
- Job: ask questions about their accumulated insights and build on the answers with follow-ups, in a real conversational space they can return to.
- Action: arrive (optionally with `?q=` prefilled from home, auto-asked on load) → read the transcript → ask follow-ups.
- Constraints from PRODUCT.md: chat/insight retrieval scoped to the requesting user's own data; English only.
- Real backend: `chat.ask` calls Claude with the user's recent insights as context; markdown-rendered answers.

## Chosen direction and memorable moment

Same Orizuru fold-sequence world, no new tokens. Explicitly avoided the generic chat-bubble pattern (colored bubbles per sender) in favor of the world's own paper vocabulary: each turn is "You asked" (indigo-600 mono label) + the question in bold, then the answer in a paper-200 block (real markdown — lists, bold — not raw text), with hairline crease-line dividers between turns.

Empty state offers three suggested questions as flowing pills (reusing the same pattern as home's insight pills).

**Crisis check-in (2026-08-14).** `chat.ask` runs `checkForCrisisSignal` on the question before calling the model at all. When flagged, the server returns `{crisis: true, answer: null}` and the client shows `CrisisCheckInModal` (see DESIGN.md Components) instead of an answer bubble — and the flagged question itself is removed from the transcript rather than left sitting there, so the user isn't confronted with it again on scroll-back. This is the deliberate exception to "no modal for chat": normal conversation still never uses one, but this specific moment needs protected focus. Copy is warm/personal, never quotes the question, and gives US and Europe resources equal weight per direct user feedback.

## Unresolved decisions

- No persistence — the transcript is local component state, lost on refresh/navigation away.
- The `?q=` handoff from home auto-asks the first question on load — if that question is crisis-flagged, the modal appears immediately on page load with no transcript behind it; acceptable, not specifically tested as its own case beyond the general flagged-question path.
- Crisis screening only covers the chat question, not the model's own answer content (unlikely to originate crisis language, but not verified either way).
