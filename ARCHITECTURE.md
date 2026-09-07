# Architecture: Deep Insights & Smart Chat

A reference for how the backend actually works — the data model, the capture pipeline, encryption, consent, and the two-tier trend-analysis engine ("Tier 1 / Tier 2") that powers chat's ability to answer questions about patterns over time, not just recent facts.

This describes what's built as of the `deep-insights-foundation` branch. Where something is deliberately not built yet, it says so explicitly rather than describing aspirational behavior.

---

## 1. The data model

Two tables carry almost everything. Both are encrypted at rest (see §3).

```
entry
  id            integer, primary key
  text          text — the full OCR'd/typed journal entry, ENCRYPTED
  textHash      text — SHA-256 of the normalized plaintext, for duplicate detection
  entryDate     date — the calendar day this entry is ABOUT
  userId        text — FK to user, cascade delete
  createdAt     timestamptz — when this row was saved (NOT the same thing as entryDate)
  updatedAt     timestamptz

insight
  id            integer, primary key
  entryId       integer — FK to entry, cascade delete
  userId        text — FK to user, cascade delete
  category      enum: mood | sleep | movement | relationships | goal | health | other
  label         text — short, sometimes compound (e.g. "Goal: Marlowe project")
  value         text — one sentence, second-person, ENCRYPTED
  createdAt     timestamptz
  updatedAt     timestamptz
```

**`entryDate` vs `createdAt` — this distinction matters everywhere downstream.** `createdAt` is when the database row was written — set automatically, useless for date-arithmetic. `entryDate` is the calendar day the entry is actually about, always supplied explicitly by the client (defaulting to the browser's local "today," never the server's), editable only during the pre-save review stage, and immutable after that. Every piece of Tier 1/Tier 2 logic keys off `entryDate`, never `createdAt`.

**`textHash`** is a SHA-256 of the entry text after trimming, lowercasing, and collapsing whitespace — computed once at save time, always from plaintext, before encryption. It exists purely so duplicate-entry detection can do an indexed exact-match lookup (`entry_user_id_text_hash_idx` on `(userId, textHash)`) instead of comparing text to text — cost stays flat regardless of how much history a user has. It's a soft signal in the UI (a warning with a "continue anyway" override), never a hard block, because the system genuinely cannot tell a real accidental duplicate apart from two different days that happen to read the same.

Third table, added for encryption:

```
user_encryption_key
  userId        text, primary key — FK to user, cascade delete
  wrappedDek    text — this user's data-encryption key, encrypted by the master key
  createdAt     timestamptz
```

---

## 2. Capture flow (how an entry gets created)

Three stages, each a separate tRPC procedure in [`entry.ts`](src/server/api/routers/entry.ts):

1. **`extractText`** — OCR photo(s) into raw text via Claude, screened for crisis language before the client ever shows it.
2. **`extractInsights`** — the (possibly hand-edited) text goes back to Claude, forced via tool-call to return 3–6 discrete `{category, label, value}` insights.
3. **`save`** — the user confirms/edits the date, text, and insights, then this actually persists. This is where `textHash` gets computed, `entryDate` gets validated (must not be more than a day in the future, no lower bound — old paper journals are a real use case), duplicate-checking happens (`findPossibleDuplicate`, a warning only), and both `text` and every insight `value` get encrypted before the `INSERT`.

Nothing is editable after step 3 saves. That immutability is load-bearing: it's what makes a "closed" week of data safe to treat as permanently stable (relevant if/when Tier 2 output ever gets cached).

---

## 3. Encryption

[`envelope.ts`](src/server/crypto/envelope.ts) — envelope encryption, AES-256-GCM. The public surface is deliberately two functions (plus a batched variant):

```ts
encryptForUser(userId, plaintext): Promise<string>
decryptForUser(userId, ciphertext): Promise<string>
decryptManyForUser(userId, ciphertexts[]): Promise<string[]>  // one key fetch, not one per item
```

Nothing outside this file knows what a DEK, an IV, or GCM is. That narrow surface is what makes it possible to change *how* or *where* the master key is stored later without touching a single caller.

**The mechanism:** each user gets one randomly-generated 32-byte key (their DEK), created the first time they save anything. That DEK is what actually encrypts their `entry.text` and `insight.value`. The DEK itself is never stored in plaintext — it's encrypted ("wrapped") by a single app-wide **master key** and only the wrapped form lives in `user_encryption_key.wrappedDek`. The master key lives as `MASTER_ENCRYPTION_KEY` (base64, 32 random bytes) — a separate, independently-generated value in dev (`.env`) and prod (Vercel env vars); the two are never the same key, and rotating one has no effect on the other's already-encrypted data.

Why two keys instead of one: if a database leak exposed a single shared master key, every user's data would be readable at once, and deleting one user's data could never be truly final (the same key would still work on any stray backup of their old ciphertext). With per-user DEKs, destroying one user's key permanently shreds their data — even a lingering backup copy becomes unreadable garbage — without touching anyone else. A DB leak alone, without the master key, yields nothing but wrapped keys.

