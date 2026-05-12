# CLAUDE.md

Project context for Claude Code and other agents. Keep this file focused on things that are **not** obvious from reading the repo — anything you can grep for in five seconds doesn't belong here.

Markdown in this repo is not manually wrapped. Write one paragraph per line and let the editor soft-wrap.

## Layout

- [packages/vite-plugin-cjs-interop/](packages/vite-plugin-cjs-interop/) — the published library (`vite-plugin-cjs-interop` on npm). Built with tsdown. The package name is bare (unscoped) — an intentional exception that predates any "always scope under `@<org>/`" convention you may have seen in similar repos. Don't rename.
- [tests/bench/](tests/bench/) — internal, non-published workspace package that runs the plugin end-to-end against a real Vite build with puppeteer. Invoked via `pnpm run ci` from the root.
- [tests/cjs-test-package/](tests/cjs-test-package/) — a fixture CJS package the bench depends on (declared as a `file:` dep on its packed `.tgz` so the bench sees it exactly as a published consumer would).

The root [readme.md](readme.md) is a symlink into the package's readme. Edit the symlink target, not the symlink.

## Stack invariants

These are deliberate. Don't change them without a reason.

- **ESM only.** No CJS output, no `"type": "commonjs"`. tsdown is configured for `format: ["esm"]` and `platform: "node"`.
- **Strict TS** with `noUncheckedIndexedAccess` and `noImplicitOverride`.
- **Relative imports use `.ts` extensions**, not `.js`. Lint enforces this; tsconfigs allow it via `allowImportingTsExtensions`. The point is that source runs natively under Node's TS support and Deno, no transpile step required.
- **Tabs, 80 cols.** Markdown and `package.json` use 2-space indent (see [.prettierrc](.prettierrc)). Don't reformat with spaces.
- **Node**: the published source in [packages/vite-plugin-cjs-interop/src/](packages/vite-plugin-cjs-interop/src/) targets the lowest `engines.node` major. The support range covers every active LTS and every Current release. Dev tooling, build configs, and scripts (e.g. `tsdown.config.ts`) can assume the latest minor of the most recent LTS — features that landed in recent LTS minors are fair game there; Current-only features aren't. Off-limits inside the package `src/`.
- **ESLint config** comes from `@cyco130/eslint-config/node`. Lint rules live there, not in-repo.

## Library invariants

vite-plugin-cjs-interop-specific design choices that look like dead code or premature optimization if you don't know why they're there.

- **Vite hoisting workaround is version-gated.** Vite 8.0.6 fixed [vitejs/vite#22122](https://github.com/vitejs/vite/issues/22122); on older Vite versions the plugin auto-detects the bug (via the exported `version` constant read in `configResolved`) and applies a transform-time workaround. The user-facing `trustViteWithHoisting` option is `@deprecated` but still honored as a manual override and shouldn't be removed until consumers have migrated off it.
- **Parser is `oxc-parser`, not Babel or acorn.** Chosen for speed; the AST is walked with `estree-walker` and rewritten with `magic-string`. Don't swap parsers without measuring — the bench in [tests/bench/](tests/bench/) is what gates that decision.
- **`minimatch` for dependency globs.** `dependencies: ["pkg/*"]` is matched with minimatch, not a hand-rolled glob — supports negation (`!pkg/sub`) and the full minimatch dialect. Match results are cached per-id in `matchedDependencies` because `transform` runs per-module and minimatch is not free.

## Commands

Run from the repo root unless noted.

- `pnpm dev` — watch-build the package.
- `pnpm build` — build the package.
- `pnpm test` — runs every script matching `test:*` (uses pnpm's `/^test:/` pattern syntax). Adding a new `test:foo` script auto-joins the suite — no test runner registry to update.
- `pnpm run ci` — runs the end-to-end bench in [tests/bench/](tests/bench/) against the **built** plugin under real Vite + puppeteer. Two gotchas: (a) the script does not auto-build, so a stale or missing `packages/vite-plugin-cjs-interop/dist/` will silently invalidate the run — `pnpm build` first; (b) must be spelled `pnpm run ci`, not `pnpm ci` — pnpm treats bare `pnpm ci` as a built-in alias for `pnpm install --frozen-lockfile`, which shadows this script.
- `pnpm format` — Prettier write across the repo.

Inside [packages/vite-plugin-cjs-interop/](packages/vite-plugin-cjs-interop/), `pnpm test` fans out to `test:unit` (vitest), `test:typecheck` (`tsc --noEmit`), `test:lint` (eslint), and `test:package` (publint).

## Versioning and publishing

- `./version <semver-arg>` (e.g. `./version patch`, `./version 1.2.0`) bumps the package's version and reinstalls to update the lockfile. Run from a clean tree.
- Publishing is wired up in [.github/workflows/publish.yml](.github/workflows/publish.yml).

## Tooling around the edges

- **husky + lint-staged** run on pre-commit. If a commit is being blocked, fix the underlying lint/format issue rather than bypassing the hook.
- **Renovate** config lives at [.github/renovate.json](.github/renovate.json).
- **VSCode** recommended extensions and settings live in [.vscode/](.vscode/).
