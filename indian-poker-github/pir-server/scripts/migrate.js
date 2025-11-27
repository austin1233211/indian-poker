#!/usr/bin/env node

/**
 * Database Migration Runner
 * Runs pending database migrations for PIR Server
 */

const fs = require('fs');
const path = require('path');
const knex = require('knex');

// Load environment variables
require('dotenv').config();

/**
 * Get database configuration
 */
function getDatabaseConfig() {
  const client = process.env.DB_CLIENT || 'postgres';
  
  if (client === 'postgres') {
    return {
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'pir_server',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      },
      migrations: {
        directory: './migrations',
        tableName: 'knex_migrations'
      }
    };
  }
  
  if (client === 'sqlite') {
    return {
      client: 'sqlite3',
      connection: {
        filename: process.env.DB_PATH || './data/pir_server.db'
      },
      migrations: {
        directory: './migrations',
        tableName: 'knex_migrations'
      },
      useNullAsDefault: true
    };
  }
  
  throw new Error(`Unsupported database client: ${client}`);
}

/**
 * Get migration status
 */
async function getMigrationStatus(knexClient) {
  try {
    const migrations = await knexClient.migrate.currentVersion();
    const completedMigrations = await knexClient.migrate.currentVersion();
    
    console.log(`Current migration: ${completedMigrations || 'None'}`);
    
    // Get list of migration files
    const migrationFiles = fs.readdirSync('./migrations')
      .filter(file => file.endsWith('.js'))
      .sort();
    
    console.log(`Available migrations: ${migrationFiles.length}`);
    
    return {
      current: completedMigrations,
      files: migrationFiles
    };
  } catch (error) {
    console.error('Error getting migration status:', error.message);
    return null;
  }
}

/**
 * Run migrations
 */
async function runMigrations() {
  const config = getDatabaseConfig();
  const knexClient = knex(config);
  
  try {
    console.log('🔄 Running database migrations...\n');
    
    // Check connection
    await knexClient.raw('SELECT 1');
    console.log('✅ Database connection established');
    
    // Get current status
    const status = await getMigrationStatus(knexClient);
    if (!status) {
      throw new Error('Failed to get migration status');
    }
    
    // Run migrations
    const [batchNo, migrations] = await knexClient.migrate.latest();
    
    if (migrations.length === 0) {
      console.log('ℹ️  No new migrations to run');
    } else {
      console.log(`✅ Completed migration batch: ${batchNo}`);
      migrations.forEach(migration => {
        console.log(`   📄 ${migration}`);
      });
    }
    
    // Get final status
    const finalStatus = await getMigrationStatus(knexClient);
    console.log(`\n🎉 Migrations completed successfully!`);
    console.log(`Current version: ${finalStatus.current || 'None'}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await knexClient.destroy();
  }
}

/**
 * Rollback migrations
 */
async function rollbackMigrations() {
  const config = getDatabaseConfig();
  const knexClient = knex(config);
  
  try {
    console.log('🔄 Rolling back database migrations...\n');
    
    // Check connection
    await knexClient.raw('SELECT 1');
    console.log('✅ Database connection established');
    
    // Rollback migrations
    const [batchNo, migrations] = await knexClient.migrate.rollback();
    
    if (migrations.length === 0) {
      console.log('ℹ️  No migrations to rollback');
    } else {
      console.log(`✅ Rolled back migration batch: ${batchNo}`);
      migrations.forEach(migration => {
        console.log(`   📄 ${migration}`);
      });
    }
    
    console.log('\n🎉 Rollback completed successfully!');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    await knexClient.destroy();
  }
}

/**
 * Seed database
 */
async function seedDatabase() {
  const config = getDatabaseConfig();
  const knexClient = knex(config);
  
  try {
    console.log('🌱 Seeding database...\n');
    
    // Check connection
    await knexClient.raw('SELECT 1');
    console.log('✅ Database connection established');
    
    // Run seeds
    await knexClient.seed.run();
    
    console.log('\n🎉 Database seeded successfully!');
    console.log('\nDefault credentials:');
    console.log('  👤 Admin: admin@pirserver.com / AdminPass123!');
    console.log('  ⭐ Premium: premium@pirserver.com / PremiumPass123!');
    console.log('  🔹 User: user@pirserver.com / UserPass123!');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await knexClient.destroy();
  }
}

/**
 * Show migration status
 */
async function showStatus() {
  const config = getDatabaseConfig();
  const knexClient = knex(config);
  
  try {
    console.log('📊 Migration Status\n');
    
    // Check connection
    await knexClient.raw('SELECT 1');
    console.log('✅ Database connection established\n');
    
    const status = await getMigrationStatus(knexClient);
    if (status) {
      console.log(`Current migration: ${status.current || 'None'}`);
      console.log(`Available migrations: ${status.files.length}`);
      
      if (status.files.length > 0) {
        console.log('\nMigration files:');
        status.files.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to get status:', error.message);
    process.exit(1);
  } finally {
    await knexClient.destroy();
  }
}

/**
 * Create a new migration file
 */
function createMigration() {
  const args = process.argv.slice(3);
  const name = args[0];
  
  if (!name) {
    console.error('❌ Migration name is required');
    console.log('Usage: npm run migrate:make <migration_name>');
    process.exit(1);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${timestamp}_${name}.js`;
  const filepath = path.join('./migrations', filename);
  
  const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

exports.up = async function(knex) {
  // Add your migration logic here
  
  console.log('Running migration: ${name}');
};

exports.down = async function(knex) {
  // Add your rollback logic here
  
  console.log('Rolling back migration: ${name}');
};`;
  
  // Ensure migrations directory exists
  if (!fs.existsSync('./migrations')) {
    fs.mkdirSync('./migrations', { recursive: true });
  }
  
  fs.writeFileSync(filepath, template);
  console.log(`✅ Created migration file: ${filename}`);
}

// Main CLI interface
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'run':
    case 'latest':
      await runMigrations();
      break;
      
    case 'rollback':
    case 'down':
      await rollbackMigrations();
      break;
      
    case 'seed':
      await seedDatabase();
      break;
      
    case 'status':
    case 'list':
      await showStatus();
      break;
      
    case 'make':
      createMigration();
      break;
      
    default:
      console.log(`
PIR Server Database Migration Tool

Usage:
  npm run migrate              Run pending migrations
  npm run migrate:rollback     Rollback last migration batch
  npm run migrate:seed         Seed database with initial data
  npm run migrate:status       Show migration status
  npm run migrate:make <name>  Create new migration file

Commands:
  run, latest    Run pending migrations
  rollback, down Rollback migrations
  seed           Seed database
  status, list   Show status
  make           Create migration file
      `);
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Migration tool failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runMigrations,
  rollbackMigrations,
  seedDatabase,
  showStatus
};