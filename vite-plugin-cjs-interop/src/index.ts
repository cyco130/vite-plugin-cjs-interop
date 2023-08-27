import type { Plugin } from "vite";
import { Parser } from "acorn";
import MagicString from "magic-string";
import { minimatch } from "minimatch";

const walker = import("estree-walker");

export interface CjsInteropOptions {
	/**
	 * List of CJS dependencies that require interoperability fixes.
	 * Deep imports (`package/import`) should be specified separately but
	 * globs (`package/*`) are supported.
	 */
	dependencies: string[];
	/**
	 * Whether to run the plugin for client builds. Normally it's only needed for SSR builds
	 * but it can be sometimes useful to run it for library mode builds.
	 *
	 * @default false
	 */
	client?: boolean;
	/**
	 * When to run the plugin. Normally it's only needed for SSR builds.
	 *
	 * @default "build"
	 */
	apply?: "build" | "serve" | "both";
}

export function cjsInterop(options: CjsInteropOptions): Plugin {
	const dependencies = Array.from(new Set(options.dependencies));
	const { client = false, apply = "build" } = options;

	let sourcemaps = false;
	const matchesDependencies = (value: string) => {
		return dependencies.some((dependency) => minimatch(value, dependency));
	};
	return {
		name: "cjs-interop",
		enforce: "post",
		apply: apply === "both" ? undefined : apply,

		configResolved(config) {
			sourcemaps = !!config.build.sourcemap;
		},

		async transform(code, id, options) {
			if (!client && !options?.ssr) return;

			const ast = Parser.parse(code, {
				sourceType: "module",
				ecmaVersion: "latest",
				locations: true,
				allowHashBang: true,
			});

			const toBeFixed: any[] = [];
			const preambles: string[] = [];

			const { walk } = await walker;

			walk(ast as any, {
				enter(node) {
					if (node.type === "ImportDeclaration") {
						if (matchesDependencies(node.source.value as string)) {
							toBeFixed.push(node);
						}
					}
				},
			});

			if (toBeFixed.length === 0) {
				return;
			}
			const bottomUpToBeFixed = toBeFixed.reverse();

			const ms = sourcemaps ? new MagicString(code) : null;
			let counter = 1;

			for (const node of bottomUpToBeFixed) {
				const destructurings: string[] = [];
				const name = `__cjsInterop${counter++}__`;
				let changed = false;

				for (const specifier of node.specifiers) {
					if (specifier.type === "ImportDefaultSpecifier") {
						changed = true;
						destructurings.push(
							`default: ${specifier.local.name} = ${name}`,
						);
					} else if (specifier.type === "ImportSpecifier") {
						changed = true;
						if (specifier.imported.name === specifier.local.name) {
							destructurings.push(specifier.local.name);
						} else {
							destructurings.push(
								`${specifier.imported.name}: ${specifier.local.name}`,
							);
						}
					}
				}

				if (!changed) {
					continue;
				}

				preambles.push(
					`const { ${destructurings.join(
						", ",
					)} } = ${name}?.default?.__esModule ? ${name}.default : ${name};`,
				);

				const replacement = `import ${name} from ${JSON.stringify(
					node.source.value,
				)};`;

				if (sourcemaps) {
					ms!.overwrite(node.start, node.end, replacement);
				} else {
					code =
						code.slice(0, node.start) +
						replacement +
						code.slice(node.end);
				}
			}

			const preamble = preambles.reverse().join("\n") + "\n";
			if (sourcemaps) {
				ms!.prepend(preamble);

				return {
					code: ms!.toString(),
					map: ms!.generateMap({ hires: true }),
				};
			} else {
				code = preamble + code;

				return {
					code,
				};
			}
		},
	};
}
