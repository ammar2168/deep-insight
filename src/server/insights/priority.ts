import type { INSIGHT_CATEGORIES } from "@/server/db/schema/insight";

type Category = (typeof INSIGHT_CATEGORIES)[number];

/**
 * Default category priority order — a product decision (mood and health matter most to see
 * first, "other" least), not a data-derived one. Swappable later for a per-user order once
 * the onboarding questionnaire exists (see BACKLOG.md): `rankInsights` takes the order as a
 * parameter for exactly that reason, so personalizing it later is a call-site change, not a
 * rewrite of the ranking logic itself.
 */
export const DEFAULT_CATEGORY_PRIORITY: readonly Category[] = [
	"mood",
	"health",
	"goal",
	"sleep",
	"relationships",
	"movement",
	"other",
];

type RankableInsight = {
	category: Category;
	createdAt: Date;
};

/**
 * Orders insights by category priority (earlier in `priorityOrder` = shown first), breaking
 * ties within the same category by most recent first. Pure function over an already-fetched
 * list — no DB/AI calls here, so it's cheap to call on every read and easy to test in
 * isolation.
 */
export function rankInsights<T extends RankableInsight>(
	insights: T[],
	priorityOrder: readonly Category[] = DEFAULT_CATEGORY_PRIORITY,
): T[] {
	const rankByCategory = new Map(
		priorityOrder.map((category, index) => [category, index]),
	);
	const fallbackRank = priorityOrder.length;

	return [...insights].sort((a, b) => {
		const rankA = rankByCategory.get(a.category) ?? fallbackRank;
		const rankB = rankByCategory.get(b.category) ?? fallbackRank;
		if (rankA !== rankB) return rankA - rankB;
		return b.createdAt.getTime() - a.createdAt.getTime();
	});
}
