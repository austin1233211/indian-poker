/**
 * Jest Test Setup
 * 
 * Global test configuration and utilities
 */

// Increase timeout for tests
jest.setTimeout(60000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up test environment
process.env.NODE_ENV = 'test';

// Global test utilities
global.testUtils = {
  // Generate random test data
  generateRandomDeck(): number[] {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    return deck.sort(() => Math.random() - 0.5);
  },

  // Generate random permutation
  generateRandomPermutation(): number[] {
    return Array.from({ length: 52 }, (_, i) => i).sort(() => Math.random() - 0.5);
  },

  // Generate random seed
  generateRandomSeed(): string {
    return `test-seed-${Date.now()}-${Math.random()}`;
  },

  // Validate card value
  isValidCard(card: number): boolean {
    return card >= 0 && card < 52;
  },

  // Parse card to suit and rank
  parseCard(card: number): { suit: number; rank: number } {
    return {
      suit: Math.floor(card / 13),
      rank: (card % 13) + 2
    };
  }
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});