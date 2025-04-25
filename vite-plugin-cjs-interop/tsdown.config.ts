import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["./src/index.ts"],
		format: ["esm", "cjs"],
		platform: "node",
		target: "node20",
		dts: true,
	},
]);
