/**
 * Seed database with initial data
 */
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Clear existing data
  await knex('audit_logs').del();
  await knex('sessions').del();
  await knex('pir_queries').del();
  await knex('cards').del();
  await knex('users').del();
  await knex('rate_limits').del();
  await knex('system_config').del();

  // Create admin user
  const adminPassword = await bcrypt.hash('AdminPass123!', 12);
  const adminUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@pirserver.com',
    password: adminPassword,
    name: 'System Administrator',
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await knex('users').insert(adminUser);

  // Create premium user
  const premiumPassword = await bcrypt.hash('PremiumPass123!', 12);
  const premiumUser = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'premium@pirserver.com',
    password: premiumPassword,
    name: 'Premium User',
    role: 'premium',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await knex('users').insert(premiumUser);

  // Create regular user
  const userPassword = await bcrypt.hash('UserPass123!', 12);
  const regularUser = {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'user@pirserver.com',
    password: userPassword,
    name: 'Regular User',
    role: 'user',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await knex('users').insert(regularUser);

  // Create sample cards
  const sampleCards = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Ace of Spades',
      description: 'The highest card in many card games, featuring the spade symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'King of Hearts',
      description: 'The king card with the heart symbol, known as the suicide king.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Queen of Diamonds',
      description: 'The queen card with the diamond symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Jack of Clubs',
      description: 'The jack card with the club symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: '10 of Hearts',
      description: 'The number 10 card with the heart symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000006',
      name: '9 of Spades',
      description: 'The number 9 card with the spade symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000007',
      name: '8 of Clubs',
      description: 'The number 8 card with the club symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000008',
      name: '7 of Diamonds',
      description: 'The number 7 card with the diamond symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000009',
      name: '6 of Hearts',
      description: 'The number 6 card with the heart symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '10000000-0000-0000-0000-000000000010',
      name: '5 of Spades',
      description: 'The number 5 card with the spade symbol.',
      created_by: adminUser.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  await knex('cards').insert(sampleCards);

  // Create system configuration
  const systemConfigs = [
    {
      key: 'pir_query_limit_per_minute',
      value: '60',
      description: 'Maximum PIR queries per user per minute',
      data_type: 'number',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      key: 'pir_cache_enabled',
      value: 'true',
      description: 'Enable PIR query result caching',
      data_type: 'boolean',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      key: 'max_login_attempts',
      value: '5',
      description: 'Maximum failed login attempts before account lockout',
      data_type: 'number',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      key: 'lockout_minutes',
      value: '15',
      description: 'Account lockout duration in minutes',
      data_type: 'number',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      key: 'session_timeout_hours',
      value: '24',
      description: 'Session timeout in hours',
      data_type: 'number',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      key: 'encryption_algorithm',
      value: 'aes-256-gcm',
      description: 'Encryption algorithm used for sensitive data',
      data_type: 'string',
      is_encrypted: false,
      is_sensitive: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  await knex('system_config').insert(systemConfigs);

  // Create sample audit logs
  const auditLogs = [
    {
      user_id: adminUser.id,
      action: 'CREATE',
      resource_type: 'CARD',
      resource_id: sampleCards[0].id,
      new_values: JSON.stringify({ name: sampleCards[0].name }),
      ip_address: '127.0.0.1',
      user_agent: 'PIR-Server/1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      user_id: adminUser.id,
      action: 'CREATE',
      resource_type: 'USER',
      resource_id: premiumUser.id,
      new_values: JSON.stringify({ email: premiumUser.email, role: premiumUser.role }),
      ip_address: '127.0.0.1',
      user_agent: 'PIR-Server/1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      user_id: adminUser.id,
      action: 'CREATE',
      resource_type: 'USER',
      resource_id: regularUser.id,
      new_values: JSON.stringify({ email: regularUser.email, role: regularUser.role }),
      ip_address: '127.0.0.1',
      user_agent: 'PIR-Server/1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  await knex('audit_logs').insert(auditLogs);

  console.log('Database seeded successfully');
  console.log('Created users:');
  console.log('- Admin: admin@pirserver.com (password: AdminPass123!)');
  console.log('- Premium: premium@pirserver.com (password: PremiumPass123!)');
  console.log('- User: user@pirserver.com (password: UserPass123!)');
  console.log(`Created ${sampleCards.length} sample cards`);
  console.log('System configuration and audit logs initialized');
};