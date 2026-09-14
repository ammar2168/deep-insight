import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export type Session = typeof authClient.$Infer.Session;

/**
 * Every change of who's signed in (sign-in, sign-up, sign-out, account
 * deletion) must end in a full page load, never a client-side navigation.
 * Everything the page holds in memory belongs to whoever was signed in, and a
 * soft navigation keeps all of it: React Query's cache above all, whose keys
 * aren't per-user (`insight.latest` is the same key for every account). That
 * is exactly how one person's insights flashed on screen for the next person
 * to sign in on the same browser, until the new account's own data arrived.
 * A full load throws the whole page away, so nothing from one account can
 * ever render for another.
 */
export function reloadIntoApp() {
	window.location.replace("/");
}

/**
 * Reloads even if the sign-out request itself fails: clearing the previous
 * account's data out of memory can't depend on a network call succeeding.
 */
export async function signOutAndReload() {
	try {
		await authClient.signOut();
	} finally {
		reloadIntoApp();
	}
}
