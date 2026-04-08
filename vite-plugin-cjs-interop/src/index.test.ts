import { test, expect } from "vitest";
import { cjsInterop } from ".";
import type {} from "vite";

async function callTransform(
	plugin: ReturnType<typeof cjsInterop>,
	code: string,
	id = "x.js",
): Promise<string> {
	const tr = plugin.transform;
	if (!tr) {
		return code;
	}

	if (typeof tr === "function") {
		throw new Error("Impossible");
	}

	const matches = (tr.filter!.code as RegExp[]).some((filter) =>
		filter.test(code),
	);

	if (!matches) {
		return code;
	}

	await (plugin.configResolved as any)?.call(
		{ meta: { viteVersion: "8.0.6" } },
		{
			build: {
				sourcemap: false,
			},
		} as any,
	);

	const result = await tr.handler.call(null as any, code, id, {
		ssr: true,
		moduleType: "js",
	});

	if (typeof result === "string") {
		return result;
	}

	if (typeof result?.code === "object") {
		return result.code.toString();
	}

	return result?.code ?? "";
}

test("transforms default import", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = await callTransform(plugin, INPUT, "x.js");
	expect(output).toBe(OUTPUT);
});

const INPUT = `import foo, { named, named2 as renamed } from "foo";`;

const OUTPUT = `const { default: foo = __cjsInterop1__, named, named2: renamed } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";`;

test("transforms multiple imports", async () => {
	const plugin = cjsInterop({ dependencies: ["foo", "bar"] });
	const output = await callTransform(plugin, MULTIPLE_INPUT, "x.js");
	expect(output).toBe(MULTIPLE_OUTPUT);
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

test("Will skip dependencies specified with a negative glob", async () => {
	const plugin = cjsInterop({ dependencies: ["!foo", "bar"] });

	const output = await callTransform(plugin, MULTIPLE_INPUT, "x.js");

	const EXPECTED_OUTPUT_WITHOUT_FOO = `const { default: bar = __cjsInterop1__, barNamed, barNamed2: barRenamed } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;

	import foo, { named, named2 as renamed } from "foo";
	import __cjsInterop1__ from "bar";
`;

	expect(output).toBe(EXPECTED_OUTPUT_WITHOUT_FOO);
});

test("transforms namespace import", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });
	const output = await callTransform(plugin, NAMESPACE_INPUT, "x.js");
	expect(output).toBe(NAMESPACE_OUTPUT);
});

const NAMESPACE_INPUT = `import * as foo from "foo";`;

const NAMESPACE_OUTPUT = `const foo = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";`;

test("supports globs in dependencies list", async () => {
	const plugin = cjsInterop({ dependencies: ["foo/*"] });
	const output = await callTransform(plugin, GLOB_INPUT, "x.js");
	expect(output).toBe(GLOB_OUTPUT);
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

	const output = await callTransform(plugin, DYNAMIC_INPUT, "x.js");

	expect(output).toBe(DYNAMIC_OUTPUT);
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

test("transforms re-export", async () => {
	const REEXPORT_INPUT = `export { namedX, named2 as renamedX, default } from "foo";`;

	const REEXPORT_OUTPUT = `const { namedX: __cjsInteropSpecifier1__, named2: __cjsInteropSpecifier2__ } = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;
import __cjsInterop1__ from "foo";
export { __cjsInteropSpecifier1__ as namedX, __cjsInteropSpecifier2__ as renamedX, __cjsInterop1__ as default} };`;

	const plugin = cjsInterop({ dependencies: ["foo"] });

	const output = await callTransform(plugin, REEXPORT_INPUT, "x.js");

	expect(output).toBe(REEXPORT_OUTPUT);
});

const CSS_INPUT = `:root{--mantine-font-family: Open Sans, sans-serif;`;

test("ignore css assets", async () => {
	const plugin = cjsInterop({ dependencies: ["foo"] });

	const output = await callTransform(plugin, CSS_INPUT, "x.css");

	expect(output).toBe(CSS_INPUT);
});

test("transforms multiple imports of the same package", async () => {
	const plugin = cjsInterop({ dependencies: ["foo", "bar"] });
	const output = await callTransform(
		plugin,
		MULTIPLE_SAME_PACKAGE_INPUT,
		"x.js",
	);
	expect(output).toBe(MULTIPLE_SAME_PACKAGE_OUTPUT);
});

const MULTIPLE_SAME_PACKAGE_INPUT = `
	import foo, { named, named2 as renamed } from "foo";
	import * as Foo from "foo";
`;

const MULTIPLE_SAME_PACKAGE_OUTPUT = `const { default: foo = __cjsInterop2__, named, named2: renamed } = __cjsInterop2__?.default?.__esModule ? __cjsInterop2__.default : __cjsInterop2__;
const Foo = __cjsInterop1__?.default?.__esModule ? __cjsInterop1__.default : __cjsInterop1__;

	import __cjsInterop2__ from "foo";
	import __cjsInterop1__ from "foo";
`;
