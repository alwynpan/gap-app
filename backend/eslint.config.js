const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const security = require('eslint-plugin-security');

module.exports = [
  js.configs.recommended,
  prettier,
  {
    plugins: {
      security,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node globals
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'require-await': 'warn',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-globals': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-useless-catch': 'error',
      'no-useless-return': 'error',
      'no-return-await': 'warn',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-possible-timing-attacks': 'off',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  {
    files: ['src/server.js', 'src/db/migrate.js'],
    rules: {
      'no-console': 'off',
      'require-await': 'off',
    },
  },
  {
    files: ['src/routes/*.js'],
    rules: {
      'no-console': 'off',
      'require-await': 'off',
    },
  },
  {
    files: ['src/middleware/*.js'],
    rules: {
      'require-await': 'off',
      'no-return-await': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['src/models/*.js'],
    rules: {
      'no-return-await': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'require-await': 'off',
      'no-unused-vars': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'coverage/', 'dist/', 'build/', '*.min.js', 'eslint.xml'],
  },
];
