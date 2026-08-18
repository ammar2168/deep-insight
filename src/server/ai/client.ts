import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";

import { env } from "@/env";

export const MODEL = "claude-sonnet-5";

export function getClient() {
	if (!env.ANTHROPIC_API_KEY) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"ANTHROPIC_API_KEY isn't configured yet. Add it to your .env file to enable this.",
		});
	}
	return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}
