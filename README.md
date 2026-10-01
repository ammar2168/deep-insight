# Deep Insight

Photograph a page of your handwritten journal. Get back what it says about your mood, sleep, health and goals — and the ability to ask how those have changed over months.

Live in private beta at [deep-insight-six.vercel.app](https://deep-insight-six.vercel.app) (invite only).

## The actual problem

OCR is the easy part. The hard part is that every interesting feature here depends on a language model making claims about someone's life, and a model will produce a confident, well-formed, completely invented claim as readily as a true one. A journal is the worst possible place for that: the user cannot easily tell a fabricated pattern from a real one, because the subject is themselves.

So the rule throughout is that **the model proposes and code verifies**. Nothing a model says about a user's history reaches them unless it can be mechanically traced back to text the user actually wrote.

## How it works

```
photo ──► OCR (vision) ──► entry text ──► insights ──► encrypted at rest
                │                            │
         dateline found on                one row per signal
         the page itself              (mood / sleep / movement /
                                   relationships / goal / health)

question ──► router ──► simple answer from recent insights
                   └──► analyze_trend ──► Tier 1 index ──► flag ──► confirm ──► synthesize
```

**Tier 1** builds a compact index of every insight in a date range — all categories, not just the one asked about, because the explanation for a sleep change is usually in a health or goal entry with no topical connection to sleep. Deliberately not embeddings: semantic similarity misses exactly that link.

**Tier 2** runs three model calls — propose candidate correlations, confirm the survivors against the raw entry text for just those days, then synthesize. Every quoted excerpt at both stages is checked as a literal substring of the real source before anything downstream sees it. A candidate whose quotes can't be verified is dropped, not softened.

## Decisions worth defending

- **Per-user envelope encryption.** Entry text and insights are AES-256-GCM encrypted with a per-user data key, itself wrapped by a master key. One user's rows can't be read with another's key.
- **Authorisation is layered in the API, not the UI.** tRPC procedures compose `public → protected → accessGranted → trialActive → consented`, so every data-touching call is refused before any model call is made. The page-level gates are a second line, not the only one.
- **Consent is an audit record.** The `user_consent` table deliberately has no foreign key to `user`, so proof that consent existed survives account deletion, which cascades everything else away.
- **A page is never lost to a downstream failure.** Insight extraction is isolated from saving: if the model fails, the entry still saves with no insights. An earlier version shared one try/catch and discarded 48 successfully-read pages.
- **A page's date comes from the page.** Filenames are consulted second and camera-generated names (`IMG_`, `PXL_`, `Screenshot`, …) are ignored entirely — they record when the photo was taken, which for a backfilled journal is always today. See [`src/lib/entry-date.ts`](src/lib/entry-date.ts).
- **Latest means most recently written, not most recently uploaded.** Backfilling last week's page must not displace today's entry.
- **Crisis language is checked before usage limits.** A deterministic phrase filter first (instant, free, doesn't depend on the model behaving), then a model classification. Safety outranks cost control, and the code says so.
- **Cost has hard structural bounds.** The tool loop is capped at 4 rounds, chat at 3 questions a day (5 with a code), capture at 50 pages a batch.

More detail in [ARCHITECTURE.md](ARCHITECTURE.md); incidents and what they changed in [POSTMORTEMS.md](POSTMORTEMS.md).

## Stack

TypeScript · Next.js 15 (App Router) · React 19 · tRPC v11 · Drizzle ORM · PostgreSQL (Neon) · Better Auth · Tailwind CSS v4 · Claude (Anthropic SDK) · Vitest · Biome · Vercel · GitHub Actions

## Running it

```bash
pnpm install
cp .env.example .env     # fill in the values below
pnpm db:migrate
pnpm dev
```

`.env` needs a Postgres URL, a Better Auth secret and GitHub OAuth credentials, an Anthropic API key, and a master encryption key:

```bash
openssl rand -base64 32   # MASTER_ENCRYPTION_KEY
```

`./start-database.sh` will run a local Postgres in Docker if you'd rather not use a hosted one.

## Tests

```bash
pnpm test        # unit + integration, needs a database
pnpm typecheck
pnpm check       # biome
```

Integration tests run against a real Postgres rather than mocks, because the things worth testing here — the consent gate, the access gate, envelope encryption round-tripping, which entry counts as "latest" — are only meaningful against real rows. CI runs every migration from scratch, the full suite, and a production build on each pull request.

## Not built yet, on purpose

- Chat has no persistence; conversations live in browser state.
- No data export (deletion is available, in Settings).
- Tier 1 and Tier 2 run on demand every time; a closed week is provably immutable, so caching is safe whenever it's worth doing.
- Insight ranking on the home screen is category priority, not relevance.
