import { test, expect } from "vitest";
import { cjsInterop } from ".";

test("transforms default import", () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = (plugin.transform as any)!(INPUT, "x.js", { ssr: true });
	expect(output.code).toBe(OUTPUT);
});

const INPUT = `import foo, { named, named2 as renamed } from "foo";`;

const OUTPUT = `const { default: foo = __cjsInterop1__, named, named2: renamed } = __cjsInterop1__.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";`;
