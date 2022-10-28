import type { Plugin } from "vite";
import { Parser } from "acorn";
import { walk } from "estree-walker";
import MagicString from "magic-string";

export interface CjsInteropOptions {
	dependencies: string[];
}

export function cjsInterop(options: CjsInteropOptions): Plugin {
	const dependencies = new Set(options.dependencies);
	let sourcemaps = false;

	return {
		name: "cjs-interop",
		enforce: "post",

		configResolved(config) {
			sourcemaps = !!config.build.sourcemap;
		},

		transform(code, id, options) {
			if (!options?.ssr) return;

			const ast = Parser.parse(code, {
				sourceType: "module",
				ecmaVersion: "latest",
				locations: true,
				allowHashBang: true,
			});

			const toBeFixed: any[] = [];
			const preambles: string[] = [];
			let counter = 1;

			walk(ast, {
				enter(node) {
					if (node.type === "ImportDeclaration") {
						if (!dependencies.has(node.source.value)) {
							return;
						}

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
								if (
									specifier.imported.name ===
									specifier.local.name
								) {
									destructurings.push(specifier.local.name);
								} else {
									destructurings.push(
										`${specifier.imported.name}: ${specifier.local.name}`,
									);
								}
							}
						}

						if (!changed) {
							return;
						}

						preambles.push(
							`const { ${destructurings.join(
								", ",
							)} } = ${name}.default?.__esModule ? ${name}.default : ${name};`,
						);

						toBeFixed.push(node);
					}
				},
			});

			if (toBeFixed.length === 0) {
				return;
			}

			const ms = sourcemaps ? new MagicString(code) : null;
			counter = 1;

			for (const node of toBeFixed) {
				const newName = `__cjsInterop${counter}__`;
				counter++;
				const replacement = `import ${newName} from ${JSON.stringify(
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

			const preamble = preambles.join("\n") + "\n";
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
