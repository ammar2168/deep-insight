import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "@/server/api/root";
import { createCallerFactory, type createTRPCContext } from "@/server/api/trpc";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * Bypasses real Better Auth session lookup entirely — that's Better Auth's own
 * well-tested concern, not what this test is checking. Only `ctx.session.user.id`
 * is ever actually read by anything under test, so everything else here is a
 * structurally-plausible stand-in, not a faithful reproduction of Better Auth's
 * real session shape.
 */
function contextFor(userId: string): Context {
	const now = new Date();
	return {
		db,
		headers: new Headers(),
		session: {
			user: {
				id: userId,
				name: "Integration Test",
				email: `${userId}@test.local`,
				emailVerified: false,
				image: null,
				createdAt: now,
				updatedAt: now,
			},
			session: {
				id: randomUUID(),
				token: randomUUID(),
				userId,
				expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
				createdAt: now,
				updatedAt: now,
				ipAddress: null,
				userAgent: null,
			},
		},
	} as unknown as Context;
}

const createCaller = createCallerFactory(appRouter);

describe("consent gate + envelope encryption, against a real database", () => {
	const userId = `integration-test-${randomUUID()}`;
	const caller = createCaller(contextFor(userId));

	beforeAll(async () => {
		// user_encryption_key and entries both have a real FK to user.id — the
		// fake session above only fakes the tRPC context, not an actual row, so
		// one has to exist before anything past the consent check will work.
		await db.insert(user).values({
			id: userId,
			name: "Integration Test",
			email: `${userId}@test.local`,
		});
	});

	afterAll(async () => {
		// Deletes the user row outright — every other user-scoped table (session,
		// entries, insights, user_encryption_key) cascades away with it. Also
		// doubles as a real exercise of the account-deletion path itself.
		await caller.settings.deleteAccount().catch(() => {});
	});

	it("rejects data access before consent", async () => {
		await expect(caller.entry.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("allows access after consent, and returns exactly what was saved, decrypted", async () => {
		await caller.consent.accept();

		const plaintext = `Integration test entry ${randomUUID()} — round-trip check.`;
		const saved = await caller.entry.save({
			text: plaintext,
			entryDate: new Date().toISOString().slice(0, 10),
			insights: [],
		});
		expect(saved.entryId).toBeGreaterThan(0);

		const rows = await caller.entry.list();
		const savedEntry = rows.find((r) => r.id === saved.entryId);
		expect(savedEntry?.text).toBe(plaintext);
	});
});
