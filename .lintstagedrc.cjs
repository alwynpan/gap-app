'use strict';

module.exports = {
  'backend/**/*.js': (files) => [
    `prettier --write ${files.join(' ')}`,
    'pnpm run lint:backend',
  ],
  'frontend/**/*.{js,jsx}': (files) => [
    `prettier --write ${files.join(' ')}`,
    'pnpm run lint:frontend',
  ],
  '**/*.{json,md}': (files) => [`prettier --write ${files.join(' ')}`],
};
