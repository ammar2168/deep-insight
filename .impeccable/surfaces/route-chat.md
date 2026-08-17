---
version: 1
slug: "route-chat"
primary_target: "route:/chat"
related_targets: []
---

## Scope & visitor mode

Route: `/chat`. Operate mode — a dedicated space for the "go deeper" conversation, split out of the home page on user direction: a growing multi-turn conversation deserved its own persistent space rather than living inline under the insights card indefinitely, and a modal was rejected since this isn't an interruptive quick task.

## Audience, job, action, proof, constraints

- Audience: a signed-in user who tapped "Go deeper" from home, either with a question already typed or cold.
- Job: ask questions about their accumulated insights and build on the answers with follow-ups, in a real conversational space they can return to.
- Action: arrive (optionally with `?q=` prefilled from home, auto-asked on load) → read the transcript → ask follow-ups.
- Constraints from PRODUCT.md: chat/insight retrieval must be scoped to the requesting user's own data (not yet backed by anything real); English only.

## Chosen direction and memorable moment

Same Orizuru fold-sequence world, no new tokens. Explicitly avoided the generic chat-bubble pattern (colored bubbles per sender) in favor of the world's own paper vocabulary: each turn is "You asked" (indigo-600 mono label) + the question in bold, then an honest placeholder answer in a paper-200 block, with hairline crease-line dividers between turns — reads as a running paper document, not a messaging-app import.

Empty state offers three suggested questions as flowing pills (reusing the same pattern as home's insight pills) rather than a blank box, so the page has something to do immediately.

## Unresolved decisions

- No real chat/RAG backend; every answer is the same honest "not connected yet" placeholder. Real answers, streaming, loading states, and error states are all unbuilt.
- No persistence — the transcript is local component state, lost on refresh/navigation away. Whether conversations should be saved/resumable is a backend + product decision, not assumed here.
- The `?q=` handoff from home auto-asks the first question on load; whether that's the right UX (vs. requiring a second confirmation) is worth revisiting once a real answer actually appears.
