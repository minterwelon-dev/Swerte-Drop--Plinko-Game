import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // math/ and scripts/ must stay runnable in Node: no Phaser, no DOM.
    files: ['src/math/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['phaser', '**/game/**', '**/scenes/**'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
);
