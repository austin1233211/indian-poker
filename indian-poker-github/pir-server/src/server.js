const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const { Database } = require('./database/Database');
const { EncryptionService } = require('./services/EncryptionService');
const { AuthenticationService } = require('./services/AuthenticationService');
const { PIREngine } = require('./services/PIREngine');
const { Logger } = require('./utils/Logger');

// Import routes
const authRoutes = require('./routes/auth');
const pirRoutes = require('./routes/pir');
const cardRoutes = require('./routes/cards');
const adminRoutes = require('./routes/admin');

class PIRServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.logger = new Logger();
    
    // Initialize services
    this.database = new Database();
    this.encryption = new EncryptionService();
    this.authService = new AuthenticationService(this.database);
    this.pirEngine = new PIREngine(this.database, this.encryption);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/api/', limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => this.logger.info(message.trim())
      }
    }));

    // Health check endpoint (no rate limiting)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Mount route modules
    this.app.use('/api/auth', authRoutes({
      database: this.database,
      authService: this.authService,
      encryption: this.encryption,
      logger: this.logger
    }));

    this.app.use('/api/pir', pirRoutes({
      database: this.database,
      pirEngine: this.pirEngine,
      encryption: this.encryption,
      authService: this.authService,
      logger: this.logger
    }));

    this.app.use('/api/cards', cardRoutes({
      database: this.database,
      encryption: this.encryption,
      authService: this.authService,
      logger: this.logger
    }));

    this.app.use('/api/admin', adminRoutes({
      database: this.database,
      encryption: this.encryption,
      authService: this.authService,
      logger: this.logger
    }));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Global error handler:', error);

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      if (error.type === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: isDevelopment ? error.message : 'Invalid input data',
          timestamp: new Date().toISOString()
        });
      }

      if (error.type === 'AuthenticationError') {
        return res.status(401).json({
          error: 'Authentication failed',
          code: 'AUTH_ERROR',
          details: isDevelopment ? error.message : 'Invalid credentials',
          timestamp: new Date().toISOString()
        });
      }

      if (error.type === 'AuthorizationError') {
        return res.status(403).json({
          error: 'Authorization failed',
          code: 'PERMISSION_ERROR',
          details: isDevelopment ? error.message : 'Insufficient permissions',
          timestamp: new Date().toISOString()
        });
      }

      // Database errors
      if (error.code && error.code.startsWith('23')) {
        return res.status(400).json({
          error: 'Database constraint violation',
          code: 'DB_CONSTRAINT_ERROR',
          details: isDevelopment ? error.message : 'Invalid data format',
          timestamp: new Date().toISOString()
        });
      }

      // Default server error
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: isDevelopment ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Initialize database and start server
   */
  async start() {
    try {
      // Initialize database connection
      await this.database.connect();
      this.logger.info('Database connected successfully');

      // Run migrations
      await this.database.runMigrations();
      this.logger.info('Database migrations completed');

      // Start server
      this.app.listen(this.port, () => {
        this.logger.info(`PIR Server running on port ${this.port}`);
        this.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        this.logger.info(`Health check: http://localhost:${this.port}/health`);
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down PIR Server...');
    
    try {
      await this.database.disconnect();
      this.logger.info('Database disconnected');
    } catch (error) {
      this.logger.error('Error during database disconnect:', error);
    }
    
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// Start server if this file is run directly
if (require.main === module) {
  const server = new PIRServer();
  server.start();
}

module.exports = { PIRServer };