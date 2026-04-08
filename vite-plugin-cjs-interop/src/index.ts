import type { Plugin } from "vite";
import { parse } from "oxc-parser";
import MagicString from "magic-string";
import { minimatch } from "minimatch";
import { walk } from "estree-walker";

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

	/**
	 * Set to false for to workaround https://github.com/vitejs/vite/issues/22122.
	 *
	 * @deprecated Vite 8.0.6 fixed the issue. The plugin will automatically
	 * detect if the Vite version is affected and apply the workaround if
	 * necessary. Providing it manually will still override the automatic
	 * detection but is now unnecessary and will be removed in the near future.
	 *
	 * @default true
	 */
	trustViteWithHoisting?: boolean;
}

const CSS_LANGS_RE =
	/\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export function cjsInterop(options: CjsInteropOptions): Plugin {
	const dependencies = Array.from(new Set(options.dependencies));
	const {
		client = false,
		apply = "both",
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		trustViteWithHoisting: trustViteWithHoistingOption,
	} = options;

	let trustViteWithHoisting = trustViteWithHoistingOption;

	let sourcemaps = false;

	const matchedDependencies: Record<string, boolean> = {};

	const matchesDependencies = (value: string) => {
		if (!(value in matchedDependencies)) {
			matchedDependencies[value] = dependencies.some((dependency) =>
				minimatch(value, dependency),
			);
		}
		return matchedDependencies[value];
	};

	const dependencyFilters = dependencies
		.map((dependency) => {
			if (dependency.startsWith("!")) {
				return false;
			}

			// Remove stars
			dependency = dependency.replace(/\*/g, "");

			// Escape regex special characters
			dependency = dependency.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");

			return new RegExp(dependency);
		})
		.filter(Boolean) as RegExp[];

	return {
		name: "cjs-interop",
		enforce: "post",
		apply: apply === "both" ? undefined : apply,

		configResolved(config) {
			sourcemaps = !!config.build.sourcemap;

			if (trustViteWithHoistingOption === undefined) {
				const [major, minor, patch] = this.meta.viteVersion
					.split(".")
					.map(Number) as [number, number, number];
				trustViteWithHoisting = !(major === 8 && minor === 0 && patch <= 5);
			}
		},

		transform: {
			filter: {
				code: dependencyFilters,
				moduleType: ["js", "ts", "jsx", "tsx"],
			},
			async handler(code, id, options) {
				if (!client && !options?.ssr) return;
				if (CSS_LANGS_RE.test(id)) return;

				const { program: ast } = await parse(id, code);

				const toBeFixed: any[] = [];
				const preambles: string[] = [];
				let hasDynamicImportsToFix = false;

				walk(ast as any, {
					enter(node) {
						switch (node.type) {
							case "ImportDeclaration":
							case "ExportNamedDeclaration":
							case "ImportExpression":
								if (
									node.source &&
									node.source.type === "Literal" &&
									matchesDependencies(node.source.value as string)
								) {
									toBeFixed.push(node);
									if (node.type === "ImportExpression") {
										hasDynamicImportsToFix = true;
									}
								}
								break;
							default:
						}
					},
				});

				if (toBeFixed.length === 0) {
					return;
				}
				const bottomUpToBeFixed = toBeFixed.reverse();

				const ms = sourcemaps ? new MagicString(code) : null;
				let counter = 1;
				let specifierCounter = 1;

				for (const node of bottomUpToBeFixed) {
					let isNamespaceImport = false;
					if (node.type === "ImportExpression") {
						const insertion = ".then(__cjs_dyn_import__)";
						if (sourcemaps) {
							ms!.appendRight(node.end, insertion);
						} else {
							code = code.slice(0, node.end) + insertion + code.slice(node.end);
						}
						continue;
					}

					if (node.type === "ExportNamedDeclaration") {
						const importDestructurings = [];
						const exportDestructurings = [];
						const name = `__cjsInterop${counter++}__`;
						let changed = false;
						let defaultExportSpecifier = null;
						for (const specifier of node.specifiers) {
							if (specifier.type === "ExportSpecifier") {
								if (specifier.local.name === "default") {
									defaultExportSpecifier = specifier;
									continue;
								}
								changed = true;
								const specifierName = `__cjsInteropSpecifier${specifierCounter++}__`;
								importDestructurings.push(
									`${specifier.local.name}: ${specifierName}`,
								);
								exportDestructurings.push(
									`${specifierName} as ${specifier.exported.name}`,
								);
							} else {
								throw new Error(
									`Unknown ExportNamedDeclaration type specifier: ${specifier.type}`,
								);
							}
						}
						if (!changed) {
							continue;
						}
						if (defaultExportSpecifier) {
							exportDestructurings.push(
								`${name} as ${defaultExportSpecifier.exported.name}}`,
							);
						}
						const destructuring = `const { ${importDestructurings.join(
							", ",
						)} } = ${name}?.default?.__esModule ? ${name}.default : ${name};`;
						let replacementNamedImports = `import ${name} from ${JSON.stringify(
							node.source.value,
						)};`;

						if (trustViteWithHoisting) {
							preambles.push(destructuring);
						} else {
							replacementNamedImports += destructuring;
						}

						const replacementNamedExports = `export { ${exportDestructurings.join(", ")} };`;

						const replacement = [
							replacementNamedImports,
							replacementNamedExports,
						]
							.filter(Boolean)
							.join("\n");

						if (ms) {
							ms.overwrite(node.start, node.end, replacement);
						} else {
							code =
								code.slice(0, node.start) + replacement + code.slice(node.end);
						}
						continue;
					}

					const destructurings: string[] = [];
					const name = `__cjsInterop${counter++}__`;
					let changed = false;

					for (const specifier of node.specifiers || []) {
						if (specifier.type === "ImportDefaultSpecifier") {
							changed = true;
							destructurings.push(`default: ${specifier.local.name} = ${name}`);
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
					let destructuring: string;
					if (!isNamespaceImport) {
						destructuring = `const { ${destructurings.join(
							", ",
						)} } = ${name}?.default?.__esModule ? ${name}.default : ${name};`;
					} else {
						destructuring = `const ${destructurings[0]} = ${name}?.default?.__esModule ? ${name}.default : ${name};`;
					}

					let replacement = `import ${name} from ${JSON.stringify(
						node.source.value,
					)};`;

					if (trustViteWithHoisting) {
						preambles.push(destructuring);
					} else {
						replacement += "\n" + destructuring;
					}

					if (sourcemaps) {
						ms!.overwrite(node.start, node.end, replacement);
					} else {
						code =
							code.slice(0, node.start) + replacement + code.slice(node.end);
					}
				}

				if (hasDynamicImportsToFix) {
					const importCompat = `import { __cjs_dyn_import__ } from "virtual:cjs-dyn-import";\n`;
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
		},

		resolveId: {
			filter: {
				id: [/^virtual:cjs-dyn-import$/],
			},
			handler(id) {
				if (id === "virtual:cjs-dyn-import") {
					return "\0virtual:cjs-dyn-import";
				}
			},
		},

		load: {
			filter: {
				id: [/^\0virtual:cjs-dyn-import$/],
			},
			handler(id) {
				if (id === "\0virtual:cjs-dyn-import") {
					return VIRTUAL_MODULE_CODE;
				}
			},
		},
	};
}

const VIRTUAL_MODULE_CODE = `
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
