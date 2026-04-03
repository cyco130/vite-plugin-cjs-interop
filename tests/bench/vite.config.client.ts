import { defineConfig } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";

console.log("Client version");

export default defineConfig({
	build: {
		sourcemap: true,
	},
	plugins: [
		cjsInterop({
			trustViteWithHoisting: false,
			client: true,
			dependencies: [
				"cjs-test-package",
				"cjs-test-package/wrapped.cjs",
				"cjs-test-package/synthetic.cjs",
			],
		}),
	],
});
