const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

/**
 * Administrative Routes
 * Handles system administration and monitoring
 */
const adminRoutes = (services) => {
  const router = express.Router();
  const { database, encryption, authService, logger } = services;

  // Validation middleware
  const validateUserUpdate = [
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    body('role')
      .optional()
      .isIn(['user', 'premium', 'admin'])
      .withMessage('Invalid role specified'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean')
  ];

  const validateUserId = [
    param('id')
      .isUUID()
      .withMessage('User ID must be a valid UUID')
  ];

  const validatePagination = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ];

  /**
   * GET /api/admin/dashboard
   * Get system dashboard statistics
   */
  router.get('/dashboard',
    authService.authenticate,
    authService.authorize(['admin']),
    async (req, res) => {
      try {
        const stats = {};

        // Get user statistics
        const totalUsers = await database.query('users');
        const activeUsers = await database.query('users', { where: { is_active: true } });
        const adminUsers = await database.query('users', { where: { role: 'admin' } });
        const premiumUsers = await database.query('users', { where: { role: 'premium' } });

        stats.users = {
          total: totalUsers.length,
          active: activeUsers.length,
          admins: adminUsers.length,
          premium: premiumUsers.length
        };

        // Get card statistics
        const totalCards = await database.query('cards');
        const activeCards = await database.query('cards', { where: { is_active: true } });

        stats.cards = {
          total: totalCards.length,
          active: activeCards.length
        };

        // Get recent activity (last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const recentUsers = await database.query('users', {
          where: { created_at: { $gte: yesterday } }
        });

        const recentCards = await database.query('cards', {
          where: { created_at: { $gte: yesterday } }
        });

        stats.recent_activity = {
          new_users: recentUsers.length,
          new_cards: recentCards.length
        };

        // Get system metrics
        stats.system = {
          uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
          node_version: process.version,
          platform: process.platform,
          arch: process.arch
        };

        res.status(200).json({
          success: true,
          dashboard: stats,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get dashboard stats:', error);
        res.status(500).json({
          error: 'Failed to retrieve dashboard statistics',
          code: 'DASHBOARD_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/admin/users
   * Get list of users with pagination and filters
   */
  router.get('/users',
    authService.authenticate,
    authService.authorize(['admin']),
    validatePagination,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const {
          page = 1,
          limit = 20,
          search,
          role,
          is_active = 'all',
          sort_by = 'created_at',
          sort_order = 'desc'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build query conditions
        const conditions = { where: {} };
        
        if (is_active !== 'all') {
          conditions.where.is_active = is_active === 'true';
        }

        if (role) {
          conditions.where.role = role;
        }

        if (search) {
          conditions.where.$or = [
            { name: { $like: `%${search}%` } },
            { email: { $like: `%${search}%` } }
          ];
        }

        // Get users with pagination
        const users = await database.query('users', conditions, {
          select: ['id', 'email', 'name', 'role', 'is_active', 'created_at', 'last_login', 'login_attempts'],
          orderBy: { column: sort_by, direction: sort_order },
          limit: limitNum,
          offset: offset
        });

        // Sanitize users (remove sensitive data)
        const sanitizedUsers = users.map(user => authService.sanitizeUser(user));

        // Get total count for pagination
        const totalUsers = await database.query('users', { where: conditions.where });
        const total = totalUsers.length;

        res.status(200).json({
          success: true,
          users: sanitizedUsers,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get users:', error);
        res.status(500).json({
          error: 'Failed to retrieve users',
          code: 'USERS_GET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/admin/users/:id
   * Get detailed user information
   */
  router.get('/users/:id',
    authService.authenticate,
    authService.authorize(['admin']),
    validateUserId,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { id } = req.params;

        // Get user details
        const users = await database.query('users', { where: { id } });

        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        const user = users[0];

        // Get additional statistics for this user
        const userCards = await database.query('cards', { where: { created_by: id } });
        const userQueries = await database.query('pir_queries', { where: { user_id: id } });

        const userDetails = {
          ...authService.sanitizeUser(user),
          statistics: {
            cards_created: userCards.length,
            queries_made: userQueries.length
          }
        };

        res.status(200).json({
          success: true,
          user: userDetails,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get user details:', error);
        res.status(500).json({
          error: 'Failed to retrieve user details',
          code: 'USER_GET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * PUT /api/admin/users/:id
   * Update user information
   */
  router.put('/users/:id',
    authService.authenticate,
    authService.authorize(['admin']),
    validateUserId,
    validateUserUpdate,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { id } = req.params;
        const updates = req.body;

        // Check if user exists
        const users = await database.query('users', { where: { id } });
        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        const user = users[0];

        // Prevent users from modifying their own role or deactivating themselves
        if (id === req.user.user_id) {
          if (updates.role || updates.is_active === false) {
            return res.status(403).json({
              error: 'Cannot modify your own role or deactivate yourself',
              code: 'SELF_MODIFICATION_DENIED',
              timestamp: new Date().toISOString()
            });
          }
        }

        // Prepare update data
        const updateData = {
          ...updates,
          updated_at: new Date().toISOString()
        };

        // Update user
        await database.update('users', updateData, { where: { id } });

        // Log user update
        logger.auth('USER_UPDATED', {
          updated_user_id: id,
          updated_by: req.user.user_id,
          changes: Object.keys(updates)
        });

        res.status(200).json({
          success: true,
          message: 'User updated successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('User update failed:', error);
        res.status(500).json({
          error: 'Failed to update user',
          code: 'USER_UPDATE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/admin/users/:id/reset-password
   * Reset user password (admin only)
   */
  router.post('/users/:id/reset-password',
    authService.authenticate,
    authService.authorize(['admin']),
    validateUserId,
    [
      body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { id } = req.params;
        const { newPassword } = req.body;

        // Check if user exists
        const users = await database.query('users', { where: { id } });
        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        // Hash new password
        const hashedPassword = await encryption.hashPassword(newPassword);

        // Update password
        await database.update('users', 
          { 
            password: hashedPassword,
            updated_at: new Date().toISOString()
          }, 
          { where: { id } }
        );

        // Log password reset
        logger.security('PASSWORD_RESET', {
          reset_user_id: id,
          reset_by: req.user.user_id,
          ip: logger.getClientIP(req)
        });

        res.status(200).json({
          success: true,
          message: 'Password reset successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Password reset failed:', error);
        res.status(500).json({
          error: 'Failed to reset password',
          code: 'PASSWORD_RESET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/admin/users/:id/deactivate
   * Deactivate user account
   */
  router.post('/users/:id/deactivate',
    authService.authenticate,
    authService.authorize(['admin']),
    validateUserId,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { id } = req.params;

        // Prevent deactivating yourself
        if (id === req.user.user_id) {
          return res.status(403).json({
            error: 'Cannot deactivate your own account',
            code: 'SELF_DEACTIVATION_DENIED',
            timestamp: new Date().toISOString()
          });
        }

        // Check if user exists
        const users = await database.query('users', { where: { id } });
        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        // Deactivate user
        await database.update('users', 
          { 
            is_active: false,
            updated_at: new Date().toISOString()
          }, 
          { where: { id } }
        );

        // Log user deactivation
        logger.auth('USER_DEACTIVATED', {
          deactivated_user_id: id,
          deactivated_by: req.user.user_id
        });

        res.status(200).json({
          success: true,
          message: 'User deactivated successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('User deactivation failed:', error);
        res.status(500).json({
          error: 'Failed to deactivate user',
          code: 'USER_DEACTIVATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/admin/users/:id/activate
   * Activate user account
   */
  router.post('/users/:id/activate',
    authService.authenticate,
    authService.authorize(['admin']),
    validateUserId,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { id } = req.params;

        // Check if user exists
        const users = await database.query('users', { where: { id } });
        if (users.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        // Activate user
        await database.update('users', 
          { 
            is_active: true,
            updated_at: new Date().toISOString()
          }, 
          { where: { id } }
        );

        // Log user activation
        logger.auth('USER_ACTIVATED', {
          activated_user_id: id,
          activated_by: req.user.user_id
        });

        res.status(200).json({
          success: true,
          message: 'User activated successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('User activation failed:', error);
        res.status(500).json({
          error: 'Failed to activate user',
          code: 'USER_ACTIVATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/admin/logs
   * Get system logs (admin only)
   */
  router.get('/logs',
    authService.authenticate,
    authService.authorize(['admin']),
    [
      query('level')
        .optional()
        .isIn(['error', 'warn', 'info', 'debug'])
        .withMessage('Invalid log level'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Limit must be between 1 and 1000')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { level, limit = 100, type } = req.query;
        const limitNum = parseInt(limit);

        // This would typically read from log files or a database
        // For now, we'll return a placeholder response
        const logs = {
          message: 'Log retrieval functionality would be implemented here',
          level: level || 'all',
          limit: limitNum,
          type: type || 'all',
          implementation_note: 'In production, this would read from log files or a logging database'
        };

        res.status(200).json({
          success: true,
          logs: logs,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get logs:', error);
        res.status(500).json({
          error: 'Failed to retrieve logs',
          code: 'LOGS_GET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/admin/database/stats
   * Get database statistics
   */
  router.get('/database/stats',
    authService.authenticate,
    authService.authorize(['admin']),
    async (req, res) => {
      try {
        const dbStats = await database.getStats();

        res.status(200).json({
          success: true,
          database: dbStats,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get database stats:', error);
        res.status(500).json({
          error: 'Failed to retrieve database statistics',
          code: 'DB_STATS_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/admin/maintenance/start
   * Start maintenance mode
   */
  router.post('/maintenance/start',
    authService.authenticate,
    authService.authorize(['admin']),
    [
      body('reason')
        .notEmpty()
        .withMessage('Maintenance reason is required')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors.array(),
            timestamp: new Date().toISOString()
          });
        }

        const { reason } = req.body;

        // Set maintenance mode flag (this would typically be stored in database or environment)
        process.env.MAINTENANCE_MODE = 'true';

        // Log maintenance start
        logger.warn('MAINTENANCE_STARTED', {
          reason: reason,
          started_by: req.user.user_id,
          timestamp: new Date().toISOString()
        });

        res.status(200).json({
          success: true,
          message: 'Maintenance mode started',
          reason: reason,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to start maintenance mode:', error);
        res.status(500).json({
          error: 'Failed to start maintenance mode',
          code: 'MAINTENANCE_START_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/admin/maintenance/stop
   * Stop maintenance mode
   */
  router.post('/maintenance/stop',
    authService.authenticate,
    authService.authorize(['admin']),
    async (req, res) => {
      try {
        // Remove maintenance mode flag
        delete process.env.MAINTENANCE_MODE;

        // Log maintenance stop
        logger.warn('MAINTENANCE_STOPPED', {
          stopped_by: req.user.user_id,
          timestamp: new Date().toISOString()
        });

        res.status(200).json({
          success: true,
          message: 'Maintenance mode stopped',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to stop maintenance mode:', error);
        res.status(500).json({
          error: 'Failed to stop maintenance mode',
          code: 'MAINTENANCE_STOP_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  return router;
};

module.exports = adminRoutes;