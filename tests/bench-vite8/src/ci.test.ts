import puppeteer from "puppeteer";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createServer } from "node:net";
import { launchAndTest, type LaunchAndTestCleanupFunction } from "kill-em-all";

const TEST_PORT = 3008;
const TEST_HOST = `http://localhost:${TEST_PORT}`;

// Starting the server and waiting for it to respond can take close to vitest's
// default 10 s hook timeout on Windows CI runners. LAUNCH_TIMEOUT is shorter
// than HOOK_TIMEOUT so that launchAndTest gives up first and kills the server
// it spawned, instead of the hook timing out and leaving it running.
const LAUNCH_TIMEOUT = 45_000;
const HOOK_TIMEOUT = 60_000;

// Fails if something is already listening on the test port. Without this, a
// leftover server from an earlier case would answer the readiness check and
// the page load, and the test would pass without testing the right server.
function assertPortIsFree(port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", (error) => {
			reject(new Error(`Port ${port} is not free`, { cause: error }));
		});
		server.listen(port, "localhost", () => {
			server.close(() => resolve());
		});
	});
}

const browser = await puppeteer.launch({
	headless: true,
	// In CI we skip puppeteer's chrome download (see ci.yml) and use the
	// runner's pre-installed Chrome.
	...(process.env.CI ? { channel: "chrome" as const } : {}),
	defaultViewport: { width: 1200, height: 800 },
});

const pages = await browser.pages();
const page = pages[0]!;

interface TestCase {
	name: string;
	command: string;
}

const testCases: TestCase[] = [
	{
		name: "Client with vite build",
		command: `vite build --config vite.config.client.ts && vite preview --config vite.config.client.ts --port ${TEST_PORT} --strictPort`,
	},
	{
		name: "Client with vite dev",
		command: `vite dev --config vite.config.client.ts --port ${TEST_PORT} --strictPort`,
	},
];

describe.each(testCases)("$name", ({ name, command }) => {
	let kill: LaunchAndTestCleanupFunction | undefined;

	beforeAll(async () => {
		await assertPortIsFree(TEST_PORT);
		kill = await launchAndTest(command, TEST_HOST, LAUNCH_TIMEOUT);
	}, HOOK_TIMEOUT);

	afterAll(async () => {
		await kill?.();
	});

	it("should load the page and run the tests", async () => {
		await page.goto(TEST_HOST);
		// Wait for the "All imports are correct!" message to appear in the document
		await page.waitForFunction(
			() =>
				document.body.textContent?.includes("All imports are correct!") ||
				false,
		);
		const content = await page.evaluate(() => document.body.textContent);
		expect(content).toContain("All imports are correct!");
	});
});

afterAll(async () => {
	await browser.close();
});
