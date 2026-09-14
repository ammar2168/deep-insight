#!/usr/bin/env node
// Mints one new single-use access code and prints it — copy it and send it
// to the one person it's for, personally (text, email, whatever). It works
// for whichever account redeems it first, and never again after that, no
// matter how many other people might also have the string.
//
// Runs against local dev by default (reads DATABASE_URL from .env). A code
// only works in the database it was minted in, so for a real beta user, pass
// prod's connection string, copied from Neon's own dashboard (Vercel's copy is
// marked Sensitive and can never be pulled back down). A DATABASE_URL given on
// the command line wins over the one in .env:
//   DATABASE_URL='<connection string from Neon>' node scripts/generate-access-code.mjs
import postgres from "postgres";

try {
	process.loadEnvFile();
} catch {}

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL isn't set — nothing to connect to.");
	process.exit(1);
}

// Avoids visually ambiguous characters (0/O, 1/I/l) — this gets read off a
// text message and typed back in by hand, not copy-pasted through a link.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 10;

function generateCode() {
	const bytes = new Uint8Array(CODE_LENGTH);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const sql = postgres(process.env.DATABASE_URL);

try {
	const code = generateCode();
	// created_at's default is applied by Drizzle at the query-builder level, not
	// the database schema itself — this raw insert has to set it explicitly.
	await sql`INSERT INTO access_code (code, created_at) VALUES (${code}, now())`;
	console.log(`\nNew access code: ${code}`);
	// Host only, never credentials: enough to tell dev from prod at a glance
	// before sending a code to someone it would silently fail for.
	console.log(`Minted in: ${new URL(process.env.DATABASE_URL).hostname}\n`);
	console.log("Single-use — good for whoever redeems it first, then dead.");
} finally {
	await sql.end();
}
