import { test, expect } from "vitest";
import { cjsInterop } from ".";

test("transforms default import", () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = (plugin.transform as any)!(INPUT, "x.js", { ssr: true });
	expect(output.code).toBe(OUTPUT);
});

const INPUT = `import foo from "foo";`;

const OUTPUT = `const foo = __cjsInterop1__.default;
import __cjsInterop1__ from "foo";`;
