import puppeteer from "puppeteer";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { launchAndTest, type LaunchAndTestCleanupFunction } from "kill-em-all";

const TEST_PORT = 3000;
const TEST_HOST = `http://localhost:${TEST_PORT}`;

const browser = await puppeteer.launch({
	headless: true,
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

describe.sequential.each(testCases)("$name", ({ name, command }) => {
	let kill: LaunchAndTestCleanupFunction | undefined;

	beforeAll(async () => {
		await kill?.();
		kill = await launchAndTest(command, TEST_HOST);
	});

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
