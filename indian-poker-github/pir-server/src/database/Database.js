const knex = require('knex');
const fs = require('fs').promises;
const path = require('path');
const { Logger } = require('../utils/Logger');

class Database {
  constructor() {
    this.knex = null;
    this.logger = new Logger();
    this.isConnected = false;
  }

  /**
   * Initialize database connection
   */
  async connect() {
    try {
      // Database configuration from environment
      const config = {
        client: process.env.DB_CLIENT || 'postgres',
        connection: this.getConnectionConfig(),
        pool: {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 60000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100
        },
        migrations: {
          directory: './migrations',
          tableName: 'knex_migrations'
        },
        seeds: {
          directory: './seeds'
        }
      };

      this.knex = knex(config);
      
      // Test connection
      await this.knex.raw('SELECT 1');
      this.isConnected = true;
      
      this.logger.info('Database connection established');
      return this.knex;
      
    } catch (error) {
      this.logger.error('Database connection failed:', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Get database connection configuration
   */
  getConnectionConfig() {
    const client = process.env.DB_CLIENT || 'postgres';
    
    if (client === 'postgres') {
      return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'pir_server',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      };
    }
    
    if (client === 'sqlite') {
      return {
        filename: process.env.DB_PATH || './data/pir_server.db'
      };
    }
    
    throw new Error(`Unsupported database client: ${client}`);
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.knex) {
      await this.knex.destroy();
      this.isConnected = false;
      this.logger.info('Database connection closed');
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    try {
      await this.knex.migrate.latest();
      this.logger.info('Database migrations completed');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback migrations
   */
  async rollbackMigrations() {
    try {
      await this.knex.migrate.rollback();
      this.logger.info('Database migrations rolled back');
    } catch (error) {
      this.logger.error('Migration rollback failed:', error);
      throw error;
    }
  }

  /**
   * Seed database with initial data
   */
  async seedDatabase() {
    try {
      await this.knex.seed.run();
      this.logger.info('Database seeded successfully');
    } catch (error) {
      this.logger.error('Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Generic query method
   */
  async query(table, conditions = {}, options = {}) {
    let query = this.knex(table);
    
    // Apply conditions
    if (conditions.where) {
      query = query.where(conditions.where);
    }
    
    // Apply ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy.column, options.orderBy.direction || 'asc');
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    // Apply offset
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    // Apply select columns
    if (options.select) {
      query = query.select(options.select);
    }
    
    return await query;
  }

  /**
   * Insert record
   */
  async insert(table, data) {
    return await this.knex(table).insert(data).returning('*');
  }

  /**
   * Update records
   */
  async update(table, data, conditions) {
    let query = this.knex(table);
    
    if (conditions.where) {
      query = query.where(conditions.where);
    }
    
    return await query.update(data).returning('*');
  }

  /**
   * Delete records
   */
  async delete(table, conditions) {
    let query = this.knex(table);
    
    if (conditions.where) {
      query = query.where(conditions.where);
    }
    
    return await query.del();
  }

  /**
   * Check if table exists
   */
  async hasTable(tableName) {
    try {
      const result = await this.knex.schema.hasTable(tableName);
      return result;
    } catch (error) {
      this.logger.error(`Error checking table existence for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Create table schema
   */
  async createTable(tableName, schemaBuilder) {
    try {
      await this.knex.schema.createTable(tableName, schemaBuilder);
      this.logger.info(`Table ${tableName} created successfully`);
    } catch (error) {
      this.logger.error(`Error creating table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Drop table
   */
  async dropTable(tableName) {
    try {
      await this.knex.schema.dropTableIfExists(tableName);
      this.logger.info(`Table ${tableName} dropped successfully`);
    } catch (error) {
      this.logger.error(`Error dropping table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const stats = {
        connected: this.isConnected,
        client: this.knex.client.config.client,
        version: await this.knex.raw('SELECT version()').then(r => r.rows[0].version),
        tables: []
      };
      
      // Get list of tables
      if (this.knex.client.config.client === 'postgres') {
        const tables = await this.knex
          .select('table_name')
          .from('information_schema.tables')
          .where('table_schema', 'public')
          .andWhere('table_type', 'BASE TABLE');
        
        stats.tables = tables.map(t => t.table_name);
      }
      
      return stats;
    } catch (error) {
      this.logger.error('Error getting database stats:', error);
      return null;
    }
  }

  /**
   * Execute raw SQL query
   */
  async raw(sql, bindings = []) {
    try {
      return await this.knex.raw(sql, bindings);
    } catch (error) {
      this.logger.error('Raw SQL query failed:', error);
      throw error;
    }
  }

  /**
   * Begin transaction
   */
  async transaction(callback) {
    try {
      return await this.knex.transaction(callback);
    } catch (error) {
      this.logger.error('Transaction failed:', error);
      throw error;
    }
  }
}

module.exports = { Database };