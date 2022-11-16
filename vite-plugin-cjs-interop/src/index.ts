import type { Plugin } from "vite";
import { Parser } from "acorn";
import MagicString from "magic-string";
import minimatch from "minimatch";

const walker = import("estree-walker");

export interface CjsInteropOptions {
	dependencies: string[];
}

export function cjsInterop(options: CjsInteropOptions): Plugin {
	const dependencies = Array.from(new Set(options.dependencies));
	let sourcemaps = false;
	const matchesDependencies = (value: string) => {
		return dependencies.some((dependency) => minimatch(value, dependency));
	};
	return {
		name: "cjs-interop",
		enforce: "post",
		apply: "build",

		configResolved(config) {
			sourcemaps = !!config.build.sourcemap;
		},

		async transform(code, id, options) {
			if (!options?.ssr) return;

			const ast = Parser.parse(code, {
				sourceType: "module",
				ecmaVersion: "latest",
				locations: true,
				allowHashBang: true,
			});

			const toBeFixed: any[] = [];
			const preambles: string[] = [];

			const { walk } = await walker;

			walk(ast, {
				enter(node) {
					if (node.type === "ImportDeclaration") {
						if (matchesDependencies(node.source.value)) {
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
