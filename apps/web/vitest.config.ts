import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		testTimeout: 15_000,
		setupFiles: ["./test/setup.ts"],
		include: [
			"app/**/*.test.ts",
			"app/**/*.test.tsx",
			"components/**/*.test.ts",
			"components/**/*.test.tsx",
			"lib/**/*.test.ts",
			"lib/**/*.test.tsx",
		],
	},
	resolve: {
		alias: {
			"@": path.resolve(root, "."),
			"server-only": path.resolve(root, "test/server-only-mock.ts"),
		},
	},
});
