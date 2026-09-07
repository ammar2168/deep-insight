import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
	return createTRPCContext({
		headers: req.headers,
	});
};

const handler = (req: NextRequest) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () => createContext(req),
		// Runs in every environment, not just dev — this is server-side only (Vercel's
		// own log stream), never reaches the client, and production erroring silently
		// with nothing in the logs but the generic masked message is worse than the
		// small amount of noise this adds.
		onError: ({ path, error }) => {
			console.error(
				`❌ tRPC failed on ${path ?? "<no-path>"}: [${error.code}] ${error.message}`,
			);
			// The client only sees error.data.zodError (flattened, via the
			// errorFormatter in trpc.ts) — logging it here too so a bad-input
			// failure's exact field and reason show up in the logs, not just
			// a generic message in the browser console.
			if (error.cause instanceof ZodError) {
				console.error("  zodError:", JSON.stringify(error.cause.flatten()));
			}
		},
	});

export { handler as GET, handler as POST };
