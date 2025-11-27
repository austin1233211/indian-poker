/**
 * PIR Server Client SDK
 * JavaScript/TypeScript client library for integrating with PIR Server
 */

class PIRClient {
  /**
   * Initialize PIR Client
   * @param {Object} options - Configuration options
   * @param {string} options.baseURL - PIR Server base URL
   * @param {string} options.apiKey - API key (optional)
   * @param {Object} options.headers - Additional headers
   * @param {number} options.timeout - Request timeout in milliseconds
   */
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:3000/api';
    this.apiKey = options.apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    this.timeout = options.timeout || 30000;
    
    // Authentication state
    this.token = null;
    this.user = null;
  }

  /**
   * Set authentication token
   * @param {string} token - Authentication token
   */
  setToken(token) {
    this.token = token;
    this.headers.Authorization = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearToken() {
    this.token = null;
    delete this.headers.Authorization;
  }

  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise} Response
   */
  async request(method, endpoint, data = null) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      method,
      headers: this.headers,
      timeout: this.timeout
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      const result = await response.json();

      if (!response.ok) {
        throw new PIRClientError(result.error || 'Request failed', result.code, result);
      }

      return result;
    } catch (error) {
      if (error instanceof PIRClientError) {
        throw error;
      }
      throw new PIRClientError(`Network error: ${error.message}`, 'NETWORK_ERROR');
    }
  }

  /**
   * Authentication Methods
   */

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise} Registration result
   */
  async register(userData) {
    const result = await this.request('POST', '/auth/register', userData);
    return result;
  }

  /**
   * Login user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} Login result with token
   */
  async login(email, password) {
    const result = await this.request('POST', '/auth/login', { email, password });
    
    if (result.success && result.token) {
      this.setToken(result.token);
      this.user = result.user;
    }
    
    return result;
  }

  /**
   * Logout user
   * @returns {Promise} Logout result
   */
  async logout() {
    try {
      const result = await this.request('POST', '/auth/logout');
      this.clearToken();
      this.user = null;
      return result;
    } catch (error) {
      // Clear token even if logout request fails
      this.clearToken();
      this.user = null;
      throw error;
    }
  }

  /**
   * Get current user information
   * @returns {Promise} User information
   */
  async getCurrentUser() {
    const result = await this.request('GET', '/auth/me');
    this.user = result.user;
    return result;
  }

  /**
   * Refresh authentication token
   * @returns {Promise} Refresh result with new token
   */
  async refreshToken() {
    const result = await this.request('POST', '/auth/refresh');
    
    if (result.success && result.token) {
      this.setToken(result.token);
    }
    
    return result;
  }

  /**
   * Change password
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise} Password change result
   */
  async changePassword(currentPassword, newPassword) {
    return await this.request('POST', '/auth/change-password', {
      currentPassword,
      newPassword
    });
  }

  /**
   * PIR Query Methods
   */

  /**
   * Execute PIR card lookup query
   * @param {string} cardId - Card ID to lookup
   * @param {Array} encryptedProperties - Properties to decrypt
   * @returns {Promise} Lookup result
   */
  async lookupCard(cardId, encryptedProperties = []) {
    const query = {
      type: 'card_lookup',
      parameters: {
        cardId,
        encryptedProperties
      }
    };

    return await this.request('POST', '/pir/query', { query });
  }

  /**
   * Execute PIR card search query
   * @param {Object} searchCriteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise} Search results
   */
  async searchCards(searchCriteria, options = {}) {
    const query = {
      type: 'card_search',
      parameters: {
        searchCriteria,
        maxResults: options.maxResults || 10,
        properties: options.properties || [],
        privacyLevel: options.privacyLevel || 'basic'
      }
    };

    return await this.request('POST', '/pir/query', { query });
  }

  /**
   * Execute PIR card statistics query
   * @param {string} statType - Statistics type
   * @param {Object} filters - Filter parameters
   * @returns {Promise} Statistics result
   */
  async getCardStats(statType, filters = {}) {
    const query = {
      type: 'card_stats',
      parameters: {
        statType,
        filters,
        privacyLevel: 'aggregate'
      }
    };

    return await this.request('POST', '/pir/query', { query });
  }

  /**
   * Execute PIR card validation query
   * @param {string} cardId - Card ID to validate
   * @param {string} validationType - Validation type
   * @returns {Promise} Validation result
   */
  async validateCard(cardId, validationType = 'existence') {
    const query = {
      type: 'card_validation',
      parameters: {
        cardId,
        validationType
      }
    };

    return await this.request('POST', '/pir/query', { query });
  }

  /**
   * Execute bulk PIR queries
   * @param {Array} queries - Array of PIR queries
   * @returns {Promise} Bulk query results
   */
  async bulkQuery(queries) {
    return await this.request('POST', '/pir/bulk-query', { queries });
  }

  /**
   * Card Management Methods (Admin only)
   */

  /**
   * Create new card
   * @param {Object} cardData - Card data
   * @returns {Promise} Created card
   */
  async createCard(cardData) {
    return await this.request('POST', '/cards', cardData);
  }

  /**
   * Get cards list
   * @param {Object} filters - Filters and pagination
   * @returns {Promise} Cards list
   */
  async getCards(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request('GET', `/cards?${params.toString()}`);
  }

  /**
   * Get card by ID
   * @param {string} cardId - Card ID
   * @returns {Promise} Card data
   */
  async getCard(cardId) {
    return await this.request('GET', `/cards/${cardId}`);
  }

  /**
   * Update card
   * @param {string} cardId - Card ID
   * @param {Object} updates - Card updates
   * @returns {Promise} Update result
   */
  async updateCard(cardId, updates) {
    return await this.request('PUT', `/cards/${cardId}`, updates);
  }

  /**
   * Delete/deactivate card
   * @param {string} cardId - Card ID
   * @param {boolean} hardDelete - Hard delete flag
   * @returns {Promise} Deletion result
   */
  async deleteCard(cardId, hardDelete = false) {
    const params = new URLSearchParams({ hard_delete: hardDelete.toString() });
    return await this.request('DELETE', `/cards/${cardId}?${params.toString()}`);
  }

  /**
   * Restore deactivated card
   * @param {string} cardId - Card ID
   * @returns {Promise} Restore result
   */
  async restoreCard(cardId) {
    return await this.request('POST', `/cards/${cardId}/restore`);
  }

  /**
   * Admin Methods
   */

  /**
   * Get dashboard statistics
   * @returns {Promise} Dashboard data
   */
  async getDashboard() {
    return await this.request('GET', '/admin/dashboard');
  }

  /**
   * Get users list
   * @param {Object} filters - Filters and pagination
   * @returns {Promise} Users list
   */
  async getUsers(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request('GET', `/admin/users?${params.toString()}`);
  }

  /**
   * Get user details
   * @param {string} userId - User ID
   * @returns {Promise} User details
   */
  async getUser(userId) {
    return await this.request('GET', `/admin/users/${userId}`);
  }

  /**
   * Update user
   * @param {string} userId - User ID
   * @param {Object} updates - User updates
   * @returns {Promise} Update result
   */
  async updateUser(userId, updates) {
    return await this.request('PUT', `/admin/users/${userId}`, updates);
  }

  /**
   * Reset user password
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @returns {Promise} Reset result
   */
  async resetUserPassword(userId, newPassword) {
    return await this.request('POST', `/admin/users/${userId}/reset-password`, {
      newPassword
    });
  }

  /**
   * System Methods
   */

  /**
   * Check system health
   * @returns {Promise} Health status
   */
  async health() {
    return await this.request('GET', '/health');
  }

  /**
   * Check PIR system health
   * @returns {Promise} PIR health status
   */
  async pirHealth() {
    return await this.request('GET', '/pir/health');
  }

  /**
   * Get PIR statistics
   * @returns {Promise} PIR statistics
   */
  async getPIRStats() {
    return await this.request('GET', '/pir/stats');
  }

  /**
   * Utility Methods
   */

  /**
   * Check if client is authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  /**
   * Get current user
   * @returns {Object} Current user or null
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Generate a test PIR query
   * @param {string} type - Query type
   * @param {Object} parameters - Query parameters
   * @returns {Object} Generated PIR query
   */
  generatePIRQuery(type, parameters = {}) {
    return {
      type,
      parameters,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9)
    };
  }

  /**
   * Validate PIR query format
   * @param {Object} query - Query to validate
   * @returns {boolean} Valid status
   */
  isValidPIRQuery(query) {
    if (!query || typeof query !== 'object') {
      return false;
    }
    
    if (!query.type || !query.parameters || !query.timestamp || !query.nonce) {
      return false;
    }
    
    const validTypes = ['card_lookup', 'card_search', 'card_stats', 'card_validation'];
    if (!validTypes.includes(query.type)) {
      return false;
    }
    
    return true;
  }
}

/**
 * PIR Client Error Class
 */
class PIRClientError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'PIRClientError';
    this.code = code;
    this.details = details;
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PIRClient, PIRClientError };
} else {
  window.PIRClient = PIRClient;
  window.PIRClientError = PIRClientError;
}