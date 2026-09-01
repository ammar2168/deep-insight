import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import { userEncryptionKeys } from "@/server/db/schema";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
	if (!env.MASTER_ENCRYPTION_KEY) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"MASTER_ENCRYPTION_KEY isn't configured yet. Add it to your .env file to enable this.",
		});
	}
	const key = Buffer.from(env.MASTER_ENCRYPTION_KEY, "base64");
	if (key.length !== KEY_LENGTH) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes.",
		});
	}
	return key;
}

/**
 * AES-256-GCM encrypt under an arbitrary 32-byte key. Output is one opaque base64
 * string: iv || authTag || ciphertext. A fresh random IV every call — reusing an IV
 * with the same key breaks GCM's guarantees, so this never accepts a caller-supplied one.
 */
function encryptWithKey(key: Buffer, plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptWithKey. Throws if the auth tag doesn't match — tampered or corrupted input. */
function decryptWithKey(key: Buffer, encoded: string): string {
	const raw = Buffer.from(encoded, "base64");
	const iv = raw.subarray(0, IV_LENGTH);
	const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

/**
 * Fetches a user's data-encryption key (DEK), generating and storing one — wrapped
 * under the master key, never in plaintext — on first use. If two first-saves from
 * the same brand-new user race, the DB's own primary key conflict resolves it: exactly
 * one insert wins, and both callers re-read whichever row actually landed.
 */
async function getOrCreateUserDek(userId: string): Promise<Buffer> {
	const masterKey = getMasterKey();

	const existing = await db.query.userEncryptionKeys.findFirst({
		where: eq(userEncryptionKeys.userId, userId),
	});
	if (existing) {
		return Buffer.from(
			decryptWithKey(masterKey, existing.wrappedDek),
			"base64",
		);
	}

	const dek = randomBytes(KEY_LENGTH);
	await db
		.insert(userEncryptionKeys)
		.values({
			userId,
			wrappedDek: encryptWithKey(masterKey, dek.toString("base64")),
		})
		.onConflictDoNothing();

	const row = await db.query.userEncryptionKeys.findFirst({
		where: eq(userEncryptionKeys.userId, userId),
	});
	if (!row) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create an encryption key for this user",
		});
	}
	return Buffer.from(decryptWithKey(masterKey, row.wrappedDek), "base64");
}

/**
 * The only two functions anything outside this file should call. Callers pass a
 * userId and a string — nothing else here (DEKs, wrapping, IVs, GCM) is their concern,
 * and nothing here knows what "entries" or "insights" are. Swapping how or where the
 * master key is stored later never requires touching a caller.
 */
export async function encryptForUser(
	userId: string,
	plaintext: string,
): Promise<string> {
	const dek = await getOrCreateUserDek(userId);
	return encryptWithKey(dek, plaintext);
}

export async function decryptForUser(
	userId: string,
	ciphertext: string,
): Promise<string> {
	const dek = await getOrCreateUserDek(userId);
	return decryptWithKey(dek, ciphertext);
}

/**
 * Same as decryptForUser, but for many ciphertexts from the same user at once — the
 * DEK is fetched and unwrapped exactly once regardless of array length, instead of once
 * per item. Worth using anywhere decrypting more than a couple of values in a loop.
 */
export async function decryptManyForUser(
	userId: string,
	ciphertexts: string[],
): Promise<string[]> {
	if (ciphertexts.length === 0) return [];
	const dek = await getOrCreateUserDek(userId);
	return ciphertexts.map((ciphertext) => decryptWithKey(dek, ciphertext));
}
