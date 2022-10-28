import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/index.js",
  },
  ssr: {
    external: ["cjs-test-package"],
  },
});
