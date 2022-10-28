import { defineConfig } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";

export default defineConfig({
  build: {
    ssr: "src/index.js",
    sourcemap: true,
  },
  ssr: {
    external: ["cjs-test-package"],
  },
  plugins: [
    cjsInterop({
      dependencies: ["cjs-test-package"],
    }),
  ],
});
