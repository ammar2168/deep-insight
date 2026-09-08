import path from "node:path";
import { defineConfig } from "vitest/config";

const dirname = import.meta.dirname;

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(dirname, "./src"),
			// See vitest.setup/server-only-stub.ts for why.
			"server-only": path.resolve(dirname, "./vitest.setup/server-only-stub.ts"),
		},
	},
	test: {
		environment: "node",
		setupFiles: ["./vitest.setup/load-env.ts"],
	},
});
