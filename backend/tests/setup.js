// Mock database pool
const mockPool = {
  query: jest.fn(),
};

// Mock the database module
jest.mock('../src/db/migrate', () => ({
  pool: mockPool,
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn((password) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`)),
}));

// Mock fastify plugins
jest.mock('@fastify/jwt', () => jest.fn());

jest.mock('fastify-bcrypt', () => jest.fn());

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Cleanup after all tests
afterAll(() => {
  jest.resetAllMocks();
});

// Export mock pool for use in tests
global.mockPool = mockPool;
