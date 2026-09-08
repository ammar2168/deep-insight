// Stands in for the "server-only" package during tests. That package's real
// job is to throw when imported from a Client Component — a Next.js
// build-time distinction that doesn't exist under plain Vitest, where
// everything under test is already known to be server-side code.
export {};
