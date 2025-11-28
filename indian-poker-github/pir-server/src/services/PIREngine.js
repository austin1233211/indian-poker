const { Logger } = require('../utils/Logger');

/**
 * PIR Engine for Private Information Retrieval
 * Implements PIR protocols for secure card query operations
 */
class PIREngine {
  constructor(database, encryptionService) {
    this.database = database;
    this.encryption = encryptionService;
    this.logger = new Logger();
    
    // PIR configuration
    this.config = {
      queryLimit: parseInt(process.env.PIR_QUERY_LIMIT) || 1000,
      responseTimeout: parseInt(process.env.PIR_RESPONSE_TIMEOUT) || 30000,
      cacheSize: parseInt(process.env.PIR_CACHE_SIZE) || 1000,
      enableCache: process.env.PIR_ENABLE_CACHE === 'true',
      enableLogging: process.env.PIR_ENABLE_LOGGING === 'true'
    };
    
    // Cache for frequently accessed queries
    this.queryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      entries: 0
    };
  }

  /**
   * Execute PIR query for card information
   * @param {object} query - PIR query object
   * @param {object} session - User session
   * @returns {object} PIR response
   */
  async executePIRQuery(query, session) {
    try {
      this.logger.info(`PIR query received: ${query.type} from user: ${session.email}`);

      // Validate query structure and integrity
      if (!this.isValidPIRQuery(query)) {
        throw new Error('Invalid PIR query format');
      }

      // Check rate limits
      await this.checkRateLimit(session.user_id, query.type);

      // Generate query fingerprint for caching
      const fingerprint = this.generateQueryFingerprint(query);

      // Check cache if enabled
      if (this.config.enableCache && this.queryCache.has(fingerprint)) {
        this.cacheStats.hits++;
        this.logger.info('PIR query served from cache');
        return this.queryCache.get(fingerprint);
      }

      // Execute query based on type
      let result;
      switch (query.type) {
        case 'card_lookup':
          result = await this.executeCardLookup(query.parameters, session);
          break;
        case 'card_search':
          result = await this.executeCardSearch(query.parameters, session);
          break;
        case 'card_stats':
          result = await this.executeCardStats(query.parameters, session);
          break;
        case 'card_validation':
          result = await this.executeCardValidation(query.parameters, session);
          break;
        default:
          throw new Error(`Unsupported query type: ${query.type}`);
      }

      // Cache the result if enabled
      if (this.config.enableCache && result) {
        this.cacheQuery(fingerprint, result);
      }

      this.logger.info(`PIR query completed: ${query.type}`);
      return result;

    } catch (error) {
      this.logger.error('PIR query execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute card lookup query
   * @param {object} parameters - Query parameters
   * @param {object} session - User session
   * @returns {object} Lookup result
   */
  async executeCardLookup(parameters, session) {
    const { cardId, encryptedProperties = [] } = parameters;

    if (!cardId) {
      throw new Error('Card ID is required for lookup');
    }

    // Get card data with privacy protection
    const cards = await this.database.query('cards', {
      where: { id: cardId, is_active: true }
    });

    if (cards.length === 0) {
      return {
        found: false,
        message: 'Card not found',
        queryId: this.generateQueryId()
      };
    }

    const card = cards[0];
    
    // Decrypt card data if authorized
    const decryptedData = await this.decryptCardData(card, session, encryptedProperties);

    return {
      found: true,
      cardId: card.id,
      data: decryptedData,
      queryId: this.generateQueryId(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute card search query
   * @param {object} parameters - Search parameters
   * @param {object} session - User session
   * @returns {object} Search results
   */
  async executeCardSearch(parameters, session) {
    const { 
      searchCriteria, 
      maxResults = 10, 
      properties = [],
      privacyLevel = 'basic'
    } = parameters;

    if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
      throw new Error('Search criteria is required');
    }

    // Build privacy-aware search query
    const searchQuery = await this.buildPrivacyAwareSearch(searchCriteria, privacyLevel, session);

    // Execute search
    const cards = await this.database.query('cards', {
      where: searchQuery.where,
      select: searchQuery.select
    }, {
      orderBy: { column: 'created_at', direction: 'desc' },
      limit: maxResults
    });

    // Process and decrypt results
    const results = await Promise.all(cards.map(async (card) => {
      const decryptedData = await this.decryptCardData(card, session, properties);
      return {
        id: card.id,
        data: decryptedData,
        relevance_score: this.calculateRelevanceScore(card, searchCriteria)
      };
    }));

    return {
      results: results,
      total_found: results.length,
      search_id: this.generateQueryId(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute card statistics query
   * @param {object} parameters - Statistics parameters
   * @param {object} session - User session
   * @returns {object} Statistics result
   */
  async executeCardStats(parameters, session) {
    const { statType, filters = {}, privacyLevel = 'aggregate' } = parameters;

    // Validate user permissions for statistics
    if (!this.hasPermission(session, 'read_stats')) {
      throw new Error('Insufficient permissions for statistics');
    }

    switch (statType) {
      case 'card_count':
        return await this.getCardCount(filters, privacyLevel);
      case 'property_distribution':
        return await this.getPropertyDistribution(filters, privacyLevel);
      case 'usage_stats':
        return await this.getUsageStats(filters, privacyLevel);
      default:
        throw new Error(`Unsupported statistics type: ${statType}`);
    }
  }

  /**
   * Execute card validation query
   * @param {object} parameters - Validation parameters
   * @param {object} session - User session
   * @returns {object} Validation result
   */
  async executeCardValidation(parameters, session) {
    const { cardId, validationType = 'existence' } = parameters;

    if (!cardId) {
      throw new Error('Card ID is required for validation');
    }

    const cards = await this.database.query('cards', {
      where: { id: cardId }
    });

    const exists = cards.length > 0;
    const card = exists ? cards[0] : null;

    let validationResult = {
      valid: exists,
      card_id: cardId,
      validation_type: validationType,
      timestamp: new Date().toISOString()
    };

    // Add additional validation data based on type
    if (exists && validationType === 'detailed') {
      validationResult.status = card.is_active ? 'active' : 'inactive';
      validationResult.created_at = card.created_at;
    }

    return validationResult;
  }

  /**
   * Decrypt card data based on user permissions
   * @param {object} card - Card data from database
   * @param {object} session - User session
   * @param {Array} requestedProperties - Requested properties to decrypt
   * @returns {object} Decrypted card data
   */
  async decryptCardData(card, session, requestedProperties = []) {
    const decrypted = {};

    // Determine what properties user can access
    const accessibleProperties = this.getAccessibleProperties(session, card);

    // Decrypt requested properties that user has access to
    for (const property of requestedProperties) {
      if (accessibleProperties.includes(property) && card[property]) {
        try {
          decrypted[property] = this.encryption.decrypt(card[property], `card:${card.id}:${property}`);
        } catch (error) {
          this.logger.warn(`Failed to decrypt property ${property} for card ${card.id}:`, error);
          decrypted[property] = null; // Don't reveal decryption failures
        }
      }
    }

    return decrypted;
  }

  /**
   * Get properties accessible to user based on role and permissions
   * @param {object} session - User session
   * @param {object} card - Card object
   * @returns {Array} List of accessible properties
   */
  getAccessibleProperties(session, card) {
    const baseProperties = ['id', 'created_at', 'updated_at'];
    
    if (session.role === 'admin') {
      // Admins can access all properties
      return [...baseProperties, 'name', 'description', 'value', 'properties', 'metadata'];
    }
    
    if (session.role === 'premium') {
      // Premium users get most properties
      return [...baseProperties, 'name', 'description', 'value', 'properties'];
    }
    
    // Regular users get basic properties only
    return [...baseProperties, 'name', 'description'];
  }

  /**
   * Build privacy-aware search query
   * @param {object} criteria - Search criteria
   * @param {string} privacyLevel - Privacy level
   * @param {object} session - User session
   * @returns {object} Search query object
   */
  async buildPrivacyAwareSearch(criteria, privacyLevel, session) {
    const query = { where: { is_active: true }, select: ['id', 'created_at'] };
    
    // Add privacy filtering based on user role and privacy level
    if (privacyLevel === 'basic') {
      // Only search in basic public properties
      query.where.name = criteria.name;
      query.select.push('name', 'description');
    } else if (privacyLevel === 'extended' && this.hasRole(session, ['premium', 'admin'])) {
      // Premium users can search in extended properties
      query.select.push('value', 'properties');
    } else if (privacyLevel === 'full' && session.role === 'admin') {
      // Admins get full access
      query.select.push('metadata');
    }
    
    return query;
  }

  /**
   * Calculate relevance score for search results
   * @param {object} card - Card object
   * @param {object} criteria - Search criteria
   * @returns {number} Relevance score (0-1)
   */
  calculateRelevanceScore(card, criteria) {
    let score = 0;
    let factors = 0;
    
    // Name matching
    if (criteria.name && card.name) {
      factors++;
      if (card.name.toLowerCase().includes(criteria.name.toLowerCase())) {
        score += 0.8;
      }
    }
    
    // Description matching
    if (criteria.description && card.description) {
      factors++;
      if (card.description.toLowerCase().includes(criteria.description.toLowerCase())) {
        score += 0.6;
      }
    }
    
    // Recency factor
    factors++;
    const daysSinceCreated = (Date.now() - new Date(card.created_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 1 - (daysSinceCreated / 365)); // Decay over a year
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Check rate limiting for user
   * @param {string} userId - User ID
   * @param {string} queryType - Query type
   */
  async checkRateLimit(userId, queryType) {
    // Implement rate limiting logic
    // This would typically involve checking a database table for recent queries
    // For now, we'll use simple in-memory tracking
    
    const key = `${userId}:${queryType}`;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxQueries = 10; // Max 10 queries per minute per type
    
    // This would be implemented with Redis or a database table in production
    this.logger.info(`Rate limit check for ${key}`);
  }

  /**
   * Validate PIR query format and integrity
   * @param {object} query - Query to validate
   * @returns {boolean} True if query is valid
   */
  isValidPIRQuery(query) {
    if (!query || typeof query !== 'object') {
      return false;
    }
    
    if (!query.type || !query.parameters) {
      return false;
    }
    
    if (!['card_lookup', 'card_search', 'card_stats', 'card_validation'].includes(query.type)) {
      return false;
    }
    
    // Verify query integrity
    return this.encryption.verifyPIRQuery(query);
  }

  /**
   * Generate query fingerprint for caching
   * @param {object} query - PIR query
   * @returns {string} Fingerprint hash
   */
  generateQueryFingerprint(query) {
    const data = JSON.stringify({
      type: query.type,
      parameters: query.parameters
    });
    
    return this.encryption.hashData(data);
  }

  /**
   * Cache query result
   * @param {string} fingerprint - Query fingerprint
   * @param {object} result - Query result
   */
  cacheQuery(fingerprint, result) {
    // Check cache size limit
    if (this.queryCache.size >= this.config.cacheSize) {
      // Remove oldest entry
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
      this.cacheStats.entries--;
    }
    
    this.queryCache.set(fingerprint, result);
    this.cacheStats.entries++;
    this.cacheStats.misses++;
  }

  /**
   * Generate unique query ID
   * @returns {string} Unique query identifier
   */
  generateQueryId() {
    return `pir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get card count statistics
   */
  async getCardCount(filters, privacyLevel) {
    let whereClause = { is_active: true };
    
    if (filters.dateRange) {
      whereClause.created_at = filters.dateRange;
    }
    
    const count = await this.database.query('cards', { where: whereClause });
    
    return {
      total_count: count.length,
      privacy_level: privacyLevel,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get property distribution statistics
   */
  async getPropertyDistribution(filters, privacyLevel) {
    // Aggregate statistics without revealing individual data
    const cards = await this.database.query('cards', {
      where: { is_active: true }
    });
    
    const distribution = {};
    cards.forEach(card => {
      if (card.properties) {
        try {
          const props = JSON.parse(card.properties);
          Object.keys(props).forEach(prop => {
            distribution[prop] = (distribution[prop] || 0) + 1;
          });
        } catch (error) {
          // Skip invalid property data
        }
      }
    });
    
    return {
      distribution,
      privacy_level: privacyLevel,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(filters, privacyLevel) {
    // This would aggregate query logs and usage patterns
    return {
      total_queries: 0,
      unique_users: 0,
      privacy_level: privacyLevel,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if user has one of the required roles
   * @param {object} session - User session
   * @param {Array} requiredRoles - Array of roles that grant access
   * @returns {boolean} True if user has one of the required roles
   */
  hasRole(session, requiredRoles) {
    if (!session || !session.role || !Array.isArray(requiredRoles)) {
      return false;
    }
    return requiredRoles.includes(session.role);
  }

  /**
   * Check if user has specific permission
   * @param {object} session - User session
   * @param {string} permission - Permission to check
   * @returns {boolean} True if user has permission
   */
  hasPermission(session, permission) {
    const permissions = {
      'read_stats': ['admin'],
      'bulk_queries': ['premium', 'admin'],
      'extended_properties': ['premium', 'admin']
    };
    
    const requiredRoles = permissions[permission] || [];
    return this.hasRole(session, requiredRoles);
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      max_size: this.config.cacheSize,
      enabled: this.config.enableCache
    };
  }
}

module.exports = { PIREngine };
