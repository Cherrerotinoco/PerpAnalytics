import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default [
  {
    // Both halves of the codebase. `server/` was outside this for a long time,
    // which is how it drifted out of prettier without anyone noticing.
    files: ['app/src/**/*.{ts,tsx}', 'server/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      curly: ['error', 'all'],
      // Enforce arrow functions — ban `function` declarations and named function expressions
      'func-style': ['error', 'expression'],
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionExpression[id!=null]',
          message: 'Named function expressions are not allowed; use arrow functions instead.',
        },
      ],
    },
  },
  prettier,
];
