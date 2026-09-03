import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { userConsent } from "@/server/db/schema";

/**
 * Bump this whenever the terms actually change — a user who accepted an
 * older version no longer counts as consented and is asked again. Kept as a
 * plain date string so the history of what changed when is self-evident
 * without cross-referencing anything else.
 */
export const CURRENT_TERMS_VERSION = "2026-09-03";

export async function hasCurrentConsent(userId: string): Promise<boolean> {
	const row = await db.query.userConsent.findFirst({
		where: and(
			eq(userConsent.userId, userId),
			eq(userConsent.termsVersion, CURRENT_TERMS_VERSION),
		),
	});
	return row !== undefined;
}
