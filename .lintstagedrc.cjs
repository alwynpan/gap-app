'use strict';

module.exports = {
  'backend/**/*.js': (files) => [
    `prettier --write ${files.join(' ')}`,
    'npm run lint:backend',
  ],
  'frontend/**/*.{js,jsx}': (files) => [
    `prettier --write ${files.join(' ')}`,
    'npm run lint:frontend',
  ],
  '**/*.{json,md}': (files) => [`prettier --write ${files.join(' ')}`],
};
