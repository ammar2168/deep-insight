/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { hasAccessGranted, isTrialExpired } from "@/server/access";
import { auth } from "@/server/better-auth";
import { hasCurrentConsent } from "@/server/consent";
import { db } from "@/server/db";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
	const session = await auth.api.getSession({
		headers: opts.headers,
	});
	return {
		db,
		session,
		...opts,
	};
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const GENERIC_SERVER_ERROR_MESSAGE =
	"Something went wrong on our end. Try again?";

const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		const zodError =
			error.cause instanceof ZodError ? error.cause.flatten() : null;

		// Every procedure's own deliberate `throw new TRPCError(...)` sets no cause —
		// only tRPC's own wrapping of a genuinely unexpected thrown value (a library
		// internal, a DB hiccup) does, and it defaults that error's message onto this
		// one verbatim. Without this check, whatever that library happened to say
		// (Better Auth's "Failed to get session" is a real example this caught) goes
		// straight to the user instead of a message anyone actually wrote for them.
		const isUnexpectedInternalError =
			error.code === "INTERNAL_SERVER_ERROR" &&
			error.cause != null &&
			!zodError;

		return {
			...shape,
			message: isUnexpectedInternalError
				? GENERIC_SERVER_ERROR_MESSAGE
				: shape.message,
			data: {
				...shape.data,
				zodError,
			},
		};
	},
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();

	if (t._config.isDev) {
		// artificial delay in dev
		const waitMs = Math.floor(Math.random() * 400) + 100;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	const result = await next();

	const end = Date.now();
	console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

	return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
	.use(timingMiddleware)
	.use(({ ctx, next }) => {
		if (!ctx.session?.user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}
		return next({
			ctx: {
				// infers the `session` as non-nullable
				session: { ...ctx.session, user: ctx.session.user },
			},
		});
	});

/**
 * Trial-active procedure
 *
 * One layer below consentedProcedure: blocks a signed-in user whose free
 * trial (src/server/access.ts, TRIAL_LENGTH_DAYS from account creation) has
 * ended, regardless of consent status — an expired account can't proceed
 * either way, so this is checked first. settings.deleteAccount deliberately
 * skips this too, same reasoning as skipping consent: leaving never depends
 * on trial status.
 *
 * code: "FORBIDDEN" with this exact message is what the client watches for to
 * show the trial-ended screen instead of a generic error.
 */
/**
 * Access-granted procedure
 *
 * The beta's hard gate, and the first thing checked after authentication:
 * every account has to be explicitly let in (by redeeming a code, or by
 * predating the gate) before any other question — trial, consent, data —
 * is even worth asking. settings.deleteAccount and settings.redeemCode
 * deliberately stay on plain protectedProcedure: you must be able to enter
 * the code that lets you in without already being in, and leaving is never
 * gated on being allowed to stay.
 *
 * code: "FORBIDDEN" with this exact message is what the client watches for
 * to show the access-code screen instead of a generic error.
 */
export const ACCESS_REQUIRED_MESSAGE = "ACCESS_REQUIRED";

const accessGrantedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!(await hasAccessGranted(ctx.session.user.id))) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: ACCESS_REQUIRED_MESSAGE,
		});
	}
	return next();
});

export const TRIAL_EXPIRED_MESSAGE = "TRIAL_EXPIRED";

const trialActiveProcedure = accessGrantedProcedure.use(({ ctx, next }) => {
	if (isTrialExpired(ctx.session.user.createdAt)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: TRIAL_EXPIRED_MESSAGE,
		});
	}
	return next();
});

/**
 * Consented procedure
 *
 * Everything that actually touches a user's data (capture, chat, reading
 * insights) should use this instead of protectedProcedure directly — it adds
 * one more check on top: that the signed-in user has accepted the current
 * terms. `consent.accept`/`consent.status` and `settings.deleteAccount`
 * deliberately stay on plain protectedProcedure — you must be able to see
 * what you're agreeing to before agreeing to it, and delete your account
 * regardless of consent status, not be blocked from leaving by a terms gate.
 *
 * code: "FORBIDDEN" with this exact message is what the client watches for to
 * redirect to the consent screen instead of showing a generic error.
 */
export const CONSENT_REQUIRED_MESSAGE = "CONSENT_REQUIRED";

export const consentedProcedure = trialActiveProcedure.use(
	async ({ ctx, next }) => {
		if (!(await hasCurrentConsent(ctx.session.user.id))) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: CONSENT_REQUIRED_MESSAGE,
			});
		}
		return next();
	},
);