`textHash` is deliberately *not* encrypted — it's a hash of normalized plaintext, computed before encryption, so duplicate detection keeps working without ever touching the encryption layer.

---

## 4. Consent

[`consent.ts`](src/server/consent.ts) + [`user_consent` schema](src/server/db/schema/consent.ts). A `consentedProcedure` — wraps `protectedProcedure` with one more check — is what every data-touching procedure uses (capture, chat, reading insights): no session, no consent record matching `CURRENT_TERMS_VERSION`, no call proceeds, including the ones that send data to a third-party AI. Enforced server-side, not just a UI gate a direct API call could skip.

Two things deliberately stay on plain `protectedProcedure`, not `consentedProcedure`: `consent.status`/`consent.accept` (you must be able to see what you're agreeing to before agreeing to it), and `settings.deleteAccount` (leaving is never gated behind accepting terms someone doesn't want to accept).

`user_consent` has no foreign key to `user` — the one deliberate exception to how every other table here is wired. It's an audit record that consent existed at the time data was processed, not a piece of the user's own data, so account deletion leaves it untouched instead of cascading it away. Bumping `CURRENT_TERMS_VERSION` invalidates every existing consent at once; anyone who accepted an older version is asked again next time.

The home page checks consent alongside session, server-side, and renders a plain-language gate — what's stored, that a named third party (Anthropic's Claude) processes it, that deletion is available anytime — instead of the dashboard until accepted.

---

## 5. Chat, the simple path

[`chat.ts`](src/server/api/routers/chat.ts) fetches the user's 50 most recent insights (decrypted), and calls `answerQuestion` in [`insights.ts`](src/server/ai/insights.ts). By default this is a single Claude call answering from that flat, recent-insight context — cheap, fast (2–3 seconds), no tool use.

This is deliberately *not* smart about trends. It's a flat recency window, and the whole reason Tier 1/Tier 2 exists is that this window is structurally too small and too recency-biased to answer a question like "how has my sleep been over the last six months."

---

## 6. Tier 1 — the index

[`timeline.ts`](src/server/insights/timeline.ts). One function that matters:

```ts
buildInsightTimeline(userId, startDate, endDate): Promise<TimelineEntry[]>
// { entryId, insightId, entryDate, category, label, value }
```

This is a **cross-category** pull — every insight in the date range, every category, decrypted, capped at 400 days. Deliberately *not* filtered to just the category the question is about: the real explanation for a sleep change is often a `health` or `goal` entry with no obvious topical connection to sleep, and filtering by category before an LLM ever sees the data would rule out exactly the connections this whole feature exists to find. It's also deliberately *not* RAG/embeddings — semantic similarity search would miss the same cross-category link for the same reason a human skimming would (a medication note has no textual similarity to "sleep"), so it isn't the right retrieval primitive here.

A second, narrower function, `getRawEntryText(userId, dates[])`, fetches full raw entry text (not just the compact insight index) for a *small, specific* set of dates — capped at 50. This is never called with a broad range; it exists only for Tier 2's confirm step, below.

---

## 7. Tier 2 — flag, confirm, synthesize

[`trends.ts`](src/server/ai/trends.ts) holds three LLM calls; [`trend-analysis.ts`](src/server/insights/trend-analysis.ts) orchestrates them into one function, `analyzeTrend(userId, question, {start, end})`, which is the only thing anything else ever calls.

**Why three steps instead of one big prompt:** dumping months of raw entry text into a single call is both expensive and exactly what Tier 1's compact index exists to avoid. The shape that actually works — validated repeatedly, including deliberately-hard adversarial tests — is broad-and-cheap first, narrow-and-expensive only where it's earned:

**Stage 1 — flag** (`flagCorrelationCandidates`): scans the *entire* Tier 1 index for the range in one call, and proposes candidate correlations — a hypothesis, a date window, involved categories, a confidence level, and (critically) **verbatim excerpts** from the real index backing the claim. Every excerpt is mechanically checked against the actual index data before anything downstream sees it — not just trusted because the schema asked for it. A candidate with zero verifiable excerpts gets dropped entirely. This is a hard, non-negotiable check: LLM tool-call output is schema-*shaped*, not schema-*guaranteed* — malformed or fabricated content has been observed in real testing, not just theorized.

**Stage 2 — confirm** (`confirmCandidate`): for each surviving candidate, pulls the actual raw entry text for just its flagged dates (±2 days padding) — never the full range — and asks Claude to confirm, refine, or discard the hypothesis against real prose, pulling verbatim quotes as evidence. Same mechanical verification: every quote is checked as an exact substring of the real text it claims to be from. If *every* quote a candidate offers turns out fabricated, the whole candidate is quarantined — its prose isn't trusted just because some of its quotes might have been real.

**Stage 3 — synthesize** (`synthesizeTrendAnswer`): takes whatever survived, sorted strongest-evidence-first (not in whatever order Stage 1 happened to return), and writes the final answer. Three hard requirements baked into the prompt: (1) every claim hedged — "could be related to," never "caused" — (2) staggered timing between candidates (one leading, others trailing, or a *different* episode showing a *different* order) made explicit rather than smoothed into one uniform story, and (3) closes with something concrete and actionable — a specific thing to watch for, a specific question to raise with someone — never vague ("worth keeping an eye on") and never directive ("you should stop X").

