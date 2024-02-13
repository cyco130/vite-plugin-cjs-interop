import { test, expect } from "vitest";
import { cjsInterop } from ".";

test("transforms default import", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = await (plugin.transform as any)!(INPUT, "x.js", {
		ssr: true,
	});
	expect(output.code).toBe(OUTPUT);
});

const INPUT = `import foo, { named, named2 as renamed } from "foo";`;

const OUTPUT = `const { default: foo = __cjsInterop1__, named, named2: renamed } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";`;

test("transforms multiple imports", async () => {
	const plugin = cjsInterop({ dependencies: ["foo", "bar"] });
	const output = await (plugin.transform as any)!(MULTIPLE_INPUT, "x.js", {
		ssr: true,
	});
	expect(output.code).toBe(MULTIPLE_OUTPUT);
});

const MULTIPLE_INPUT = `
	import foo, { named, named2 as renamed } from "foo";
	import bar, { barNamed, barNamed2 as barRenamed } from "bar";
`;

const MULTIPLE_OUTPUT = `const { default: foo = __cjsInterop2__, named, named2: renamed } = __cjsInterop2__?.default?.__esModule ? __cjsInterop2__.default : __cjsInterop2__;
const { default: bar = __cjsInterop1__, barNamed, barNamed2: barRenamed } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;

	import __cjsInterop2__ from "foo";
	import __cjsInterop1__ from "bar";
`;

test("transforms namespace import", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = await (plugin.transform as any)!(NAMESPACE_INPUT, "x.js", {
		ssr: true,
	});
	expect(output.code).toBe(NAMESPACE_OUTPUT);
});

const NAMESPACE_INPUT = `import * as foo from "foo";`;

const NAMESPACE_OUTPUT = `const foo = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";`;

test("supports globs in dependencies list", async () => {
	const plugin = cjsInterop({ dependencies: ["foo/*"] });
	const output = await (plugin.transform as any)!(GLOB_INPUT, "x.js", {
		ssr: true,
	});
	expect(output.code).toBe(GLOB_OUTPUT);
});

const GLOB_INPUT = `
	import fooX, { namedX, named2 as renamedX } from "foo/x";
	import fooY, { namedY, named2 as renamedY } from "foo/y";
`;

const GLOB_OUTPUT = `const { default: fooX = __cjsInterop2__, namedX, named2: renamedX } = __cjsInterop2__?.default?.__esModule ? __cjsInterop2__.default : __cjsInterop2__;
const { default: fooY = __cjsInterop1__, namedY, named2: renamedY } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;

	import __cjsInterop2__ from "foo/x";
	import __cjsInterop1__ from "foo/y";
`;

test("supports dynamic imports", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });

	const output = await (plugin.transform as any)!(DYNAMIC_INPUT, "x.js", {
		ssr: true,
	});

	expect(output.code).toBe(DYNAMIC_OUTPUT);
});

const DYNAMIC_INPUT = `
	const importPromise = import("foo").then(({ default: barDefault, barNamed }) => {
		// Use barDefault and barNamed here
	});
`;

const DYNAMIC_OUTPUT = `
import { __cjs_dyn_import__ } from "virtual:cjs-dyn-import";

	const importPromise = import("foo").then(__cjs_dyn_import__).then(({ default: barDefault, barNamed }) => {
		// Use barDefault and barNamed here
	});
`;

const CSS_INPUT = `:root{--mantine-font-family: Open Sans, sans-serif;`;

test("ignore css assets", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });

	const output = await (plugin.transform as any)!(CSS_INPUT, "x.css", {
		ssr: true,
	});

	expect(output).toBeUndefined();
});
