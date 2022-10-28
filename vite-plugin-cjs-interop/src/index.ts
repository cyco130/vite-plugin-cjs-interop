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

      walk(ast, {
        enter(node) {
          if (node.type === "ImportDeclaration") {
            if (!dependencies.has(node.source.value)) {
              return;
            }

            const defaultSpecifier = node.specifiers.find(
              (sp: any) => sp.type === "ImportDefaultSpecifier",
            );

            if (!defaultSpecifier) {
              return;
            }

            toBeFixed.push(defaultSpecifier);
          }
        },
      });

      if (toBeFixed.length === 0) {
        return;
      }

      const ms = sourcemaps ? new MagicString(code) : null;
      let counter = 1;
      let prefix = "";

      for (const node of toBeFixed) {
        const newName = `__cjsInterop${counter}__`;
        prefix += `const ${node.local.name} = __cjsInterop${counter}__.default;\n`;
        counter++;

        if (sourcemaps) {
          ms!.overwrite(node.start, node.end, newName);
        } else {
          code = code.slice(0, node.start) + newName + code.slice(node.end);
        }
      }

      if (sourcemaps) {
        ms!.prepend(prefix);

        return {
          code: ms!.toString(),
          map: ms!.generateMap({ hires: true }),
        };
      } else {
        code = prefix + code;

        return {
          code,
        };
      }
    },
  };
}
