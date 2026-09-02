import { chatRouter } from "@/server/api/routers/chat";
import { entryRouter } from "@/server/api/routers/entry";
import { insightRouter } from "@/server/api/routers/insight";
import { settingsRouter } from "@/server/api/routers/settings";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	entry: entryRouter,
	insight: insightRouter,
	chat: chatRouter,
	settings: settingsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.entry.list();
 */
export const createCaller = createCallerFactory(appRouter);
