/**
 * Create initial database schema for PIR Server
 * Supports both PostgreSQL and SQLite
 */

exports.up = async function(knex) {
  // Detect database client
  const client = knex.client.config.client;
  const isSqlite = client === 'sqlite' || client === 'sqlite3' || client === 'better-sqlite3';
  
  // Helper function for UUID default
  const uuidDefault = isSqlite ? undefined : knex.raw('gen_random_uuid()');
  
  // Create users table
  await knex.schema.createTable('users', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.string('email', 255).unique().notNullable();
    table.string('password', 255).notNullable(); // Hashed password
    table.string('name', 100).notNullable();
    // SQLite doesn't support enum with CHECK constraint the same way
    if (isSqlite) {
      table.string('role', 50).notNullable().defaultTo('user');
    } else {
      table.enum('role', ['user', 'premium', 'admin']).notNullable().defaultTo('user');
    }
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('login_attempts').notNullable().defaultTo(0);
    table.timestamp('last_login');
    table.timestamps(true, true);
    
    // Indexes
    table.index(['email']);
    table.index(['role']);
    table.index(['is_active']);
    table.index(['created_at']);
  });

  // Create cards table
  await knex.schema.createTable('cards', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.string('name', 200).notNullable();
    table.text('description');
    table.text('value'); // Encrypted value
    table.text('properties'); // Encrypted JSON properties
    table.text('metadata'); // Encrypted JSON metadata
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['name']);
    table.index(['is_active']);
    table.index(['created_at']);
    table.index(['created_by']);
  });

  // Create PIR queries log table
  await knex.schema.createTable('pir_queries', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('query_type', 50).notNullable(); // card_lookup, card_search, etc.
    // Use json for SQLite, jsonb for PostgreSQL
    if (isSqlite) {
      table.json('query_parameters').notNullable();
      table.json('query_result'); // Encrypted or hashed result
    } else {
      table.jsonb('query_parameters').notNullable();
      table.jsonb('query_result'); // Encrypted or hashed result
    }
    table.integer('response_time_ms'); // Query execution time
    table.string('client_ip', 45); // IPv6 can be up to 45 chars
    table.string('user_agent', 500);
    table.boolean('success').notNullable().defaultTo(true);
    table.text('error_message');
    table.timestamps(true, true);
    
    // Indexes
    table.index(['user_id']);
    table.index(['query_type']);
    table.index(['created_at']);
    table.index(['success']);
  });

  // Create sessions table for tracking active sessions
  await knex.schema.createTable('sessions', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('token', 255).unique().notNullable();
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamp('expires_at').notNullable();
    table.timestamp('last_activity').notNullable().defaultTo(knex.fn.now());
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['user_id']);
    table.index(['token']);
    table.index(['expires_at']);
    table.index(['is_active']);
  });

  // Create audit logs table
  await knex.schema.createTable('audit_logs', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable(); // CREATE, UPDATE, DELETE, LOGIN, etc.
    table.string('resource_type', 50).notNullable(); // USER, CARD, etc.
    table.uuid('resource_id'); // ID of the affected resource
    // Use json for SQLite, jsonb for PostgreSQL
    if (isSqlite) {
      table.json('old_values'); // Previous values (for updates/deletes)
      table.json('new_values'); // New values (for creates/updates)
    } else {
      table.jsonb('old_values'); // Previous values (for updates/deletes)
      table.jsonb('new_values'); // New values (for creates/updates)
    }
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['user_id']);
    table.index(['action']);
    table.index(['resource_type']);
    table.index(['resource_id']);
    table.index(['created_at']);
  });

  // Create rate limiting table
  await knex.schema.createTable('rate_limits', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.string('identifier', 255).notNullable(); // IP address or user ID
    table.string('endpoint', 200).notNullable();
    table.integer('request_count').notNullable().defaultTo(1);
    table.timestamp('window_start').notNullable();
    table.timestamp('reset_at').notNullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['identifier', 'endpoint']);
    table.index(['reset_at']);
  });

  // Create system configuration table
  await knex.schema.createTable('system_config', (table) => {
    if (isSqlite) {
      table.uuid('id').primary();
    } else {
      table.uuid('id').primary().defaultTo(uuidDefault);
    }
    table.string('key', 100).unique().notNullable();
    table.text('value'); // Encrypted sensitive values
    table.text('description');
    table.string('data_type', 20).notNullable().defaultTo('string'); // string, number, boolean, json
    table.boolean('is_encrypted').notNullable().defaultTo(false);
    table.boolean('is_sensitive').notNullable().defaultTo(false);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['key']);
    table.index(['is_sensitive']);
  });

  // Create indexes for better query performance (PostgreSQL only - uses CONCURRENTLY and partial indexes)
  if (!isSqlite) {
    await knex.schema.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_active_name 
      ON cards (is_active, name) WHERE is_active = true;
    `);

    await knex.schema.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pir_queries_user_date 
      ON pir_queries (user_id, created_at);
    `);

    await knex.schema.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource_date 
      ON audit_logs (resource_type, resource_id, created_at);
    `);
  } else {
    // SQLite-compatible indexes (without CONCURRENTLY and partial index syntax)
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_cards_active_name 
      ON cards (is_active, name);
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_pir_queries_user_date 
      ON pir_queries (user_id, created_at);
    `);

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_date 
      ON audit_logs (resource_type, resource_id, created_at);
    `);
  }

  console.log('Database schema created successfully');
};

exports.down = async function(knex) {
  // Drop tables in reverse order (respecting foreign key constraints)
  await knex.schema.dropTableIfExists('system_config');
  await knex.schema.dropTableIfExists('rate_limits');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('pir_queries');
  await knex.schema.dropTableIfExists('cards');
  await knex.schema.dropTableIfExists('users');
  
  console.log('Database schema dropped successfully');
};
