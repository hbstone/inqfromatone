import globals from "globals";
import pluginJs from "@eslint/js";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
  pluginJs.configs.recommended,
  {
    files: ['*.js', '**/*.js'],
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
]
