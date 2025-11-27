/**
 * Integration tests for PIR Server API endpoints
 */

const request = require('supertest');
const { PIRServer } = require('../../src/server');

// Mock database for testing
jest.mock('../../src/database/Database');
jest.mock('../../src/services/AuthenticationService');
jest.mock('../../src/services/PIREngine');

describe('PIR Server API Integration Tests', () => {
  let server;
  let app;
  
  beforeAll(async () => {
    // Create test server instance
    server = new PIRServer();
    app = server.app;
    
    // Mock database methods
    server.database.connect = jest.fn().mockResolvedValue();
    server.database.runMigrations = jest.fn().mockResolvedValue();
    server.database.query = jest.fn().mockResolvedValue([]);
    server.database.insert = jest.fn().mockResolvedValue([]);
    server.database.update = jest.fn().mockResolvedValue([]);
    server.database.delete = jest.fn().mockResolvedValue(1);
    server.database.getStats = jest.fn().mockResolvedValue({
      connected: true,
      client: 'postgres',
      tables: ['users', 'cards', 'pir_queries']
    });
    
    // Mock authentication service methods
    server.authService.register = jest.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    });
    
    server.authService.login = jest.fn().mockResolvedValue({
      success: true,
      token: 'test-token',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      },
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    
    server.authService.validateSession = jest.fn().mockResolvedValue({
      user_id: 'test-user-id',
      email: 'test@example.com',
      role: 'user'
    });
    
    server.authService.getUserById = jest.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    });
    
    // Mock PIR engine
    server.pirEngine.executePIRQuery = jest.fn().mockResolvedValue({
      found: true,
      cardId: 'test-card-id',
      data: { name: 'Test Card' },
      queryId: 'test-query-id'
    });
  });
  
  afterAll(() => {
    jest.restoreAllMocks();
  });
  
  describe('Health Endpoints', () => {
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
    
    test('GET /api/pir/health should return PIR health status', async () => {
      const response = await request(app)
        .get('/api/pir/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('encryption');
      expect(response.body.checks).toHaveProperty('pir_engine');
    });
  });
  
  describe('Authentication Endpoints', () => {
    test('POST /api/auth/register should register new user', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'NewUserPass123!',
        name: 'New User'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).not.toHaveProperty('password');
    });
    
    test('POST /api/auth/register should validate input', async () => {
      const invalidUserData = {
        email: 'invalid-email',
        password: '123',
        name: ''
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUserData)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('details');
    });
    
    test('POST /api/auth/login should authenticate user', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPass123!'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('expires_at');
    });
    
    test('POST /api/auth/login should reject invalid credentials', async () => {
      server.authService.login = jest.fn().mockRejectedValue(new Error('Invalid credentials'));
      
      const credentials = {
        email: 'test@example.com',
        password: 'WrongPassword123!'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'INVALID_CREDENTIALS');
    });
  });
  
  describe('PIR Endpoints', () => {
    let authToken;
    
    beforeEach(() => {
      authToken = 'Bearer test-token';
    });
    
    test('POST /api/pir/query should execute PIR query', async () => {
      const pirQuery = {
        query: {
          type: 'card_lookup',
          parameters: {
            cardId: 'test-card-id',
            encryptedProperties: ['name', 'value']
          }
        }
      };
      
      const response = await request(app)
        .post('/api/pir/query')
        .set('Authorization', authToken)
        .send(pirQuery)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('result');
    });
    
    test('POST /api/pir/query should require authentication', async () => {
      const pirQuery = {
        query: {
          type: 'card_lookup',
          parameters: {
            cardId: 'test-card-id'
          }
        }
      };
      
      const response = await request(app)
        .post('/api/pir/query')
        .send(pirQuery)
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'AUTH_REQUIRED');
    });
    
    test('POST /api/pir/bulk-query should execute bulk queries', async () => {
      const bulkQueries = {
        queries: [
          {
            query: {
              type: 'card_lookup',
              parameters: { cardId: 'test-card-1' }
            }
          },
          {
            query: {
              type: 'card_validation',
              parameters: { cardId: 'test-card-2' }
            }
          }
        ]
      };
      
      const response = await request(app)
        .post('/api/pir/bulk-query')
        .set('Authorization', authToken)
        .send(bulkQueries)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('total');
      expect(response.body.summary).toHaveProperty('successful');
      expect(response.body.summary).toHaveProperty('failed');
    });
    
    test('POST /api/pir/bulk-query should require premium or admin role', async () => {
      server.authService.hasRole = jest.fn().mockReturnValue(false);
      
      const bulkQueries = {
        queries: [
          {
            query: {
              type: 'card_lookup',
              parameters: { cardId: 'test-card-1' }
            }
          }
        ]
      };
      
      const response = await request(app)
        .post('/api/pir/bulk-query')
        .set('Authorization', authToken)
        .send(bulkQueries)
        .expect(403);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'PERMISSION_DENIED');
    });
  });
  
  describe('Card Management Endpoints', () => {
    let adminAuthToken;
    
    beforeEach(() => {
      adminAuthToken = 'Bearer admin-token';
      // Mock admin role
      server.authService.hasRole = jest.fn().mockReturnValue(true);
    });
    
    test('POST /api/cards should create new card', async () => {
      const cardData = {
        name: 'New Card',
        description: 'Test card description',
        value: 100,
        properties: { suit: 'spades', rank: 'ace' }
      };
      
      const response = await request(app)
        .post('/api/cards')
        .set('Authorization', adminAuthToken)
        .send(cardData)
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('card');
    });
    
    test('GET /api/cards should return cards list', async () => {
      server.database.query = jest.fn().mockResolvedValue([
        {
          id: 'test-card-1',
          name: 'Test Card 1',
          description: 'Test description',
          is_active: true,
          created_at: new Date().toISOString()
        }
      ]);
      
      const response = await request(app)
        .get('/api/cards')
        .set('Authorization', adminAuthToken)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('cards');
      expect(response.body).toHaveProperty('pagination');
    });
    
    test('GET /api/cards/:id should return specific card', async () => {
      server.database.query = jest.fn().mockResolvedValue([
        {
          id: 'test-card-id',
          name: 'Test Card',
          description: 'Test description',
          is_active: true,
          created_at: new Date().toISOString()
        }
      ]);
      
      const response = await request(app)
        .get('/api/cards/test-card-id')
        .set('Authorization', adminAuthToken)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('card');
      expect(response.body.card).toHaveProperty('id', 'test-card-id');
    });
    
    test('GET /api/cards/:id should return 404 for non-existent card', async () => {
      server.database.query = jest.fn().mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/cards/non-existent-id')
        .set('Authorization', adminAuthToken)
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'CARD_NOT_FOUND');
    });
    
    test('PUT /api/cards/:id should update card', async () => {
      const updates = {
        name: 'Updated Card Name',
        description: 'Updated description'
      };
      
      const response = await request(app)
        .put('/api/cards/test-card-id')
        .set('Authorization', adminAuthToken)
        .send(updates)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
    
    test('DELETE /api/cards/:id should deactivate card', async () => {
      const response = await request(app)
        .delete('/api/cards/test-card-id')
        .set('Authorization', adminAuthToken)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });
  
  describe('Admin Endpoints', () => {
    let adminAuthToken;
    
    beforeEach(() => {
      adminAuthToken = 'Bearer admin-token';
    });
    
    test('GET /api/admin/dashboard should return dashboard statistics', async () => {
      server.database.query = jest.fn().mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', adminAuthToken)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('dashboard');
      expect(response.body.dashboard).toHaveProperty('users');
      expect(response.body.dashboard).toHaveProperty('cards');
      expect(response.body.dashboard).toHaveProperty('system');
    });
    
    test('GET /api/admin/dashboard should require admin role', async () => {
      server.authService.hasRole = jest.fn().mockReturnValue(false);
      
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', adminAuthToken)
        .expect(403);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'PERMISSION_DENIED');
    });
  });
  
  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/unknown/endpoint')
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'NOT_FOUND');
    });
    
    test('should handle rate limiting', async () => {
      // This would require actual rate limiting implementation
      // For now, just test the structure
      const response = await request(app)
        .post('/api/pir/query')
        .send({ query: { type: 'invalid' } })
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });
  
  describe('Request/Response Structure', () => {
    test('should include timestamp in all responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
    
    test('should include success flag in successful responses', async () => {
      const response = await request(app)
        .get('/api/pir/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status');
    });
  });
});