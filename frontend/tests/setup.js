import '@testing-library/jest-dom';

/* eslint-disable no-undef, security/detect-object-injection */
process.env.VITE_API_URL = 'http://localhost:3001';

const localStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

global.fetch = jest.fn();
global.confirm = jest.fn(() => true);

beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});
