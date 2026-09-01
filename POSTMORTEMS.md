# Postmortems

Short write-ups of incidents worth remembering, so the same mistake doesn't cost another round-trip next time.

## 2026-08-31 — Chat/insights failing with "API key is invalid"

**Symptom:** Chat and insight extraction started failing with a 401 from Anthropic (`"API key is invalid"`), with no code change to explain it.

**Root causes — three, compounding, not one:**
1. The original `ANTHROPIC_API_KEY` genuinely stopped being accepted by Anthropic. Confirmed by calling the API directly with the SDK, completely bypassing the app. Cause unknown — rotated, revoked, or a billing/credits issue on the Anthropic account side; not diagnosable from this codebase.
2. The first fix attempt didn't work because the new key was regenerated in the Anthropic Console but never actually made it into this project's `.env` — regenerating a key there doesn't propagate anywhere automatically, it has to be manually copied in.
3. After the correct value finally landed in `.env`, the bug *still* reproduced, because a `next-server` dev process had been running since earlier in the session and was still serving the old key from memory — Next.js reads `.env` once at process startup, not live. The fix required killing that process and starting a fresh one.

**Fix:** Put the real new key in `.env`, verify it directly against Anthropic's API (independent of the app) before trusting it, then kill and restart the dev server so the new value actually gets loaded.

**Lesson:** When an env var change doesn't seem to take effect, check for a stale long-running dev server process before assuming the file edit itself was wrong. And verify a credential directly against the provider's API rather than trusting "I changed it" — check what's actually in the file the app reads, and test it independently of the app.
