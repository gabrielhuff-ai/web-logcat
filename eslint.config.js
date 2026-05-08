import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // `docs/` and `scripts/` are out of scope for the app's lint config —
  // they ship under their own toolchains (VitePress and the screenshot
  // Playwright config) and use TypeScript syntax that the default
  // JS parser can't handle. `.vitepress/cache` is the VitePress dep
  // cache that materialises whenever a docs command runs.
  { ignores: ['dist', 'design', '.claude', 'docs', 'scripts', '.vitepress'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022 },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The hooks plugin ships exhaustive-deps as `warn`. With our
      // `--max-warnings 0` lint script that's already error-equivalent
      // in CI, but explicit is better than implicit.
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
