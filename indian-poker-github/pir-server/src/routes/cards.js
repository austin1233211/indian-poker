const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

/**
 * Card Management Routes
 * Handles card CRUD operations with encryption
 */
const cardRoutes = (services) => {
  const router = express.Router();
  const { database, encryption, authService, logger } = services;

  // Validation middleware
  const validateCardCreation = [
    body('name')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Name must be between 1 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('value')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Value must be a non-negative number'),
    body('properties')
      .optional()
      .isObject()
      .withMessage('Properties must be an object'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ];

  const validateCardUpdate = [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Name must be between 1 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('value')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Value must be a non-negative number'),
    body('properties')
      .optional()
      .isObject()
      .withMessage('Properties must be an object'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean')
  ];

  const validateCardId = [
    param('id')
      .isUUID()
      .withMessage('Card ID must be a valid UUID')
  ];

  /**
   * POST /api/cards
   * Create a new card (admin only)
   */
  router.post('/',
    authService.authenticate,
    authService.authorize(['admin']),
    validateCardCreation,
    async (req, res) => {
      try {
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

        const { name, description, value, properties, metadata } = req.body;
        const cardId = uuidv4();

        // Encrypt sensitive data
        const encryptedProperties = properties ? 
          encryption.encrypt(JSON.stringify(properties), `card:${cardId}:properties`) : null;
        
        const encryptedMetadata = metadata ? 
          encryption.encrypt(JSON.stringify(metadata), `card:${cardId}:metadata`) : null;

        const encryptedValue = value !== undefined ? 
          encryption.encrypt(String(value), `card:${cardId}:value`) : null;

        // Create card record
        const card = {
          id: cardId,
          name,
          description: description || null,
          value: encryptedValue,
          properties: encryptedProperties,
          metadata: encryptedMetadata,
          created_by: req.user.user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true
        };

        await database.insert('cards', card);

        // Log card creation
        logger.database('CARD_CREATED', {
          card_id: cardId,
          name: name,
          created_by: req.user.user_id
        });

        res.status(201).json({
          success: true,
          message: 'Card created successfully',
          card: {
            id: card.id,
            name: card.name,
            description: card.description,
            value: card.value ? '[ENCRYPTED]' : null,
            created_at: card.created_at
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Card creation failed:', error);
        res.status(500).json({
          error: 'Failed to create card',
          code: 'CARD_CREATE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/cards
   * Get list of cards (with pagination and filters)
   */
  router.get('/',
    authService.authenticate,
    async (req, res) => {
      try {
        const {
          page = 1,
          limit = 20,
          search,
          is_active = 'true',
          sort_by = 'created_at',
          sort_order = 'desc'
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build query conditions
        const conditions = { where: {} };
        
        if (is_active !== 'all') {
          conditions.where.is_active = is_active === 'true';
        }

        // Add search filter
        if (search) {
          conditions.where.name = { $like: `%${search}%` };
        }

        // Determine accessible fields based on user role
        let selectFields = ['id', 'name', 'description', 'created_at', 'updated_at', 'is_active'];
        
        if (authService.hasRole(req.user, ['premium', 'admin'])) {
          selectFields.push('value');
        }
        
        if (req.user.role === 'admin') {
          selectFields.push('properties', 'metadata', 'created_by');
        }

        // Get cards with pagination
        const cards = await database.query('cards', conditions, {
          select: selectFields,
          orderBy: { column: sort_by, direction: sort_order },
          limit: limitNum,
          offset: offset
        });

        // Decrypt sensitive fields for authorized users
        const processedCards = cards.map(card => {
          const processedCard = { ...card };

          // Decrypt value for authorized users
          if (card.value && authService.hasRole(req.user, ['premium', 'admin'])) {
            try {
              processedCard.value = encryption.decrypt(card.value, `card:${card.id}:value`);
            } catch (error) {
              logger.warn(`Failed to decrypt value for card ${card.id}:`, error);
              processedCard.value = null;
            }
          }

          // Remove encrypted fields for non-admin users
          if (req.user.role !== 'admin') {
            delete processedCard.properties;
            delete processedCard.metadata;
          }

          return processedCard;
        });

        // Get total count for pagination
        const totalCards = await database.query('cards', { where: conditions.where });
        const total = totalCards.length;

        res.status(200).json({
          success: true,
          cards: processedCards,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get cards:', error);
        res.status(500).json({
          error: 'Failed to retrieve cards',
          code: 'CARDS_GET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /api/cards/:id
   * Get a specific card by ID
   */
  router.get('/:id',
    authService.authenticate,
    validateCardId,
    async (req, res) => {
      try {
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

        const { id } = req.params;

        // Get card
        const cards = await database.query('cards', { where: { id } });

        if (cards.length === 0) {
          return res.status(404).json({
            error: 'Card not found',
            code: 'CARD_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        const card = cards[0];

        // Check if user can access this card
        if (!card.is_active && req.user.role !== 'admin') {
          return res.status(403).json({
            error: 'Access denied to inactive card',
            code: 'CARD_ACCESS_DENIED',
            timestamp: new Date().toISOString()
          });
        }

        // Decrypt sensitive fields based on user permissions
        const processedCard = {
          id: card.id,
          name: card.name,
          description: card.description,
          created_at: card.created_at,
          updated_at: card.updated_at,
          is_active: card.is_active
        };

        // Decrypt and add value for authorized users
        if (card.value && authService.hasRole(req.user, ['premium', 'admin'])) {
          try {
            processedCard.value = encryption.decrypt(card.value, `card:${card.id}:value`);
          } catch (error) {
            logger.warn(`Failed to decrypt value for card ${card.id}:`, error);
            processedCard.value = null;
          }
        }

        // Add properties for admin users
        if (req.user.role === 'admin' && card.properties) {
          try {
            processedCard.properties = JSON.parse(
              encryption.decrypt(card.properties, `card:${card.id}:properties`)
            );
          } catch (error) {
            logger.warn(`Failed to decrypt properties for card ${card.id}:`, error);
            processedCard.properties = null;
          }
        }

        // Add metadata for admin users
        if (req.user.role === 'admin' && card.metadata) {
          try {
            processedCard.metadata = JSON.parse(
              encryption.decrypt(card.metadata, `card:${card.id}:metadata`)
            );
          } catch (error) {
            logger.warn(`Failed to decrypt metadata for card ${card.id}:`, error);
            processedCard.metadata = null;
          }
        }

        // Add creator info for admin users
        if (req.user.role === 'admin' && card.created_by) {
          const creator = await authService.getUserById(card.created_by);
          processedCard.created_by = creator ? {
            id: creator.id,
            name: creator.name,
            email: creator.email
          } : null;
        }

        res.status(200).json({
          success: true,
          card: processedCard,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get card:', error);
        res.status(500).json({
          error: 'Failed to retrieve card',
          code: 'CARD_GET_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * PUT /api/cards/:id
   * Update a card (admin only)
   */
  router.put('/:id',
    authService.authenticate,
    authService.authorize(['admin']),
    validateCardId,
    validateCardUpdate,
    async (req, res) => {
      try {
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

        const { id } = req.params;
        const updates = req.body;

        // Check if card exists
        const cards = await database.query('cards', { where: { id } });
        if (cards.length === 0) {
          return res.status(404).json({
            error: 'Card not found',
            code: 'CARD_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        const card = cards[0];
        const updateData = {
          ...updates,
          updated_at: new Date().toISOString()
        };

        // Encrypt sensitive fields if they exist
        if (updateData.value !== undefined) {
          updateData.value = encryption.encrypt(String(updateData.value), `card:${id}:value`);
        }

        if (updateData.properties) {
          updateData.properties = encryption.encrypt(
            JSON.stringify(updateData.properties), 
            `card:${id}:properties`
          );
        }

        if (updateData.metadata) {
          updateData.metadata = encryption.encrypt(
            JSON.stringify(updateData.metadata), 
            `card:${id}:metadata`
          );
        }

        // Remove non-database fields
        delete updateData.id;
        delete updateData.created_at;
        delete updateData.created_by;

        // Update card
        await database.update('cards', updateData, { where: { id } });

        // Log card update
        logger.database('CARD_UPDATED', {
          card_id: id,
          updated_by: req.user.user_id,
          changes: Object.keys(updates)
        });

        res.status(200).json({
          success: true,
          message: 'Card updated successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Card update failed:', error);
        res.status(500).json({
          error: 'Failed to update card',
          code: 'CARD_UPDATE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * DELETE /api/cards/:id
   * Delete or deactivate a card (admin only)
   */
  router.delete('/:id',
    authService.authenticate,
    authService.authorize(['admin']),
    validateCardId,
    async (req, res) => {
      try {
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

        const { id } = req.params;
        const { hard_delete = false } = req.query;

        // Check if card exists
        const cards = await database.query('cards', { where: { id } });
        if (cards.length === 0) {
          return res.status(404).json({
            error: 'Card not found',
            code: 'CARD_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        if (hard_delete === 'true') {
          // Hard delete (remove from database)
          await database.delete('cards', { where: { id } });
          
          logger.database('CARD_HARD_DELETED', {
            card_id: id,
            deleted_by: req.user.user_id
          });
        } else {
          // Soft delete (deactivate)
          await database.update('cards', 
            { 
              is_active: false,
              updated_at: new Date().toISOString()
            }, 
            { where: { id } }
          );
          
          logger.database('CARD_DEACTIVATED', {
            card_id: id,
            deactivated_by: req.user.user_id
          });
        }

        res.status(200).json({
          success: true,
          message: hard_delete === 'true' ? 'Card deleted successfully' : 'Card deactivated successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Card deletion failed:', error);
        res.status(500).json({
          error: 'Failed to delete card',
          code: 'CARD_DELETE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * POST /api/cards/:id/restore
   * Restore a deactivated card (admin only)
   */
  router.post('/:id/restore',
    authService.authenticate,
    authService.authorize(['admin']),
    validateCardId,
    async (req, res) => {
      try {
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

        const { id } = req.params;

        // Check if card exists and is deactivated
        const cards = await database.query('cards', { where: { id, is_active: false } });
        if (cards.length === 0) {
          return res.status(404).json({
            error: 'Deactivated card not found',
            code: 'CARD_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
        }

        // Restore card
        await database.update('cards', 
          { 
            is_active: true,
            updated_at: new Date().toISOString()
          }, 
          { where: { id } }
        );

        // Log card restoration
        logger.database('CARD_RESTORED', {
          card_id: id,
          restored_by: req.user.user_id
        });

        res.status(200).json({
          success: true,
          message: 'Card restored successfully',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Card restoration failed:', error);
        res.status(500).json({
          error: 'Failed to restore card',
          code: 'CARD_RESTORE_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  return router;
};

module.exports = cardRoutes;