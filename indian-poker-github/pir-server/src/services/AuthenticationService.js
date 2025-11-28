const { v4: uuidv4 } = require('uuid');
const { Logger } = require('../utils/Logger');

/**
 * Authentication Service for PIR Server
 * Handles user authentication, authorization, and session management
 */
class AuthenticationService {
  constructor(database) {
    this.database = database;
    this.logger = new Logger();
    this.sessions = new Map(); // In-memory session storage
    this.tokenBlacklist = new Set(); // Blacklisted tokens
  }

  /**
   * Register a new user
   * @param {object} userData - User registration data
   * @returns {object} Created user (without sensitive data)
   */
  async register(userData) {
    try {
      const { email, password, name, role = 'user' } = userData;

      // Validation
      if (!email || !password || !name) {
        throw new Error('Email, password, and name are required');
      }

      if (!this.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Check if user already exists
      const existingUser = await this.database.query('users', {
        where: { email }
      });

      if (existingUser.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Create user
      const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        name,
        role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        login_attempts: 0,
        last_login: null
      };

      await this.database.insert('users', user);

      this.logger.info(`User registered: ${email}`);
      return this.sanitizeUser(user);

    } catch (error) {
      this.logger.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {object} Authentication result with token
   */
  async login(email, password) {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // Get user by email
      const users = await this.database.query('users', {
        where: { email: email.toLowerCase(), is_active: true }
      });

      if (users.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = users[0];

      // Check if account is locked
      if (this.isAccountLocked(user)) {
        await this.incrementLoginAttempts(user.id);
        throw new Error('Account is temporarily locked due to multiple failed login attempts');
      }

      // Verify password (password is stored encrypted, we need to decrypt it)
      const isValidPassword = await this.verifyPassword(user, password);

      if (!isValidPassword) {
        await this.incrementLoginAttempts(user.id);
        this.logger.warn(`Failed login attempt for user: ${email}`);
        throw new Error('Invalid credentials');
      }

      // Reset login attempts on successful login
      if (user.login_attempts > 0) {
        await this.database.update('users', 
          { login_attempts: 0 }, 
          { where: { id: user.id } }
        );
      }

      // Update last login
      await this.database.update('users', 
        { last_login: new Date().toISOString() }, 
        { where: { id: user.id } }
      );

      // Generate session token
      const token = await this.createSession(user);

      this.logger.info(`User logged in: ${email}`);

      return {
        success: true,
        token,
        user: this.sanitizeUser(user),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      this.logger.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Create user session
   * @param {object} user - User object
   * @returns {string} Session token
   */
  async createSession(user) {
    const token = uuidv4();
    const session = {
      user_id: user.id,
      email: user.email,
      role: user.role,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      last_activity: new Date()
    };

    this.sessions.set(token, session);
    return token;
  }

  /**
   * Validate session token
   * @param {string} token - Session token
   * @returns {object} User session data or null
   */
  async validateSession(token) {
    if (!token) {
      return null;
    }

    // Check if token is blacklisted
    if (this.tokenBlacklist.has(token)) {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    // Check if session is expired
    if (new Date() > session.expires_at) {
      this.sessions.delete(token);
      return null;
    }

    // Update last activity
    session.last_activity = new Date();
    this.sessions.set(token, session);

    return session;
  }

  /**
   * Invalidate session token
   * @param {string} token - Session token to invalidate
   */
  async logout(token) {
    if (token) {
      this.sessions.delete(token);
      this.tokenBlacklist.add(token); // Add to blacklist for extra security
      this.logger.info(`User logged out, token invalidated`);
    }
  }

  /**
   * Check if user has required role
   * @param {object} session - User session
   * @param {string|Array} requiredRole - Required role(s)
   * @returns {boolean} True if user has required role
   */
  hasRole(session, requiredRole) {
    if (!session || !session.role) {
      return false;
    }

    const userRole = session.role;
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    return roles.includes(userRole);
  }

  /**
   * Middleware for authentication
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next function
   */
  authenticate = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString()
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const session = await this.validateSession(token);

      if (!session) {
        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
          timestamp: new Date().toISOString()
        });
      }

      // Security: Re-check if user is still active in database
      // This prevents deactivated users from using existing tokens
      const users = await this.database.query('users', {
        where: { id: session.user_id, is_active: true }
      });

      if (users.length === 0) {
        // User was deactivated, invalidate the session
        this.sessions.delete(token);
        this.tokenBlacklist.add(token);
        return res.status(401).json({
          error: 'User account is deactivated',
          code: 'ACCOUNT_DEACTIVATED',
          timestamp: new Date().toISOString()
        });
      }

      // Attach session to request
      req.user = session;
      req.token = token;

      next();
    } catch (error) {
      this.logger.error('Authentication middleware error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Middleware for role-based authorization
   * @param {string|Array} requiredRoles - Required role(s)
   * @returns {function} Express middleware function
   */
  authorize = (requiredRoles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString()
        });
      }

      if (!this.hasRole(req.user, requiredRoles)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  };

  /**
   * Verify user password (abstract method - to be implemented with encryption)
   * @param {object} user - User object from database
   * @param {string} password - Plaintext password
   * @returns {boolean} True if password is correct
   */
  async verifyPassword(user, password) {
    // Verify password using bcrypt comparison via encryption service
    if (!user || !user.password || !password) {
      return false;
    }
    
    try {
      // Use the encryption service to verify the password against the stored hash
      return await this.encryption.verifyPassword(password, user.password);
    } catch (error) {
      this.logger.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Check if user account is locked
   * @param {object} user - User object
   * @returns {boolean} True if account is locked
   */
  isAccountLocked(user) {
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockoutMinutes = parseInt(process.env.LOCKOUT_MINUTES) || 15;

    if (user.login_attempts >= maxAttempts && user.last_login) {
      const lastAttempt = new Date(user.last_login);
      const lockoutEnd = new Date(lastAttempt.getTime() + (lockoutMinutes * 60 * 1000));
      return new Date() < lockoutEnd;
    }

    return false;
  }

  /**
   * Increment login attempts for a user
   * @param {string} userId - User ID
   */
  async incrementLoginAttempts(userId) {
    try {
      const users = await this.database.query('users', { where: { id: userId } });
      if (users.length > 0) {
        const user = users[0];
        await this.database.update('users', 
          { login_attempts: user.login_attempts + 1 }, 
          { where: { id: userId } }
        );
      }
    } catch (error) {
      this.logger.error('Failed to increment login attempts:', error);
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    const now = new Date();
    const expiredTokens = [];

    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expires_at) {
        expiredTokens.push(token);
      }
    }

    expiredTokens.forEach(token => this.sessions.delete(token));
    
    if (expiredTokens.length > 0) {
      this.logger.info(`Cleaned up ${expiredTokens.length} expired sessions`);
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if email is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize user object (remove sensitive data)
   * @param {object} user - User object
   * @returns {object} Sanitized user object
   */
  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {object} User object or null
   */
  async getUserById(userId) {
    try {
      const users = await this.database.query('users', { where: { id: userId } });
      return users.length > 0 ? this.sanitizeUser(users[0]) : null;
    } catch (error) {
      this.logger.error('Failed to get user by ID:', error);
      return null;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {object} updates - Update data
   * @returns {object} Updated user object
   */
  async updateUser(userId, updates) {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      await this.database.update('users', updateData, { where: { id: userId } });
      
      const users = await this.database.query('users', { where: { id: userId } });
      return users.length > 0 ? this.sanitizeUser(users[0]) : null;
    } catch (error) {
      this.logger.error('Failed to update user:', error);
      throw error;
    }
  }
}

module.exports = { AuthenticationService };
