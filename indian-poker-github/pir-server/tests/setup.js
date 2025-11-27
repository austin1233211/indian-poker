/**
 * Test setup file for PIR Server
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'pir_server_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.ENCRYPTION_SECRET = 'test_encryption_secret_key_32_chars_long_for_testing_purposes_only';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only';
process.env.LOG_LEVEL = 'error';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock fetch for Node.js environment
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Mock timers
jest.useFakeTimers();

// Global test utilities
global.testUtils = {
  // Generate test data
  generateTestUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),
  
  generateTestCard: (overrides = {}) => ({
    id: 'test-card-id',
    name: 'Test Card',
    description: 'Test description',
    created_by: 'test-user-id',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }),
  
  generateTestPIRQuery: (type = 'card_lookup', parameters = {}) => ({
    type,
    parameters,
    timestamp: Date.now(),
    nonce: 'test-nonce-123'
  }),
  
  // Create mock response
  createMockResponse: (data = {}, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data))
  }),
  
  // Create mock request
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/api/test',
    headers: {},
    body: {},
    user: null,
    ...overrides
  }),
  
  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Clean up mocks
  cleanup: () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  }
};

// Extend Jest matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false
      };
    }
  },
  
  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false
      };
    }
  }
});

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset global fetch mock
  global.fetch.mockClear();
});

afterEach(() => {
  // Cleanup after each test
  global.testUtils.cleanup();
});

afterAll(() => {
  // Cleanup after all tests
  jest.restoreAllMocks();
});