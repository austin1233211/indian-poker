const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Logger } = require('../utils/Logger');

/**
 * Encryption Service for PIR Server
 * Handles all encryption, decryption, hashing, and cryptographic operations
 */
class EncryptionService {
  constructor() {
    this.logger = new Logger();
    this.algorithm = 'aes-256-gcm';
    this.hashAlgorithm = 'sha256';
    this.saltRounds = 12;
    
    // Initialize with environment secret or generate ephemeral key
    this.masterKey = this.getMasterKey();
  }

  /**
   * Get or generate master encryption key
   */
  getMasterKey() {
    const secret = process.env.ENCRYPTION_SECRET;
    if (secret && secret.length >= 32) {
      return Buffer.from(secret, 'utf8').slice(0, 32);
    }
    
    // Generate random key if no secret provided
    if (!secret) {
      this.logger.warn('No ENCRYPTION_SECRET provided, using generated key (data will be lost on restart)');
    }
    
    return crypto.randomBytes(32);
  }

  /**
   * Encrypt sensitive data
   * @param {string} plaintext - Data to encrypt
   * @param {string} [context] - Additional context for encryption
   * @returns {string} Encrypted data with metadata
   */
  encrypt(plaintext, context = '') {
    try {
      if (!plaintext) {
        throw new Error('No data provided for encryption');
      }

      // Generate random IV and salt
      const iv = crypto.randomBytes(16);
      const salt = crypto.randomBytes(32);
      
      // Derive key using context for additional security
      const derivedKey = this.deriveKey(salt, context);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, derivedKey);
      cipher.setAAD(Buffer.from(context, 'utf8'));
      
      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Package encrypted data with metadata
      const result = {
        v: '1', // version
        alg: this.algorithm,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: authTag.toString('hex'),
        data: encrypted,
        ts: Date.now()
      };
      
      return Buffer.from(JSON.stringify(result)).toString('base64');
      
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @param {string} [context] - Context used during encryption
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData, context = '') {
    try {
      if (!encryptedData) {
        throw new Error('No encrypted data provided for decryption');
      }

      // Parse the encrypted data structure
      const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
      
      // Validate structure
      if (!data.v || !data.iv || !data.salt || !data.tag || !data.data) {
        throw new Error('Invalid encrypted data structure');
      }
      
      // Extract components
      const iv = Buffer.from(data.iv, 'hex');
      const salt = Buffer.from(data.salt, 'hex');
      const authTag = Buffer.from(data.tag, 'hex');
      const encrypted = data.data;
      
      // Derive the same key
      const derivedKey = this.deriveKey(salt, context);
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, derivedKey);
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(authTag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Derive encryption key from master key and salt
   */
  deriveKey(salt, context = '') {
    const material = Buffer.concat([
      this.masterKey,
      salt,
      Buffer.from(context, 'utf8')
    ]);
    
    return crypto.createHash(this.hashAlgorithm).update(material).digest();
  }

  /**
   * Hash password securely
   * @param {string} password - Plaintext password
   * @returns {string} Hashed password
   */
  async hashPassword(password) {
    try {
      if (!password) {
        throw new Error('No password provided for hashing');
      }
      
      const salt = await bcrypt.genSalt(this.saltRounds);
      const hash = await bcrypt.hash(password, salt);
      
      return hash;
    } catch (error) {
      this.logger.error('Password hashing failed:', error);
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify password against hash
   * @param {string} password - Plaintext password
   * @param {string} hash - Hashed password
   * @returns {boolean} True if password matches hash
   */
  async verifyPassword(password, hash) {
    try {
      if (!password || !hash) {
        return false;
      }
      
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Generate cryptographically secure random string
   * @param {number} length - Length of the string
   * @returns {string} Random string
   */
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Create secure hash of data
   * @param {string} data - Data to hash
   * @param {string} [salt] - Optional salt
   * @returns {string} Hash
   */
  hashData(data, salt = '') {
    const material = salt ? `${data}${salt}` : data;
    return crypto.createHash(this.hashAlgorithm).update(material).digest('hex');
  }

  /**
   * Verify data integrity with hash
   * @param {string} data - Original data
   * @param {string} hash - Hash to verify against
   * @param {string} [salt] - Optional salt used in hashing
   * @returns {boolean} True if data matches hash
   */
  verifyHash(data, hash, salt = '') {
    const computedHash = this.hashData(data, salt);
    return computedHash === hash;
  }

  /**
   * Generate HMAC for data integrity
   * @param {string} data - Data to create HMAC for
   * @param {string} [context] - Context for HMAC generation
   * @returns {string} HMAC
   */
  generateHMAC(data, context = '') {
    const key = this.deriveKey(Buffer.from('hmac_key', 'utf8'), context);
    return crypto.createHmac(this.hashAlgorithm, key).update(data).digest('hex');
  }

  /**
   * Verify HMAC for data integrity
   * @param {string} data - Original data
   * @param {string} hmac - HMAC to verify
   * @param {string} [context] - Context used for HMAC generation
   * @returns {boolean} True if HMAC is valid
   */
  verifyHMAC(data, hmac, context = '') {
    const computedHMAC = this.generateHMAC(data, context);
    return crypto.timingSafeEqual(
      Buffer.from(computedHMAC, 'hex'),
      Buffer.from(hmac, 'hex')
    );
  }

  /**
   * Generate token for authentication
   * @param {object} payload - Payload to include in token
   * @param {number} [expirationHours] - Token expiration in hours
   * @returns {string} Token
   */
  generateToken(payload, expirationHours = 24) {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };
    
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (expirationHours * 60 * 60);
    
    const claims = {
      ...payload,
      iat: now,
      exp: exp,
      jti: crypto.randomUUID()
    };
    
    return this.createJWT(header, claims);
  }

  /**
   * Create JWT token
   */
  createJWT(header, payload) {
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac(this.hashAlgorithm, this.masterKey)
      .update(signingInput)
      .digest('base64url');
    
    return `${signingInput}.${signature}`;
  }

  /**
   * Verify JWT token
   */
  verifyJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      
      const [encodedHeader, encodedPayload, signature] = parts;
      
      // Verify signature
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = crypto.createHmac(this.hashAlgorithm, this.masterKey)
        .update(signingInput)
        .digest('base64url');
      
      if (!crypto.timingSafeEqual(
        Buffer.from(signature, 'base64url'),
        Buffer.from(expectedSignature, 'base64url')
      )) {
        throw new Error('Invalid signature');
      }
      
      // Decode payload
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      
      // Check expiration
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        throw new Error('Token expired');
      }
      
      return payload;
    } catch (error) {
      this.logger.error('JWT verification failed:', error);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Generate PIR-compatible queries
   * @param {string} queryType - Type of query
   * @param {object} parameters - Query parameters
   * @returns {object} PIR query
   */
  generatePIRQuery(queryType, parameters) {
    const timestamp = Date.now();
    const nonce = this.generateRandomString(16);
    
    const query = {
      type: queryType,
      parameters: parameters,
      timestamp: timestamp,
      nonce: nonce,
      checksum: this.hashData(JSON.stringify(parameters) + timestamp + nonce)
    };
    
    return query;
  }

  /**
   * Verify PIR query integrity
   * @param {object} query - PIR query to verify
   * @returns {boolean} True if query is valid
   */
  verifyPIRQuery(query) {
    try {
      const { checksum, ...queryWithoutChecksum } = query;
      const expectedChecksum = this.hashData(
        JSON.stringify(queryWithoutChecksum.parameters) + 
        queryWithoutChecksum.timestamp + 
        queryWithoutChecksum.nonce
      );
      
      return checksum === expectedChecksum;
    } catch (error) {
      this.logger.error('PIR query verification failed:', error);
      return false;
    }
  }
}

module.exports = { EncryptionService };