/**
 * Unit tests for EncryptionService
 */

const { EncryptionService } = require('../../src/services/EncryptionService');

describe('EncryptionService', () => {
  let encryptionService;

  beforeEach(() => {
    // Set test environment variables
    process.env.ENCRYPTION_SECRET = 'test_encryption_secret_key_32_chars_long';
    encryptionService = new EncryptionService();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_SECRET;
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(encryptionService.algorithm).toBe('aes-256-gcm');
      expect(encryptionService.hashAlgorithm).toBe('sha256');
      expect(encryptionService.saltRounds).toBe(12);
      expect(encryptionService.masterKey).toBeDefined();
      expect(encryptionService.masterKey.length).toBe(32);
    });

    test('should use provided secret key', () => {
      const customSecret = 'custom_secret_key_32_characters_long_for_testing';
      process.env.ENCRYPTION_SECRET = customSecret;
      const service = new EncryptionService();
      
      expect(service.masterKey.toString()).toBe(Buffer.from(customSecret, 'utf8').toString());
    });
  });

  describe('encrypt', () => {
    test('should encrypt data successfully', () => {
      const plaintext = 'sensitive card data';
      const context = 'card:12345:properties';
      
      const encrypted = encryptionService.encrypt(plaintext, context);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    test('should throw error for empty data', () => {
      expect(() => {
        encryptionService.encrypt('');
      }).toThrow('No data provided for encryption');
    });

    test('should throw error for null data', () => {
      expect(() => {
        encryptionService.encrypt(null);
      }).toThrow('No data provided for encryption');
    });

    test('should encrypt with default context', () => {
      const plaintext = 'test data';
      const encrypted = encryptionService.encrypt(plaintext);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });
  });

  describe('decrypt', () => {
    test('should decrypt data successfully', () => {
      const plaintext = 'sensitive card data';
      const context = 'card:12345:properties';
      
      const encrypted = encryptionService.encrypt(plaintext, context);
      const decrypted = encryptionService.decrypt(encrypted, context);
      
      expect(decrypted).toBe(plaintext);
    });

    test('should decrypt with default context', () => {
      const plaintext = 'test data';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    test('should throw error for empty encrypted data', () => {
      expect(() => {
        encryptionService.decrypt('');
      }).toThrow('No encrypted data provided for decryption');
    });

    test('should throw error for null encrypted data', () => {
      expect(() => {
        encryptionService.decrypt(null);
      }).toThrow('No encrypted data provided for decryption');
    });

    test('should throw error for invalid encrypted data structure', () => {
      const invalidData = 'invalid-base64-data';
      
      expect(() => {
        encryptionService.decrypt(invalidData);
      }).toThrow();
    });

    test('should throw error for wrong context', () => {
      const plaintext = 'sensitive data';
      const correctContext = 'card:12345:properties';
      const wrongContext = 'card:99999:properties';
      
      const encrypted = encryptionService.encrypt(plaintext, correctContext);
      
      expect(() => {
        encryptionService.decrypt(encrypted, wrongContext);
      }).toThrow();
    });
  });

  describe('hashPassword', () => {
    test('should hash password successfully', async () => {
      const password = 'SecurePassword123!';
      
      const hash = await encryptionService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hash length
    });

    test('should throw error for empty password', async () => {
      await expect(encryptionService.hashPassword(''))
        .rejects.toThrow('No password provided for hashing');
    });

    test('should throw error for null password', async () => {
      await expect(encryptionService.hashPassword(null))
        .rejects.toThrow('No password provided for hashing');
    });
  });

  describe('verifyPassword', () => {
    test('should verify correct password', async () => {
      const password = 'SecurePassword123!';
      
      const hash = await encryptionService.hashPassword(password);
      const isValid = await encryptionService.verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const wrongPassword = 'WrongPassword456!';
      
      const hash = await encryptionService.hashPassword(password);
      const isValid = await encryptionService.verifyPassword(wrongPassword, hash);
      
      expect(isValid).toBe(false);
    });

    test('should return false for empty password', async () => {
      const password = 'password';
      const hash = await encryptionService.hashPassword(password);
      
      const isValid = await encryptionService.verifyPassword('', hash);
      expect(isValid).toBe(false);
    });

    test('should return false for empty hash', async () => {
      const password = 'password';
      
      const isValid = await encryptionService.verifyPassword(password, '');
      expect(isValid).toBe(false);
    });
  });

  describe('generateRandomString', () => {
    test('should generate random string of specified length', () => {
      const length = 32;
      const randomString = encryptionService.generateRandomString(length);
      
      expect(randomString).toBeDefined();
      expect(typeof randomString).toBe('string');
      expect(randomString.length).toBe(length * 2); // hex encoding doubles the length
    });

    test('should generate random string with default length', () => {
      const randomString = encryptionService.generateRandomString();
      
      expect(randomString).toBeDefined();
      expect(typeof randomString).toBe('string');
      expect(randomString.length).toBe(64); // 32 bytes * 2 for hex
    });
  });

  describe('hashData', () => {
    test('should hash data successfully', () => {
      const data = 'test data';
      const hash = encryptionService.hashData(data);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // sha256 hex length
    });

    test('should hash data with salt', () => {
      const data = 'test data';
      const salt = 'test salt';
      const hash = encryptionService.hashData(data, salt);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should produce consistent hash for same data', () => {
      const data = 'test data';
      const hash1 = encryptionService.hashData(data);
      const hash2 = encryptionService.hashData(data);
      
      expect(hash1).toBe(hash2);
    });

    test('should produce different hash for different data', () => {
      const data1 = 'test data 1';
      const data2 = 'test data 2';
      const hash1 = encryptionService.hashData(data1);
      const hash2 = encryptionService.hashData(data2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyHash', () => {
    test('should verify correct hash', () => {
      const data = 'test data';
      const salt = 'test salt';
      const hash = encryptionService.hashData(data, salt);
      
      const isValid = encryptionService.verifyHash(data, hash, salt);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect hash', () => {
      const data = 'test data';
      const salt = 'test salt';
      const wrongData = 'wrong data';
      const hash = encryptionService.hashData(data, salt);
      
      const isValid = encryptionService.verifyHash(wrongData, hash, salt);
      expect(isValid).toBe(false);
    });

    test('should verify hash without salt', () => {
      const data = 'test data';
      const hash = encryptionService.hashData(data);
      
      const isValid = encryptionService.verifyHash(data, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('generateHMAC', () => {
    test('should generate HMAC successfully', () => {
      const data = 'test data';
      const context = 'test context';
      const hmac = encryptionService.generateHMAC(data, context);
      
      expect(hmac).toBeDefined();
      expect(typeof hmac).toBe('string');
      expect(hmac.length).toBe(64); // sha256 hex length
    });

    test('should generate HMAC without context', () => {
      const data = 'test data';
      const hmac = encryptionService.generateHMAC(data);
      
      expect(hmac).toBeDefined();
      expect(typeof hmac).toBe('string');
    });

    test('should produce consistent HMAC for same data and context', () => {
      const data = 'test data';
      const context = 'test context';
      const hmac1 = encryptionService.generateHMAC(data, context);
      const hmac2 = encryptionService.generateHMAC(data, context);
      
      expect(hmac1).toBe(hmac2);
    });
  });

  describe('verifyHMAC', () => {
    test('should verify correct HMAC', () => {
      const data = 'test data';
      const context = 'test context';
      const hmac = encryptionService.generateHMAC(data, context);
      
      const isValid = encryptionService.verifyHMAC(data, hmac, context);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect HMAC', () => {
      const data = 'test data';
      const wrongData = 'wrong data';
      const context = 'test context';
      const hmac = encryptionService.generateHMAC(data, context);
      
      const isValid = encryptionService.verifyHMAC(wrongData, hmac, context);
      expect(isValid).toBe(false);
    });

    test('should verify HMAC without context', () => {
      const data = 'test data';
      const hmac = encryptionService.generateHMAC(data);
      
      const isValid = encryptionService.verifyHMAC(data, hmac);
      expect(isValid).toBe(true);
    });
  });

  describe('generatePIRQuery', () => {
    test('should generate PIR query successfully', () => {
      const queryType = 'card_lookup';
      const parameters = { cardId: '12345' };
      
      const query = encryptionService.generatePIRQuery(queryType, parameters);
      
      expect(query).toBeDefined();
      expect(query.type).toBe(queryType);
      expect(query.parameters).toEqual(parameters);
      expect(query.timestamp).toBeDefined();
      expect(query.nonce).toBeDefined();
      expect(query.checksum).toBeDefined();
    });

    test('should generate query with empty parameters', () => {
      const queryType = 'card_lookup';
      
      const query = encryptionService.generatePIRQuery(queryType);
      
      expect(query).toBeDefined();
      expect(query.type).toBe(queryType);
      expect(query.parameters).toEqual({});
      expect(query.timestamp).toBeDefined();
      expect(query.nonce).toBeDefined();
    });
  });

  describe('verifyPIRQuery', () => {
    test('should verify valid PIR query', () => {
      const queryType = 'card_lookup';
      const parameters = { cardId: '12345' };
      
      const query = encryptionService.generatePIRQuery(queryType, parameters);
      const isValid = encryptionService.verifyPIRQuery(query);
      
      expect(isValid).toBe(true);
    });

    test('should reject modified query', () => {
      const queryType = 'card_lookup';
      const parameters = { cardId: '12345' };
      
      const query = encryptionService.generatePIRQuery(queryType, parameters);
      query.parameters.cardId = '99999'; // Modify the query
      
      const isValid = encryptionService.verifyPIRQuery(query);
      expect(isValid).toBe(false);
    });

    test('should reject query with missing checksum', () => {
      const query = {
        type: 'card_lookup',
        parameters: { cardId: '12345' },
        timestamp: Date.now(),
        nonce: 'test-nonce'
      };
      
      const isValid = encryptionService.verifyPIRQuery(query);
      expect(isValid).toBe(false);
    });
  });
});