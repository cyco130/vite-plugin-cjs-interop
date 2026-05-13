import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const server = await createServer({
	configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
	server: { middlewareMode: true },
	appType: "custom",
});

try {
	await server.ssrLoadModule("/src/index.js");
	console.log("SSR dev OK");
} finally {
	await server.close();
}
