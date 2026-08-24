/* global jest */
const api = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
};

export const registerSessionExpiryHandler = jest.fn(() => jest.fn());

export default api;
