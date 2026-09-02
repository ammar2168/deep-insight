import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { env } from "@/env";
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
		onError:
			env.NODE_ENV === "development"
				? ({ path, error }) => {
						console.error(
							`❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
						);
						// The client only sees error.data.zodError (flattened, via the
						// errorFormatter in trpc.ts) — logging it here too so a bad-input
						// failure's exact field and reason show up in the terminal, not just
						// a generic message in the browser console.
						if (error.cause instanceof ZodError) {
							console.error(
								"  zodError:",
								JSON.stringify(error.cause.flatten()),
							);
						}
					}
				: undefined,
	});

export { handler as GET, handler as POST };
