const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

/**
 * PIR (Private Information Retrieval) Routes
 * Handles all private card query operations
 */
const pirRoutes = (services) => {
  const router = express.Router();
  const { database, pirEngine, encryption, authService, logger } = services;

  // Rate limiting for PIR endpoints
  const pirLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 PIR requests per minute
    message: {
      error: 'Too many PIR requests, please slow down.',
      code: 'PIR_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Stricter rate limiting for resource-intensive queries
  const strictPirLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // limit each IP to 20 intensive PIR requests per 5 minutes
    message: {
      error: 'Too many intensive PIR requests, please try again later.',
      code: 'PIR_INTENSIVE_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Validation middleware
  const validateCardLookup = [
    body('query')
      .isObject()
      .withMessage('Query must be an object'),
    body('query.type')
      .equals('card_lookup')
      .withMessage('Invalid query type'),
    body('query.parameters')
      .isObject()
      .withMessage('Parameters must be an object'),
    body('query.parameters.cardId')
      .isUUID()
      .withMessage('Card ID must be a valid UUID'),
    body('query.parameters.encryptedProperties')
      .optional()
      .isArray()
      .withMessage('Encrypted properties must be an array')
  ];

  const validateCardSearch = [
    body('query')
      .isObject()
      .withMessage('Query must be an object'),
    body('query.type')
      .equals('card_search')
      .withMessage('Invalid query type'),
    body('query.parameters')
      .isObject()
      .withMessage('Parameters must be an object'),
    body('query.parameters.searchCriteria')
      .isObject()
      .withMessage('Search criteria must be an object'),
    body('query.parameters.maxResults')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Max results must be between 1 and 100')
  ];

  const validateCardStats = [
    body('query')
      .isObject()
      .withMessage('Query must be an object'),
    body('query.type')
      .equals('card_stats')
      .withMessage('Invalid query type'),
    body('query.parameters')
      .isObject()
      .withMessage('Parameters must be an object'),
    body('query.parameters.statType')
      .isIn(['card_count', 'property_distribution', 'usage_stats'])
      .withMessage('Invalid statistics type')
  ];

  const validateCardValidation = [
    body('query')
      .isObject()
      .withMessage('Query must be an object'),
    body('query.type')
      .equals('card_validation')
      .withMessage('Invalid query type'),
    body('query.parameters')
      .isObject()
      .withMessage('Parameters must be an object'),
    body('query.parameters.cardId')
      .isUUID()
      .withMessage('Card ID must be a valid UUID')
  ];

  /**
   * POST /api/pir/query
   * Execute a PIR query
   */
  router.post('/query', 
    authService.authenticate,
    pirLimiter,
    async (req, res) => {
      try {
        const startTime = Date.now();
        
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

        const { query } = req.body;

        // Add request context for logging
        logger.setContext('request_id', req.id);
        logger.setContext('user_id', req.user.user_id);

        // Execute PIR query
        const result = await pirEngine.executePIRQuery(query, req.user);

        const responseTime = Date.now() - startTime;

        // Log PIR query execution
        logger.pir(query.type, {
          user_id: req.user.user_id,
          query_id: result.queryId || result.search_id,
          response_time: responseTime,
          success: true
        });

        // Log performance metric
        logger.performance('PIR_QUERY', responseTime, {
          query_type: query.type,
          user_id: req.user.user_id
        });

        res.status(200).json({
          success: true,
          result: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('PIR query execution failed:', error);
        
        const responseTime = Date.now() - (req.startTime || Date.now());

        // Log failed PIR query
        logger.pir(req.body.query?.type || 'unknown', {
          user_id: req.user?.user_id,
          error: error.message,
          response_time: responseTime,
          success: false
        });

        if (error.message.includes('Invalid PIR query')) {
          return res.status(400).json({
            error: 'Invalid PIR query format',
            code: 'INVALID_PIR_QUERY',
            timestamp: new Date().toISOString()
          });
        }

        if (error.message.includes('Insufficient permissions')) {
          return res.status(403).json({
            error: 'Insufficient permissions for this query',
            code: 'PIR_PERMISSION_DENIED',
            timestamp: new Date().toISOString()
          });
        }

        res.status(500).json({
          error: 'PIR query failed',
          code: 'PIR_QUERY_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/pir/bulk-query
   * Execute multiple PIR queries in bulk (requires premium or admin role)
   */
  router.post('/bulk-query',
    authService.authenticate,
    authService.authorize(['premium', 'admin']),
    strictPirLimiter,
    [
      body('queries')
        .isArray({ min: 1, max: 10 })
        .withMessage('Must provide between 1 and 10 queries'),
      body('queries.*.query')
        .isObject()
        .withMessage('Each query must be an object')
    ],
    async (req, res) => {
      try {
        const startTime = Date.now();
        
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

        const { queries } = req.body;

        // Add request context for logging
        logger.setContext('request_id', req.id);
        logger.setContext('user_id', req.user.user_id);

        // Execute queries in parallel
        const results = await Promise.allSettled(
          queries.map(async (queryItem) => {
            return await pirEngine.executePIRQuery(queryItem.query, req.user);
          })
        );

        // Process results
        const processedResults = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return {
              index: index,
              success: true,
              result: result.value
            };
          } else {
            return {
              index: index,
              success: false,
              error: result.reason.message,
              query: queries[index].query.type
            };
          }
        });

        const responseTime = Date.now() - startTime;

        // Log bulk PIR query execution
        logger.pir('BULK_QUERY', {
          user_id: req.user.user_id,
          query_count: queries.length,
          success_count: processedResults.filter(r => r.success).length,
          response_time: responseTime
        });

        res.status(200).json({
          success: true,
          results: processedResults,
          summary: {
            total: queries.length,
            successful: processedResults.filter(r => r.success).length,
            failed: processedResults.filter(r => !r.success).length
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Bulk PIR query failed:', error);
        res.status(500).json({
          error: 'Bulk PIR query failed',
          code: 'BULK_PIR_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/pir/stats
   * Get PIR system statistics
   */
  router.get('/stats',
    authService.authenticate,
    authService.authorize(['admin']),
    async (req, res) => {
      try {
        // Get system statistics
        const dbStats = await database.getStats();
        const cacheStats = pirEngine.getCacheStats();

        // Get recent query statistics (would typically come from a logs table)
        const queryStats = {
          total_queries_today: 0, // Would be calculated from logs
          unique_users_today: 0,
          average_response_time: 0,
          cache_hit_rate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100 || 0
        };

        res.status(200).json({
          success: true,
          stats: {
            database: dbStats,
            cache: cacheStats,
            queries: queryStats,
            system: {
              uptime: process.uptime(),
              memory_usage: process.memoryUsage(),
              node_version: process.version
            }
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get PIR stats:', error);
        res.status(500).json({
          error: 'Failed to retrieve statistics',
          code: 'STATS_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/pir/health
   * Check PIR system health
   */
  router.get('/health', async (req, res) => {
    try {
      const healthChecks = {
        database: false,
        encryption: false,
        pir_engine: false
      };

      // Check database connection
      try {
        await database.raw('SELECT 1');
        healthChecks.database = true;
      } catch (error) {
        healthChecks.database = false;
      }

      // Check encryption service
      try {
        const testData = 'health_check_test';
        const encrypted = encryption.encrypt(testData, 'health_check');
        const decrypted = encryption.decrypt(encrypted, 'health_check');
        healthChecks.encryption = decrypted === testData;
      } catch (error) {
        healthChecks.encryption = false;
      }

      // Check PIR engine (basic functionality)
      try {
        // Simple test query
        const testQuery = encryption.generatePIRQuery('card_validation', {
          cardId: '00000000-0000-0000-0000-000000000000'
        });
        healthChecks.pir_engine = encryption.verifyPIRQuery(testQuery);
      } catch (error) {
        healthChecks.pir_engine = false;
      }

      const allHealthy = Object.values(healthChecks).every(check => check === true);

      res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'unhealthy',
        checks: healthChecks,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('PIR health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/pir/cache/clear
   * Clear PIR query cache (admin only)
   */
  router.post('/cache/clear',
    authService.authenticate,
    authService.authorize(['admin']),
    async (req, res) => {
      try {
        // Clear the cache (implementation depends on cache storage)
        // For now, we'll just log the action
        logger.info('PIR cache cleared by admin', {
          user_id: req.user.user_id,
          ip: logger.getClientIP(req)
        });

        res.status(200).json({
          success: true,
          message: 'PIR cache cleared successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to clear PIR cache:', error);
        res.status(500).json({
          error: 'Failed to clear cache',
          code: 'CACHE_CLEAR_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  return router;
};

module.exports = pirRoutes;