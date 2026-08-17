---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

## Scope & visitor mode

Route: `/`. Operate mode for signed-in users (the daily-return surface: check what surfaced, capture today, optionally go deeper). The signed-out state is a minimal gate, not a Persuade landing page — no marketing copy beyond one sentence, just identity + sign-in.

## Audience, job, action, proof, constraints

- Audience: an existing signed-in user opening the app, most likely once a day.
- Job: see what surfaced from their journalling, capture today's page with minimal friction, and optionally ask a deeper question.
- Action: glance at latest insights → either add today's page (primary path) or ask a follow-up question (secondary path).
- Constraints from PRODUCT.md: entries are never shown, only insights; one account per email (unaffected here); the "latest insights" section is expected to eventually be backed by a RAG/knowledge-base synthesis layer over accumulated history rather than a single entry's insights, so it's treated as a capped "recent signal" view, not a literal single-record display — implementation is intentionally decoupled from this UI.

## Chosen direction and memorable moment

Structure was rolled via `concept-seed.mjs --scope surface --mode operate`; the user overrode the assigned "hero + scrollable history list" shape (no scrollable history, latest insights only, capped).

Two amplification passes followed, both scoped to what already existed (no new palette/fonts):
1. **First bolder pass** — the page read flat/institutional ("hospital website"). Fix: brought the system's own fold-diamond motif to full scale as a hero background graphic (previously only used tiny in `/capture`'s stage rail), added real elevation/shadow to cards, a hover-lift on the CTA, bigger/bolder greeting type, and a load-in stagger animation.
2. **Second bolder pass** — the insight grid itself (uniform bordered boxes) still read rigid, generic-dashboard, "not flowy." Fix: replaced it with a single paper sheet holding one large lead-statement insight plus the rest as `rounded-full` flowing pills (`flex-wrap`, no borders, sized to content). Extended the same `rounded-full` treatment to every button, link-button, and text input on the page (CTA, sign-in, chat input/send) — this became a documented system rule (DESIGN.md Shapes: sharp `rounded-sm` for paper surfaces, `rounded-full` for anything interactive/tag-like), not a one-off.

Layout, top to bottom: header (greeting + sign out) → one unmissable primary CTA ("Add today's page", `rounded-full`, links to `/capture`) → one paper sheet with a lead insight + flowing insight pills → a contextual "Go deeper" chat card directly beneath, pill input/button, honest "not connected yet" response on submit.

## Unresolved decisions

- Real insights/chat backends aren't wired up; insights are fixed example data (labeled), and the "Ask" card's response is an honest placeholder message, not a real answer.
- Deleted the create-t3-app scaffold's demo `Entries` and `LatestPost` components (unused after this change, and `Entries` directly contradicted PRODUCT.md's "entries are never shown to the user" rule) — their backing tRPC routers/schema (`entry`, `post`) were left untouched since that's a backend concern, not a design one.
- No pagination/history view exists for insights beyond the capped latest set — if the RAG layer later wants to expose deeper history browsing, that's a separate surface decision, not assumed here.
- Signed-out gate is intentionally minimal (one card, one sentence, sign-in button) — pill-shaped sign-in button now matches the new shape rule, but it wasn't otherwise a focus of either bolder pass.
- Which insight becomes the "lead" (currently just the first item) isn't a real ranking decision yet — will need real criteria once insight extraction exists (most recent? most significant change? user-pinned?).