```
analyzeTrend(userId, question, range)
  → buildInsightTimeline               (Tier 1: broad, cheap, cross-category)
  → flagCorrelationCandidates          (Stage 1: propose + self-verify)
  → getRawEntryText (flagged dates only, deduped across all candidates)
  → confirmCandidate × N               (Stage 2: confirm + self-verify, in parallel)
  → synthesizeTrendAnswer              (Stage 3: hedged, ranked, actionable)
```

---

## 8. The tool-calling router — how chat decides simple vs. deep

[`tool-loop.ts`](src/server/ai/tool-loop.ts) is a generic Claude tool-use loop — it has no idea what tools exist, it just calls the model, executes whatever tool it asks for, feeds the result back, and repeats (capped at 4 rounds, a hard bound on runaway cost) until a final text answer comes back.

`answerQuestion` gives the model exactly one extra tool on top of its default flat-context answer: `analyze_trend`, whose handler is a two-line wrapper around `analyzeTrend`. The model decides for itself, per question, whether to use it — a simple lookup or a vague check-in ("how am I doing?") gets answered directly from context with no tool call at all, zero extra latency over the old behavior; a genuine trend question ("how has my sleep been the last few months") triggers the tool.

This design is deliberately layered so a future upgrade — giving the model direct tool access to `get_timeline`/`get_raw_entry_text` instead of one atomic `analyze_trend` tool — would mean adding new tool definitions to this same loop, not rewriting it. The loop mechanism itself is already agnostic to what's registered.

---

## 9. Traceability — locating a bad answer

Every `analyzeTrend` call gets a short random trace ID, and every log line at every stage — Tier 1's fetch, Stage 1's flagging, Stage 2's confirmation, Stage 3's synthesis — carries it, along with the actual `entries.id`/`insights.id` involved. Given a trace ID from server logs, the full chain (which database rows fed the answer, what got flagged, what got confirmed or discarded, what got mechanically rejected as unverified) can be reconstructed without re-running anything.

**What this doesn't do yet:** attach that trace ID to a stored chat message, so a future "flag this answer as wrong" button could jump straight to its trace. Chat has no persistence at all right now — conversations are client-side state, lost on refresh — so there's nothing to attach a trace ID to. Wiring that through is a small, natural next step once chat persistence exists; building it earlier would mean plumbing a return value with no actual consumer.

---

## 10. Explicitly not built yet

- **Scheduling/caching** — Tier 1/Tier 2 run fully on-demand, every time. A closed week is provably immutable (no edits after save), so precomputing and caching is safe whenever it's needed — just not built, since on-demand hasn't shown a latency/cost problem yet.
- **Chat persistence** — conversations live only in browser state. On hold by product decision, not scheduled.
- **Data export** — `/settings` has a disabled placeholder button for it; the actual decrypt-and-download logic isn't built yet.
- **CI** — no automated typecheck/lint/build gate on PRs yet.

Since built: account deletion with a user-facing danger-zone confirm at `/settings` (the cascade-delete foundation this section used to just call "already correct" is now actually exercised by it), a batch-backfill capture flow at `/capture/batch` for catching up on several days in one sitting, and the first prod deployment of this whole arc (Vercel, auto-deploying off `main`; verified end to end live — sign-up, consent gate, dashboard, and chat including a real `analyze_trend` tool call).

---

## 11. How this was actually verified

Not just unit tests — every stage of this was tested against full, realistic synthetic datasets (seeded through the real encrypted pipeline, torn down after) run through the real production code, because the interesting failure modes here are specific to LLM behavior at scale, not classic logic bugs. A few of the concrete things this process actually caught, worth knowing about because they shaped the design:

- **Fabrication is real, not hypothetical.** Early testing found the model occasionally inventing a plausible-sounding quote rather than admitting the raw text was thin — which is why every quote and excerpt at every stage is mechanically checked against the real source text, not trusted because it came from a forced tool call.
- **Richer, more realistic data uses more tokens than short synthetic phrases do.** A token budget tuned against simple test data silently truncated on real, more naturally-varied content — now every stage logs its actual token usage and flags when it hits the cap, so this fails loudly instead of silently.
- **Verbatim-matching against structured data needs to account for real formatting quirks.** Real insight labels are sometimes compound ("Goal: Marlowe project," a literal existing convention), and a citation that includes its label is just as grounded as one that doesn't — the verification logic accepts either, rather than rejecting an honest citation over an ambiguity in the instructions.

The takeaway that matters for trusting this going forward: the mechanism has been tested broadly (simple correlations, red herrings, multi-hop chains, null/no-correlation data, two separate episodes with opposite causal direction, ~900-insight datasets), but every test has been on synthetic data with known ground truth. That proves the mechanism works as designed — it does not prove how it behaves on the full messiness of real, months-of-real-life journal entries, which only real usage can actually surface. The trace-ID logging in §8 exists specifically because of that gap.
