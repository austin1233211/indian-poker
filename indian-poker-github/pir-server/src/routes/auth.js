const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

/**
 * Authentication Routes for PIR Server
 * Handles user registration, login, logout, and session management
 */
const authRoutes = (services) => {
  const router = express.Router();
  const { database, authService, encryption, logger } = services;

  // Rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs for auth endpoints
    message: {
      error: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Validation middleware
  const validateRegistration = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),
    body('role')
      .optional()
      .isIn(['user', 'premium'])
      .withMessage('Invalid role specified. Admin accounts cannot be self-registered.')
  ];

  const validateLogin = [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ];

  /**
   * POST /api/auth/register
   * Register a new user account
   */
  router.post('/register', authLimiter, validateRegistration, async (req, res) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
          timestamp: new Date().toISOString()
        });
      }

      const { email, password, name, role = 'user' } = req.body;

      // Check password strength (additional check)
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: 'Password does not meet security requirements',
          code: 'WEAK_PASSWORD',
          details: passwordValidation.errors,
          timestamp: new Date().toISOString()
        });
      }

      // Hash password before storing
      const hashedPassword = await encryption.hashPassword(password);

      // Create user
      const userData = {
        email,
        password: hashedPassword, // Store hashed password
        name,
        role
      };

      const user = await authService.register(userData);

      // Log registration
      logger.auth('USER_REGISTERED', {
        user_id: user.id,
        email: user.email,
        role: user.role,
        ip: logger.getClientIP(req)
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Registration failed:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'User already exists',
          code: 'USER_EXISTS',
          timestamp: new Date().toISOString()
        });
      }

      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/auth/login
   * Authenticate user and create session
   */
  router.post('/login', authLimiter, validateLogin, async (req, res) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
          timestamp: new Date().toISOString()
        });
      }

      const { email, password } = req.body;

      // Attempt login
      const result = await authService.login(email, password);

      // Set session token in response header (optional, primarily for APIs)
      res.set('X-Auth-Token', result.token);
      res.set('X-Token-Expires', result.expires_at);

      // Log successful login
      logger.auth('USER_LOGIN', {
        user_id: result.user.id,
        email: result.user.email,
        ip: logger.getClientIP(req)
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token: result.token, // Include token in response body for API usage
        user: result.user,
        expires_at: result.expires_at,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.security('FAILED_LOGIN_ATTEMPT', {
        email: req.body.email,
        error: error.message,
        ip: logger.getClientIP(req)
      });

      if (error.message.includes('Invalid credentials')) {
        return res.status(401).json({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          timestamp: new Date().toISOString()
        });
      }

      if (error.message.includes('locked')) {
        return res.status(423).json({
          error: 'Account is temporarily locked',
          code: 'ACCOUNT_LOCKED',
          timestamp: new Date().toISOString()
        });
      }

      res.status(500).json({
        error: 'Login failed',
        code: 'LOGIN_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Invalidate user session
   */
  router.post('/logout', authService.authenticate, async (req, res) => {
    try {
      const token = req.token;

      // Invalidate session
      await authService.logout(token);

      // Log logout
      logger.auth('USER_LOGOUT', {
        user_id: req.user.user_id,
        email: req.user.email,
        ip: logger.getClientIP(req)
      });

      res.status(200).json({
        success: true,
        message: 'Logout successful',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Logout failed:', error);
      res.status(500).json({
        error: 'Logout failed',
        code: 'LOGOUT_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user information
   */
  router.get('/me', authService.authenticate, async (req, res) => {
    try {
      const user = await authService.getUserById(req.user.user_id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        user: user,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get user info:', error);
      res.status(500).json({
        error: 'Failed to get user information',
        code: 'USER_INFO_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Refresh authentication token
   */
  router.post('/refresh', authService.authenticate, async (req, res) => {
    try {
      const user = await authService.getUserById(req.user.user_id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
          timestamp: new Date().toISOString()
        });
      }

      // Create new session token
      const newToken = await authService.createSession(user);

      // Log token refresh
      logger.auth('TOKEN_REFRESHED', {
        user_id: user.id,
        email: user.email,
        ip: logger.getClientIP(req)
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        token: newToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Token refresh failed:', error);
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/auth/change-password
   * Change user password
   */
  router.post('/change-password', 
    authService.authenticate,
    [
      body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
      body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    ],
    async (req, res) => {
      try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.user_id;

        // Get current user with password
        const users = await database.query('users', { where: { id: userId } });
        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        const user = users[0];

        // Verify current password
        const isValidPassword = await encryption.verifyPassword(currentPassword, user.password);
        if (!isValidPassword) {
          logger.security('FAILED_PASSWORD_CHANGE', {
            user_id: userId,
            reason: 'invalid_current_password',
            ip: logger.getClientIP(req)
          });

          return res.status(401).json({
            error: 'Current password is incorrect',
            code: 'INVALID_CURRENT_PASSWORD',
            timestamp: new Date().toISOString()
          });
        }

        // Hash new password
        const hashedNewPassword = await encryption.hashPassword(newPassword);

        // Update password
        await database.update('users', 
          { 
            password: hashedNewPassword,
            updated_at: new Date().toISOString()
          }, 
          { where: { id: userId } }
        );

        // Log password change
        logger.security('PASSWORD_CHANGED', {
          user_id: userId,
          email: user.email,
          ip: logger.getClientIP(req)
        });

        res.status(200).json({
          success: true,
          message: 'Password changed successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Password change failed:', error);
        res.status(500).json({
          error: 'Password change failed',
          code: 'PASSWORD_CHANGE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * Helper function to validate password strength
   */
  function validatePasswordStrength(password) {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  return router;
};

module.exports = authRoutes;
