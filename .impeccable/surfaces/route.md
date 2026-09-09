---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

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
- Constraints from PRODUCT.md: entries are never shown, only insights; one account per email (unaffected here); the "latest insights" section is expected to eventually be backed by a RAG/knowledge-base synthesis layer over accumulated history rather than a single entry's insights, so it's treated as a capped "recent signal" view, not a literal single-record display.
- Backend is real: `insight.latest` fetches the most recent entry's insights and ranks them before returning — see below.

## Chosen direction and memorable moment

Structure was rolled via `concept-seed.mjs --scope surface --mode operate`; the user overrode the assigned "hero + scrollable history list" shape (no scrollable history, latest insights only, capped).

Two amplification passes followed, both scoped to what already existed (no new palette/fonts):
1. **First bolder pass** — the page read flat/institutional ("hospital website"). Fix: brought the system's own fold-diamond motif to full scale as a hero background graphic, added real elevation/shadow to cards, a hover-lift on the CTA, bigger/bolder greeting type, and a load-in stagger animation.
2. **Second bolder pass** — the insight grid itself (uniform bordered boxes) still read rigid, generic-dashboard, "not flowy." Fix: replaced it with a single paper sheet holding one large lead-statement insight plus the rest as `rounded-full` flowing pills. This became a documented system rule (DESIGN.md Shapes: sharp `rounded-sm` for paper surfaces, `rounded-full` for anything interactive/tag-like).

Layout, top to bottom: header (greeting + sign out) → one unmissable primary CTA ("Add today's page", `rounded-full`, links to `/capture`) → one paper sheet with a lead insight + flowing insight pills → a contextual "Go deeper" chat card directly beneath.

**Insight prioritization (2026-08-15).** Which insight leads used to be arbitrary (extraction/insertion order). `insight.latest` now runs the fetched rows through `rankInsights` (src/server/insights/priority.ts) before returning: a fixed category priority (`mood > health > goal > sleep > relationships > movement > other`), recency as tie-break within a category. Deliberately a product decision (which category matters most), not a data-derived heuristic — and deliberately a pure function taking the priority order as a parameter, so a future per-user priority (from an onboarding questionnaire, see BACKLOG.md) is a call-site change, not a rewrite.

**Crispness correction (2026-09-08).** Real beta-user feedback on two points, both addressed without reverting the bolder passes above: (1) the mono eyebrow "Since you last opened this" directly above the "Hi {name}" heading was a textbook kicker/eyebrow — craft-floor bans this pattern outright ("no brief earns it back"), and unlike the `/capture` stage rail's mono labels (genuine step numbers, explicitly exempted), this one carried no wayfinding information to justify an exception. Removed; the heading now stands alone. (2) The hero fold motif's gold-filled inner diamond — confirmed as the deliberate, documented identity mark, not an inconsistency — sat close enough to the Settings/Sign out links (both `top-1/2`-anchored in the same header row) that a first-time user read it as possibly interactive rather than atmospheric. Repositioned to anchor from `bottom-0` instead of `top-1/2`, moving its visual center down toward the "Add today's page" CTA — a large, unambiguous button is a much safer neighbor for ambiguous decoration than small text links are. Also given an explicit smaller mobile size (`220px` vs `340px` at `sm:` and up) after checking the fix at the mobile breakpoint specifically surfaced a regression the desktop check missed: the same translate values eat proportionally more of a 375px viewport, pulling the motif back up near the nav row. The motif itself, its brand meaning, and the "hospital website" fix it was originally added for are all preserved — this only changes where and how large it sits.

**Polish pass (2026-09-09).** Two real defects, found by seeding real (properly-encrypted, realistic-length) insight data through `entry.save` and evaluating the actual rendered page rather than reading source. (1) The "Go deeper" ask input's placeholder ("How has my mood been the last two months?") measured 305px against a 285px-wide input on mobile — hard-clipped mid-word, no ellipsis. Shortened to "How's my mood been lately?" (193px, comfortable margin), matching `/chat`'s own follow-up input which already used short placeholder copy — this page's version was the one outlier. (2) Settings, Sign out, and the primary CTA all sit directly on the `indigo-700` page chrome (not a paper-100 card), but inherited the app's common `focus-visible:outline-indigo-600` — correct on paper surfaces, but ~1.25:1 contrast against indigo-700, effectively invisible to keyboard users. Swapped to `indigo-400` (already documented as the on-indigo-ground text color, and already used for these same links' resting state) — ~5.4:1, confirmed via genuine keyboard Tab navigation, not just computed styles (a synthetic `.focus()` call doesn't trigger `:focus-visible` in automated testing and gave a false reading before this was caught). Also investigated and *ruled out* two other suspects as working-as-intended, not defects: the flowing insight pills rarely wrap onto shared rows in practice (realistic one-sentence insight values are simply wide relative to this container at any reasonable width — but pills remain correctly content-sized, not stretched, so the "not a rigid grid" character holds even without much visible wrapping); and the "LATEST INSIGHTS" mono label is a legitimate section landmark (distinguishing this panel from the "Go deeper" panel below it, disambiguating dynamic lead-insight text that could otherwise read as a quote or alert), not the banned kicker-above-heading pattern — unlike the removed "Since you last opened this," it carries real identifying information.

## Unresolved decisions

- No pagination/history view exists for insights beyond the capped latest set — if the RAG layer later wants to expose deeper history browsing, that's a separate surface decision, not assumed here.
- Signed-out gate is intentionally minimal (one card, one sentence, sign-in button).
- Insight priority is a single global default for all users right now — the onboarding questionnaire + settings page to personalize it is scoped in BACKLOG.md but not built.
- The focus-ring contrast fix (indigo-600 → indigo-400 on dark backgrounds) was scoped to this page's three affected controls only. The same shared utility string likely produces the same ~1.25:1 issue anywhere else in the app a control sits directly on the indigo-700/900 page chrome rather than a paper-100 card (e.g. back-links on `/capture`, `/chat` — not checked this pass).
