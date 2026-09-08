import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/env";
import { db } from "@/server/db";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg", // or "pg" or "mysql"
	}),
	emailAndPassword: {
		enabled: true,
	},
	// Email/password exists as an alternative door to the same person, not a
	// separate identity system — someone who signs up with password and later
	// hits "Sign in with GitHub" using the same address should land in one
	// account, not get rejected. The default (requireLocalEmailVerified: true)
	// blocks that, since this app has no email verification step for the
	// password account to have satisfied. Safe to relax for a small,
	// personally-invited beta; revisit if signup ever opens up publicly.
	account: {
		accountLinking: {
			requireLocalEmailVerified: false,
		},
	},
	socialProviders: {
		github: {
			clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
			clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
			redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/github`,
		},
	},
	// Must stay last: lets server actions (like the sign-in button) write
	// auth cookies (session, OAuth state) to the response via next/headers.
	plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
