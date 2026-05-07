// App version. The string is injected at build time by Vite's `define`
// (see `vite.config.ts → __APP_VERSION__`) from `package.json → version`.
// Patch-level bumps happen automatically on every push to `main` via the
// `version-bump` workflow; major / minor are bumped manually when the
// scope of the changes warrants it.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
