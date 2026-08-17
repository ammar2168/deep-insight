# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General public. People who keep a handwritten paper journal and want it turned into a growing, personalized source of insight about their own life — mood, sleep, lifestyle, and progress on goals — without having to re-type anything or manually track signals themselves.

## Product Purpose

Turns photos of a user's handwritten journal pages into a compounding, personal insight base. The user photographs a page (or several pages from one journalling session), the app OCRs the handwriting, stores the full raw text as that day's entry, and extracts discrete signals/insights from it. Success looks like: on every login, the user gets fresh insights about themselves, plus a way to go deeper by asking follow-up questions ("how has my mood been over the last 2 months?") that build on prior answers.

## Positioning

Not a generic note-taking or typed-journal app, and not a generic AI-journal prompt tool. The mechanism is: real handwritten pages → OCR → durable raw text → extracted, structured insights → conversational deepening over the accumulated insight history. The product's value compounds — the more the user journals by hand, the deeper and more personalized the context it can answer questions from.

## Operating Context

1. User photographs handwritten journal page(s) written on a particular day (a session can span multiple photos/pages).
2. OCR extracts text from the photo(s); the combined raw text is stored as one entry for that date.
3. If OCR fails or is low-confidence, the user manually corrects the extracted text before it's saved.
4. Insights (mood, sleep, lifestyle, goal-progress, and other meaningful-improvement signals) are extracted from the entry text and stored separately from the entry itself.
5. If OCR succeeded, the user is asked to confirm the extracted insights are roughly correct.
6. On every login, the user is shown their latest insights, with the ability to go deeper via conversational Q&A (ask questions, ask follow-ups) over their accumulated insight history.
7. Entries themselves are backend fuel only — the user-facing surface is insights and chat, not the raw entry text.

## Capabilities and Constraints

- OCR turns a handwritten photo into text; on OCR failure, the user manually corrects the text (no other failure-handling investment planned for v1).
- One entry per calendar date. An entry is the full raw text dump for that date and may be assembled from multiple photos taken in one journalling session. Multiple insights are derived from a single entry.
- Insights live in their own table, separate from entries.
- Entries are not displayed back to the user after creation — only insights (and chat over insights) are user-facing.
- No entry-edit feature after creation. This is a deliberate v1 simplification that sidesteps insight-staleness (no need to decide whether editing re-triggers insight extraction).
- Uploaded photos are discarded after OCR — not retained. Only the extracted text and derived insights persist.
- Language is fixed to English only for now (OCR, insights, and chat).
- One account per email address — signup/login should dedupe by email rather than allowing multiple accounts per person.
- Data-quality principle: since insights are extracted from stored entry text, minimizing noise in what gets stored as an entry matters more than covering every edge case. v1 should handle the common path well (photo → OCR → correction-if-needed → clean text) without over-engineering rare scenarios.
- Chat/insight retrieval must be scoped to the requesting user's own data only.
- Data sensitivity: treated as standard app data for now (no special handling beyond normal auth-gated access); this is an explicit early-stage choice, not a determination that the data isn't sensitive — revisit as the product matures.
- Future direction (undecided/not yet built): the "latest insights" shown on login are expected to eventually be synthesized by a RAG/knowledge-base layer over the user's accumulated insight history, not just the single most-recent entry's insights. The home surface should therefore treat insights as a short recent history/stream rather than a single-item view, even before that synthesis layer exists.

## Evidence on Hand

Current codebase is a create-t3-app scaffold (Next.js, tRPC, Drizzle, better-auth) with GitHub OAuth login and a bare flat-text entry CRUD list ([entries.tsx](src/app/_components/entries.tsx)). None of the differentiating functionality — photo upload, OCR, insight extraction, insights table, or chat — is built yet; the current `entry` schema and UI are a placeholder for the future photo→OCR→entry flow, not the target design.

## Product Principles

1. Data quality over feature breadth — clean, low-noise entry text is the foundation everything else (insights, chat) is extracted from.
2. Solve the common path well; don't pre-build handling for edge cases that haven't shown up yet.
3. Insights are the product surface, not entries — the user should feel like they're getting told something about themselves, not managing a text database.
4. Personalization compounds over time through conversational follow-up on accumulated insight history.
5. Keep v1's surface area small on purpose: English-only, one account per email, no entry editing.
