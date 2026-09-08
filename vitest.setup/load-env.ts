// Next.js loads .env automatically; plain Vitest doesn't. Only relevant for
// local runs — CI sets real env vars directly and has no .env file at all,
// so a missing file here is expected, not an error.
try {
	process.loadEnvFile();
} catch {}
