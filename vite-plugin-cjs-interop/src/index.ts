import type { Plugin } from "vite";
import oxc from "oxc-parser";
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
	 * When to run the plugin.
	 *
	 * @default "both"
	 */
	apply?: "build" | "serve" | "both";
}

const CSS_LANGS_RE =
	/\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export function cjsInterop(options: CjsInteropOptions): Plugin {
	const virtualModuleId = "virtual:cjs-dyn-import";
	const dependencies = Array.from(new Set(options.dependencies));
	const { client = false, apply = "both" } = options;

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
			if (CSS_LANGS_RE.test(id)) return;

			const { program: ast } = await oxc.parseAsync(code);

			const toBeFixed: any[] = [];
			const dynamicImportsToBeFixed: any[] = [];
			const preambles: string[] = [];

			const { walk } = await walker;

			walk(ast as any, {
				enter(node) {
					if (node.type === "ImportDeclaration") {
						if (matchesDependencies(node.source.value as string)) {
							toBeFixed.push(node);
						}
					} else if (node.type === "ImportExpression") {
						if (
							// @ts-expect-error OXC uses StringLiteral and not Literal
							node.source.type === "StringLiteral" &&
							// @ts-expect-error OXC uses StringLiteral and not Literal
							matchesDependencies(node.source.value as string)
						) {
							dynamicImportsToBeFixed.push(node);
						}
					}
				},
			});

			if (
				toBeFixed.length === 0 &&
				dynamicImportsToBeFixed.length === 0
			) {
				return;
			}
			const bottomUpToBeFixed = toBeFixed.reverse();

			const ms = sourcemaps ? new MagicString(code) : null;
			let counter = 1;
			let isNamespaceImport = false;

			for (const node of dynamicImportsToBeFixed.reverse()) {
				const insertion = ".then(__cjs_dyn_import__)";
				if (sourcemaps) {
					ms!.appendRight(node.end, insertion);
				} else {
					code =
						code.slice(0, node.end) +
						insertion +
						code.slice(node.end);
				}
			}

			for (const node of bottomUpToBeFixed) {
				const destructurings: string[] = [];
				const name = `__cjsInterop${counter++}__`;
				let changed = false;

				for (const specifier of node.specifiers || []) {
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
					} else if (specifier.type === "ImportNamespaceSpecifier") {
						changed = true;
						isNamespaceImport = true;
						destructurings.push(specifier.local.name);
					}
				}

				if (!changed) {
					continue;
				}
				if (!isNamespaceImport)
					preambles.push(
						`const { ${destructurings.join(
							", ",
						)} } = ${name}?.default?.__esModule ? ${name}.default : ${name};`,
					);
				else
					preambles.push(
						`const ${destructurings[0]} = ${name}?.default?.__esModule ? ${name}.default : ${name};`,
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

			if (dynamicImportsToBeFixed.length) {
				const importCompat = `import { __cjs_dyn_import__ } from "${virtualModuleId}";\n`;
				if (sourcemaps) {
					ms!.prepend(importCompat);
				} else {
					code = importCompat + code;
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

		resolveId(id) {
			if (id === virtualModuleId) {
				return id;
			}
		},

		load(id) {
			if (id === virtualModuleId) {
				return `
// This file is generated by vite-plugin-cjs-interop
// The cache allows the same object to be returned for the same dynamic import
// however static imports are not affected and will therefore return a different
// object
const modCache = new WeakMap();

export function __cjs_dyn_import__(rawImport) {
  if (rawImport?.default?.__esModule) {
    return rawImport.default;
  }
  if (modCache.has(rawImport)) {
    return modCache.get(rawImport);
  }
  const source = rawImport?.default;
  if (source) {
    const mod = Object.create(rawImport);
    modCache.set(rawImport, mod);
    Object.keys(source)
      .filter(key => !Object.hasOwn(rawImport, key))
      .forEach(key => {
        Object.defineProperty(mod, key, { enumerable: true, get: () => source[key] })
      });
    return mod;
  }
  return rawImport;
}`;
			}
		},
	};
}
