const winston = require('winston');
const path = require('path');

/**
 * Logger utility for PIR Server
 * Centralized logging with different levels and formats
 */
class Logger {
  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: 'pir-server',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      },
      transports: this.createTransports(),
      exceptionHandlers: this.createExceptionHandlers(),
      rejectionHandlers: this.createRejectionHandlers()
    });

    // Add request context for correlation
    this.requestContext = new Map();
  }

  /**
   * Create logging transports
   */
  createTransports() {
    const transports = [];

    // Console transport for development
    if (process.env.NODE_ENV !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    // File transport for all environments
    const logDir = process.env.LOG_DIR || './logs';
    
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: winston.format.json()
      })
    );

    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: winston.format.json()
      })
    );

    // Security-specific log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'security.log'),
        level: 'warn',
        maxsize: 5242880, // 5MB
        maxFiles: 10,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );

    // PIR-specific log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'pir.log'),
        level: 'info',
        maxsize: 5242880, // 5MB
        maxFiles: 10,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );

    return transports;
  }

  /**
   * Create exception handlers
   */
  createExceptionHandlers() {
    const logDir = process.env.LOG_DIR || './logs';
    
    return [
      new winston.transports.File({
        filename: path.join(logDir, 'exceptions.log'),
        maxsize: 5242880,
        maxFiles: 5
      })
    ];
  }

  /**
   * Create rejection handlers
   */
  createRejectionHandlers() {
    const logDir = process.env.LOG_DIR || './logs';
    
    return [
      new winston.transports.File({
        filename: path.join(logDir, 'rejections.log'),
        maxsize: 5242880,
        maxFiles: 5
      })
    ];
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, this.addContext(meta));
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|object} error - Error object or metadata
   */
  error(message, error = null) {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        ...this.addContext()
      });
    } else {
      this.logger.error(message, this.addContext(error));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, this.addContext(meta));
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, this.addContext(meta));
  }

  /**
   * Log security event
   * @param {string} event - Security event type
   * @param {object} details - Event details
   */
  security(event, details = {}) {
    this.logger.warn(`SECURITY: ${event}`, {
      security_event: event,
      timestamp: new Date().toISOString(),
      ...this.addContext(details)
    });
  }

  /**
   * Log PIR query
   * @param {string} queryType - Query type
   * @param {object} details - Query details
   */
  pir(queryType, details = {}) {
    this.logger.info(`PIR_QUERY: ${queryType}`, {
      pir_query: queryType,
      timestamp: new Date().toISOString(),
      ...this.addContext(details)
    });
  }

  /**
   * Log database operation
   * @param {string} operation - Database operation
   * @param {object} details - Operation details
   */
  database(operation, details = {}) {
    this.logger.info(`DB_OPERATION: ${operation}`, {
      db_operation: operation,
      timestamp: new Date().toISOString(),
      ...this.addContext(details)
    });
  }

  /**
   * Log authentication event
   * @param {string} event - Auth event type
   * @param {object} details - Event details
   */
  auth(event, details = {}) {
    this.logger.info(`AUTH: ${event}`, {
      auth_event: event,
      timestamp: new Date().toISOString(),
      ...this.addContext(details)
    });
  }

  /**
   * Log API request
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {number} responseTime - Response time in ms
   */
  request(req, res, responseTime) {
    this.logger.info('API_REQUEST', {
      method: req.method,
      url: req.url,
      user_agent: req.get('User-Agent'),
      ip: this.getClientIP(req),
      user_id: req.user?.id,
      status_code: res.statusCode,
      response_time: responseTime,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Add request context to metadata
   * @param {object} meta - Additional metadata
   * @returns {object} Enhanced metadata with context
   */
  addContext(meta = {}) {
    const context = {
      request_id: this.requestContext.get('request_id'),
      user_id: this.requestContext.get('user_id'),
      session_id: this.requestContext.get('session_id'),
      ...meta
    };

    // Remove undefined values
    Object.keys(context).forEach(key => {
      if (context[key] === undefined) {
        delete context[key];
      }
    });

    return context;
  }

  /**
   * Set request context for correlation
   * @param {string} key - Context key
   * @param {string} value - Context value
   */
  setContext(key, value) {
    this.requestContext.set(key, value);
  }

  /**
   * Clear request context
   */
  clearContext() {
    this.requestContext.clear();
  }

  /**
   * Get client IP address from request
   * @param {object} req - Express request object
   * @returns {string} Client IP address
   */
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown';
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {object} meta - Additional metadata
   */
  performance(operation, duration, meta = {}) {
    this.logger.info(`PERFORMANCE: ${operation}`, {
      operation,
      duration,
      performance_metric: true,
      ...this.addContext(meta)
    });
  }

  /**
   * Log system metrics
   * @param {object} metrics - System metrics
   */
  metrics(metrics) {
    this.logger.info('SYSTEM_METRICS', {
      ...metrics,
      metric_type: 'system',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create child logger with additional context
   * @param {object} context - Context to add
   * @returns {Logger} Child logger instance
   */
  child(context) {
    const childLogger = new Logger();
    // Merge contexts
    for (const [key, value] of this.requestContext.entries()) {
      childLogger.requestContext.set(key, value);
    }
    for (const [key, value] of Object.entries(context)) {
      childLogger.requestContext.set(key, value);
    }
    return childLogger;
  }

  /**
   * Flush logs (useful for testing)
   */
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

module.exports = { Logger };