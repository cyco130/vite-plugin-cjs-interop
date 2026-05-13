# `vite-plugin-cjs-interop`

Vite plugin to unwrap default imports from CJS dependencies during SSR.

## Problem

In Node.js, when a CJS module that contains both a default export and named exports is imported from an ESM module, the default export has to be accessed via the `default` property of the imported module. Prior to version 5, Vite had some logic to handle this during development, but it didn't apply to SSR builds with `external` CJS dependencies. Since Vite 5, the problem happens in development as well. You don't get any indication that it won't work in production. TypeScript doesn't complain either.

## Solution

This plugin will automatically unwrap the default export from CJS dependencies that you specify during SSR builds. In other words, the following code:

```js
import foo, { named, named2 as renamed } from "foo";
```

will be transformed into:

```js
const {
  default: foo = __cjsInterop1__,
  named,
  named2: renamed,
} = __cjsInterop1__?.default?.default?.__esModule
  ? __cjsInterop1__.default.default
  : __cjsInterop1__?.default?.__esModule
    ? __cjsInterop1__.default
    : __cjsInterop1__;
import * as __cjsInterop1__ from "foo";
```

which takes care of unwrapping the default export and creating a synthetic default export if necessary.

The change for dynamic imports is more complicated, but allows the `import()` function to resolve to an object that not only resembles the standard ES6 namespace as expected, but also a CommonJS export:

```js
const foo = await import("foo");

// ES6 namespace, with default export
foo.default.bar(); // Works

// CommonJS Module (some libraries expect this to work because webpack allows it)
foo.bar(); // Also works
```

## Installation

```sh
npm install -D vite-plugin-cjs-interop
```

## Usage

```js
// vite.config.js
import { cjsInterop } from "vite-plugin-cjs-interop";

export default {
  plugins: [
    cjsInterop({
      // List of CJS dependencies that require interop
      dependencies: [
        "some-package",
        // Deep imports should be specified separately
        "some-package/deep/import",
        // But globs are supported
        "some-package/foo/*",
        // Even deep globs for scoped packages
        "@some-scope/**",
        // If you want to skip a specific package, you can use negative globs
        "!@donottransformme/**",
      ],
    }),
  ],
};
```

The matcher uses [minimatch](https://github.com/isaacs/minimatch) underneath, for more details on supported syntax.

## Compatibility

We currently test the plugin end-to-end (both SSR and client, in both `vite build` and `vite dev` modes) against the latest patch of:

- **Vite** 5, 6, 7, and 8 — specifically the most recent release in the `~5`, `~6.4`, `~7.3`, and `8` ranges.
- **Node** 22, 24, 25, and 26 on Linux; Node 24 on macOS and Windows.

### Support policy

- For **Vite**, we try to follow Vite's own support window: the latest major plus the latest minor of each of the two preceding majors.
- For **Node**, we try to follow Node's own support window: latest patches of "LTS" and "current" releases.

Note that we still test against Vite 5 but it's not an officially supported version. We'll try to keep testing against it as long as it doesn't require any special handling.

## License

[MIT](LICENSE)
