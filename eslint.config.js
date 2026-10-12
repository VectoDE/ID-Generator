import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['dist/', 'coverage/', 'playground/dist/', 'node_modules/'] },
  js.configs.recommended,
  // The rules SonarQube applies ("Sonar way"), so issues show up before the code reaches a scanner.
  sonarjs.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Non-null assertions mark lookups the code has just guaranteed (map entries built from the same list).
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
  },
  { files: ['playground/src/**/*.ts'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests call methods through expect(...).toThrow and build throwaway values on purpose.
      '@typescript-eslint/unbound-method': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/pseudo-random': 'off',
      // Asymmetric matchers such as expect.stringContaining() are typed as any.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // Command-line scripts print their results.
    files: ['bench/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
]);
