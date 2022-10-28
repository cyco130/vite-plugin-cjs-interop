# `vite-plugin-cjs-interop`

Vite plugin to unwrap default imports from CJS dependencies during SSR.

## Problem

In Node.js, when a CJS module that contains both a default export and named exports is imported from an ESM module, the default export has to be accessed via the `default` property of the imported module. Vite has some logic to handle this during development, but it doesn't apply to SSR builds with `external` CJS dependencies. You don't get any indication that it won't work in production. TypeScript doesn't complain either.

## Solution

This plugin will automatically unwrap the default export from CJS dependencies that you specify during SSR builds. In other words, the following code:

```js
import defaultImport from "some-cjs-module";
```

will be transformed to:

```js
const defaultImport = __cjsInterop1__.default;
import __cjsInterop1__ from "some-cjs-module";
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
      dependencies: ["styled-components"],
    }),
  ],
};
```

## License

[MIT](LICENSE)
