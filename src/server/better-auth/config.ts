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
