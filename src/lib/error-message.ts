import { isTRPCClientError } from "@trpc/client";

/**
 * A real tRPC error's message is already safe to show — the server's own
 * errorFormatter (src/server/api/trpc.ts) masks anything unexpected before it
 * ever reaches the client. Anything that ISN'T a tRPC error (a network
 * failure, a non-JSON response from a platform-level rejection like a request
 * body size limit, some other raw exception) hasn't been through that
 * masking, so its message is never shown — always the fallback instead.
 */
export function errorMessage(err: unknown, fallback: string): string {
	if (isTRPCClientError(err) && err.message) return err.message;
	return fallback;
}
