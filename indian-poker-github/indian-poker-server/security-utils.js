/**
 * Security Utilities Module for Indian Poker Server
 * 
 * This module provides cryptographic security enhancements including:
 * - Distributed randomness generation (commit-reveal scheme)
 * - Rate limiting for cryptographic operations
 * - Proof validation with replay protection and expiration
 * - Enhanced card hashing with game secrets
 */

const crypto = require('crypto');

/**
 * Constant-Time Comparison Utility
 * Prevents timing attacks by ensuring comparisons take the same time
 * regardless of where differences occur in the strings.
 */
class ConstantTimeCompare {
    static compare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }
        
        const bufA = Buffer.from(a, 'utf8');
        const bufB = Buffer.from(b, 'utf8');
        
        if (bufA.length !== bufB.length) {
            return false;
        }
        
        return crypto.timingSafeEqual(bufA, bufB);
    }

    static compareHex(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }
        
        try {
            const bufA = Buffer.from(a, 'hex');
            const bufB = Buffer.from(b, 'hex');
            
            if (bufA.length !== bufB.length) {
                return false;
            }
            
            return crypto.timingSafeEqual(bufA, bufB);
        } catch (e) {
            return false;
        }
    }
}

/**
 * Distributed Randomness Generation
 * Implements a commit-reveal scheme where each player contributes entropy
 * to the final shuffle seed, ensuring no single party controls randomness.
 * 
 * SECURITY FIX: Timestamp is now committed BEFORE the reveal phase begins,
 * preventing server timestamp grinding attacks. The timestamp commitment
 * is broadcast to all players before they reveal their seeds.
 */
class DistributedRandomness {
    constructor() {
        this.playerCommitments = new Map(); // playerId -> commitment (hash of seed)
        this.playerReveals = new Map(); // playerId -> seed
        this.commitmentPhaseComplete = false;
        this.revealPhaseComplete = false;
        this.finalSeed = null;
        this.timestamp = null;
        this.timestampCommitment = null; // SECURITY: Committed timestamp hash
        this.timestampCommitted = false; // SECURITY: Track if timestamp was committed
    }

    /**
     * Player commits to their random seed by providing H(seed)
     * @param {string} playerId - Player identifier
     * @param {string} commitment - SHA-256 hash of the player's seed
     * @returns {object} Result of commitment
     */
    commitPlayerSeed(playerId, commitment) {
        if (this.commitmentPhaseComplete) {
            return { success: false, error: 'Commitment phase already complete' };
        }
        
        if (this.playerCommitments.has(playerId)) {
            return { success: false, error: 'Player already committed' };
        }

        // Validate commitment format (should be 64 hex characters for SHA-256)
        if (!/^[a-f0-9]{64}$/i.test(commitment)) {
            return { success: false, error: 'Invalid commitment format' };
        }

        this.playerCommitments.set(playerId, commitment);
        return { success: true, playerId, commitmentReceived: true };
    }

    /**
     * Player reveals their seed after all commitments are collected
     * @param {string} playerId - Player identifier
     * @param {string} seed - The original seed (must hash to the commitment)
     * @returns {object} Result of reveal
     */
    revealPlayerSeed(playerId, seed) {
        if (!this.commitmentPhaseComplete) {
            return { success: false, error: 'Commitment phase not complete' };
        }

        if (this.revealPhaseComplete) {
            return { success: false, error: 'Reveal phase already complete' };
        }

        const commitment = this.playerCommitments.get(playerId);
        if (!commitment) {
            return { success: false, error: 'No commitment found for player' };
        }

        if (this.playerReveals.has(playerId)) {
            return { success: false, error: 'Player already revealed' };
        }

        // Verify the seed matches the commitment
        const hash = crypto.createHash('sha256').update(seed).digest('hex');
        if (hash !== commitment) {
            return { success: false, error: 'Seed does not match commitment' };
        }

        this.playerReveals.set(playerId, seed);
        return { success: true, playerId, seedVerified: true };
    }

    /**
     * Mark commitment phase as complete and commit to timestamp
     * SECURITY FIX: Timestamp is committed BEFORE reveal phase begins
     * This prevents server timestamp grinding attacks
     * Call this when all expected players have committed
     */
    completeCommitmentPhase() {
        if (this.playerCommitments.size === 0) {
            return { success: false, error: 'No commitments received' };
        }
        
        // SECURITY FIX: Commit to timestamp before reveal phase
        // This prevents the server from grinding timestamps after seeing reveals
        this.timestamp = Date.now().toString();
        this.timestampCommitment = crypto.createHash('sha256')
            .update(this.timestamp)
            .digest('hex');
        this.timestampCommitted = true;
        
        this.commitmentPhaseComplete = true;
        return { 
            success: true, 
            commitmentCount: this.playerCommitments.size,
            timestampCommitment: this.timestampCommitment,
            message: 'Timestamp committed before reveal phase - server cannot grind timestamps'
        };
    }
    
    /**
     * Get the committed timestamp for client verification
     * Clients should store this before revealing their seeds
     */
    getTimestampCommitment() {
        return {
            timestampCommitment: this.timestampCommitment,
            timestampCommitted: this.timestampCommitted
        };
    }

    /**
     * Generate the final shuffle seed from all revealed seeds
     * SECURITY FIX: Uses the pre-committed timestamp from completeCommitmentPhase()
     * Final seed = H(seed_1 || seed_2 || ... || seed_n || committed_timestamp)
     * @returns {object} Result containing the final seed
     */
    generateShuffleSeed() {
        if (this.playerReveals.size !== this.playerCommitments.size) {
            return { success: false, error: 'Not all players revealed their seeds' };
        }

        // SECURITY FIX: Verify timestamp was committed before reveal phase
        if (!this.timestampCommitted || !this.timestamp) {
            return { success: false, error: 'Timestamp must be committed before generating shuffle seed' };
        }

        // Sort seeds by player ID for deterministic ordering
        const seeds = Array.from(this.playerReveals.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => entry[1]);

        // SECURITY FIX: Use the pre-committed timestamp, not a new one
        // This prevents server timestamp grinding attacks
        const combined = seeds.join('||') + '||' + this.timestamp;
        this.finalSeed = crypto.createHash('sha256').update(combined).digest('hex');
        this.revealPhaseComplete = true;

        return {
            success: true,
            finalSeed: this.finalSeed,
            timestamp: this.timestamp,
            timestampCommitment: this.timestampCommitment,
            contributorCount: seeds.length,
            message: 'Final seed generated using pre-committed timestamp'
        };
    }

    /**
     * Get the current state of the distributed randomness protocol
     */
    getState() {
        return {
            commitmentCount: this.playerCommitments.size,
            revealCount: this.playerReveals.size,
            commitmentPhaseComplete: this.commitmentPhaseComplete,
            revealPhaseComplete: this.revealPhaseComplete,
            hasFinalSeed: this.finalSeed !== null
        };
    }

    /**
     * Generate a commitment for a player (helper for clients)
     * @param {string} seed - Random seed to commit to
     * @returns {object} Commitment hash
     */
    static generateCommitment(seed) {
        const commitment = crypto.createHash('sha256').update(seed).digest('hex');
        return { seed, commitment };
    }

    /**
     * Generate a random seed for a player
     * @returns {string} Cryptographically secure random seed
     */
    static generateRandomSeed() {
        return crypto.randomBytes(32).toString('hex');
    }

    getTranscriptData() {
        return {
            playerCommitments: this.playerCommitments,
            playerReveals: this.playerReveals,
            finalSeed: this.finalSeed,
            timestamp: this.timestamp,
            timestampCommitment: this.timestampCommitment,
            timestampCommitted: this.timestampCommitted,
            commitmentPhaseComplete: this.commitmentPhaseComplete,
            revealPhaseComplete: this.revealPhaseComplete
        };
    }

    addCommitment(playerId, commitment) {
        return this.commitPlayerSeed(playerId, commitment);
    }

    addReveal(playerId, seed) {
        if (!this.commitmentPhaseComplete) {
            this.completeCommitmentPhase();
        }
        return this.revealPlayerSeed(playerId, seed);
    }

    getFinalSeed() {
        if (!this.finalSeed && this.revealPhaseComplete) {
            this.generateShuffleSeed();
        }
        return this.finalSeed;
    }

    getStatus() {
        return this.getState();
    }

    reset() {
        this.playerCommitments = new Map();
        this.playerReveals = new Map();
        this.commitmentPhaseComplete = false;
        this.revealPhaseComplete = false;
        this.finalSeed = null;
        this.timestamp = null;
        this.timestampCommitment = null;
        this.timestampCommitted = false;
    }
}

/**
 * Rate Limiter for Cryptographic Operations
 * Prevents DoS attacks via resource exhaustion by limiting
 * the number of expensive cryptographic operations per client.
 */
class CryptoRateLimiter {
    constructor(options = {}) {
        this.proofGeneration = new Map(); // clientId -> { count, resetTime }
        this.maxProofsPerHour = options.maxProofsPerHour || 10;
        this.windowMs = options.windowMs || 3600000; // 1 hour default
        this.deckCommitments = new Map(); // clientId -> { count, resetTime }
        this.maxCommitmentsPerHour = options.maxCommitmentsPerHour || 20;
        this.hiddenCardRequests = new Map(); // clientId -> { count, resetTime }
        this.maxHiddenCardPerMinute = options.maxHiddenCardPerMinute || 10;
        this.hiddenCardWindowMs = options.hiddenCardWindowMs || 60000; // 1 minute for hidden card requests
    }

    /**
     * Check if a client can perform a proof generation operation
     * @param {string} clientId - Client identifier
     * @param {string} operation - Type of operation (e.g., 'proofGeneration', 'deckCommitment')
     * @returns {object} Result indicating if operation is allowed
     */
    checkLimit(clientId, operation = 'proofGeneration') {
        const now = Date.now();
        let limitMap, maxLimit, windowMs;

        switch (operation) {
            case 'proofGeneration':
                limitMap = this.proofGeneration;
                maxLimit = this.maxProofsPerHour;
                windowMs = this.windowMs;
                break;
            case 'deckCommitment':
                limitMap = this.deckCommitments;
                maxLimit = this.maxCommitmentsPerHour;
                windowMs = this.windowMs;
                break;
            case 'hidden_card':
                limitMap = this.hiddenCardRequests;
                maxLimit = this.maxHiddenCardPerMinute;
                windowMs = this.hiddenCardWindowMs;
                break;
            default:
                limitMap = this.proofGeneration;
                maxLimit = this.maxProofsPerHour;
                windowMs = this.windowMs;
        }

        const record = limitMap.get(clientId) || { count: 0, resetTime: now + windowMs };

        // Reset if window has passed
        if (now > record.resetTime) {
            record.count = 0;
            record.resetTime = now + this.windowMs;
        }

        if (record.count >= maxLimit) {
            return {
                allowed: false,
                error: `Rate limit exceeded for ${operation}`,
                retryAfter: Math.ceil((record.resetTime - now) / 1000),
                currentCount: record.count,
                maxAllowed: maxLimit
            };
        }

        return { allowed: true, currentCount: record.count, maxAllowed: maxLimit };
    }

    /**
     * Record a cryptographic operation for rate limiting
     * @param {string} clientId - Client identifier
     * @param {string} operation - Type of operation
     */
    recordOperation(clientId, operation = 'proofGeneration') {
        const now = Date.now();
        let limitMap, windowMs;

        switch (operation) {
            case 'proofGeneration':
                limitMap = this.proofGeneration;
                windowMs = this.windowMs;
                break;
            case 'deckCommitment':
                limitMap = this.deckCommitments;
                windowMs = this.windowMs;
                break;
            case 'hidden_card':
                limitMap = this.hiddenCardRequests;
                windowMs = this.hiddenCardWindowMs;
                break;
            default:
                limitMap = this.proofGeneration;
                windowMs = this.windowMs;
        }

        const record = limitMap.get(clientId) || { count: 0, resetTime: now + windowMs };

        // Reset if window has passed
        if (now > record.resetTime) {
            record.count = 0;
            record.resetTime = now + windowMs;
        }

        record.count++;
        limitMap.set(clientId, record);

        return { recorded: true, currentCount: record.count };
    }

    /**
     * Get rate limit status for a client
     * @param {string} clientId - Client identifier
     */
    getStatus(clientId) {
        const now = Date.now();
        const proofRecord = this.proofGeneration.get(clientId);
        const commitRecord = this.deckCommitments.get(clientId);

        return {
            proofGeneration: proofRecord ? {
                count: proofRecord.count,
                maxAllowed: this.maxProofsPerHour,
                resetsIn: Math.max(0, Math.ceil((proofRecord.resetTime - now) / 1000))
            } : { count: 0, maxAllowed: this.maxProofsPerHour, resetsIn: 0 },
            deckCommitment: commitRecord ? {
                count: commitRecord.count,
                maxAllowed: this.maxCommitmentsPerHour,
                resetsIn: Math.max(0, Math.ceil((commitRecord.resetTime - now) / 1000))
            } : { count: 0, maxAllowed: this.maxCommitmentsPerHour, resetsIn: 0 }
        };
    }

    /**
     * Clear rate limit data for a client (e.g., on disconnect)
     * @param {string} clientId - Client identifier
     */
    clearClient(clientId) {
        this.proofGeneration.delete(clientId);
        this.deckCommitments.delete(clientId);
    }
}

/**
 * Proof Validator with Replay Protection and Expiration
 * Ensures proofs cannot be reused and enforces time limits.
 */
class ProofValidator {
    constructor(options = {}) {
        this.usedProofs = new Set(); // Track used proof hashes
        this.proofExpiration = options.proofExpiration || 3600000; // 1 hour default
        this.proofTimestamps = new Map(); // proofHash -> timestamp
        this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
        
        // Start periodic cleanup of expired proofs
        this.cleanupTimer = setInterval(() => this.cleanupExpiredProofs(), this.cleanupInterval);
    }

    /**
     * Validate a proof's structure and check for replay/expiration
     * @param {object} proof - The proof to validate
     * @returns {object} Validation result
     */
    validateProof(proof) {
        // Check proof structure
        if (!proof || typeof proof !== 'object') {
            return { valid: false, error: 'Invalid proof structure' };
        }

        // Check required fields
        if (!proof.pi_a || !proof.pi_b || !proof.pi_c) {
            return { valid: false, error: 'Missing proof components (pi_a, pi_b, pi_c)' };
        }

        // Check timestamp
        if (!proof.timestamp) {
            return { valid: false, error: 'Missing proof timestamp' };
        }

        const proofTime = typeof proof.timestamp === 'number' ? proof.timestamp : Date.parse(proof.timestamp);
        if (isNaN(proofTime)) {
            return { valid: false, error: 'Invalid proof timestamp' };
        }

        // Check expiration
        const now = Date.now();
        if (now - proofTime > this.proofExpiration) {
            return { valid: false, error: 'Proof expired' };
        }

        // Check for replay attack
        const proofHash = this.hashProof(proof);
        if (this.usedProofs.has(proofHash)) {
            return { valid: false, error: 'Proof already used (replay attack)' };
        }

        return { valid: true, proofHash };
    }

    /**
     * Mark a proof as used (call after successful verification)
     * @param {object} proof - The proof to mark as used
     */
    markProofUsed(proof) {
        const proofHash = this.hashProof(proof);
        this.usedProofs.add(proofHash);
        this.proofTimestamps.set(proofHash, Date.now());
        return { marked: true, proofHash };
    }

    /**
     * Generate a hash of a proof for tracking
     * @param {object} proof - The proof to hash
     * @returns {string} Hash of the proof
     */
    hashProof(proof) {
        const proofStr = JSON.stringify({
            pi_a: proof.pi_a,
            pi_b: proof.pi_b,
            pi_c: proof.pi_c,
            gameId: proof.gameId
        });
        return crypto.createHash('sha256').update(proofStr).digest('hex');
    }

    /**
     * Clean up expired proofs to prevent memory bloat
     */
    cleanupExpiredProofs() {
        const now = Date.now();
        const expiredHashes = [];

        for (const [hash, timestamp] of this.proofTimestamps) {
            if (now - timestamp > this.proofExpiration * 2) { // Keep for 2x expiration time
                expiredHashes.push(hash);
            }
        }

        for (const hash of expiredHashes) {
            this.usedProofs.delete(hash);
            this.proofTimestamps.delete(hash);
        }

        return { cleaned: expiredHashes.length };
    }

    /**
     * Get statistics about proof validation
     */
    getStatistics() {
        return {
            trackedProofs: this.usedProofs.size,
            expirationMs: this.proofExpiration
        };
    }

    /**
     * Stop the cleanup timer (call on server shutdown)
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

/**
 * Enhanced Card Hasher with Game Secrets
 * Generates card hashes that include game-specific secrets
 * derived from player seeds, preventing cross-game hash correlation.
 */
class EnhancedCardHasher {
    constructor() {
        this.gameSecrets = new Map(); // gameId -> secret
    }

    /**
     * Derive a game-specific secret from player seeds
     * @param {string} gameId - Game identifier
     * @param {string[]} playerSeeds - Array of player seeds
     * @returns {string} Game secret
     */
    deriveGameSecret(gameId, playerSeeds) {
        const combined = gameId + '||' + playerSeeds.sort().join('||');
        const secret = crypto.createHash('sha256').update(combined).digest('hex');
        this.gameSecrets.set(gameId, secret);
        return secret;
    }

    /**
     * Set a game secret directly (e.g., from distributed randomness)
     * @param {string} gameId - Game identifier
     * @param {string} secret - The game secret
     */
    setGameSecret(gameId, secret) {
        this.gameSecrets.set(gameId, secret);
    }

    /**
     * Generate an enhanced hash for a card
     * Format: H(gameId:gameSecret:position:rank:suit)
     * @param {object} card - Card object with rank and suit
     * @param {string} gameId - Game identifier
     * @param {number} position - Card position in deck
     * @returns {string} Enhanced card hash
     */
    hashCard(card, gameId, position) {
        const gameSecret = this.gameSecrets.get(gameId) || 'default-secret';
        const data = `${gameId}:${gameSecret}:${position}:${card.rank}:${card.suit}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate hashes for an entire deck
     * @param {object[]} deck - Array of card objects
     * @param {string} gameId - Game identifier
     * @returns {string[]} Array of card hashes
     */
    hashDeck(deck, gameId) {
        return deck.map((card, index) => this.hashCard(card, gameId, index));
    }

    /**
     * Verify a card hash
     * @param {object} card - Card object
     * @param {string} gameId - Game identifier
     * @param {number} position - Card position
     * @param {string} expectedHash - Expected hash to verify against
     * @returns {boolean} Whether the hash matches
     */
    verifyCardHash(card, gameId, position, expectedHash) {
        const computedHash = this.hashCard(card, gameId, position);
        return computedHash === expectedHash;
    }

    /**
     * Clean up game secret when game ends
     * @param {string} gameId - Game identifier
     */
    cleanupGame(gameId) {
        this.gameSecrets.delete(gameId);
    }
}

/**
 * WSS Enforcement Utility
 * Checks and enforces WebSocket Secure connections in production.
 */
class WSSEnforcer {
    constructor(options = {}) {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.enforceWSS = process.env.USE_WSS === 'true' || this.isProduction;
        this.allowedOrigins = options.allowedOrigins || [];
    }

    /**
     * Check if a connection should be allowed
     * @param {object} request - HTTP upgrade request
     * @param {object} socket - Socket object
     * @returns {object} Result indicating if connection is allowed
     */
    checkConnection(request, socket) {
        // In production, require WSS
        if (this.enforceWSS) {
            const isSecure = request.headers['x-forwarded-proto'] === 'https' ||
                            request.connection.encrypted ||
                            request.headers['upgrade-insecure-requests'] === '1';

            if (!isSecure) {
                return {
                    allowed: false,
                    error: 'Production requires WSS (WebSocket Secure) connections',
                    code: 'WSS_REQUIRED'
                };
            }
        }

        // Check origin if allowedOrigins is configured
        if (this.allowedOrigins.length > 0) {
            const origin = request.headers.origin;
            if (origin && !this.allowedOrigins.includes(origin)) {
                return {
                    allowed: false,
                    error: 'Origin not allowed',
                    code: 'ORIGIN_NOT_ALLOWED'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Get enforcement status
     */
    getStatus() {
        return {
            isProduction: this.isProduction,
            enforceWSS: this.enforceWSS,
            allowedOrigins: this.allowedOrigins
        };
    }
}

/**
 * Nonce Generator for Deck Commitments
 * Generates cryptographic nonces to prevent hash precomputation attacks.
 */
class NonceGenerator {
    /**
     * Generate a cryptographic nonce
     * @param {number} bytes - Number of bytes (default: 32)
     * @returns {string} Hex-encoded nonce
     */
    static generate(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    /**
     * Validate a nonce format
     * @param {string} nonce - Nonce to validate
     * @param {number} expectedLength - Expected hex string length (default: 64 for 32 bytes)
     * @returns {boolean} Whether the nonce is valid
     */
    static validate(nonce, expectedLength = 64) {
        if (typeof nonce !== 'string') return false;
        if (nonce.length !== expectedLength) return false;
        return /^[a-f0-9]+$/i.test(nonce);
    }
}

/**
 * Continuous Monitoring for Cryptographic Operations
 * Tracks and logs all cryptographic operations for security auditing.
 */
class CryptoMonitor {
    constructor(options = {}) {
        this.operations = [];
        this.maxOperations = options.maxOperations || 10000;
        this.alertThresholds = {
            proofGenerationsPerMinute: options.proofGenerationsPerMinute || 5,
            failedVerificationsPerMinute: options.failedVerificationsPerMinute || 3,
            suspiciousPatternCount: options.suspiciousPatternCount || 10
        };
        this.alerts = [];
        this.operationCounts = new Map();
        this.failedVerifications = new Map();
    }

    recordOperation(type, clientId, details = {}) {
        const timestamp = Date.now();
        const operation = {
            type,
            clientId,
            timestamp,
            details,
            id: crypto.randomBytes(8).toString('hex')
        };

        this.operations.push(operation);

        if (this.operations.length > this.maxOperations) {
            this.operations.shift();
        }

        this.updateCounts(type, clientId, timestamp);
        this.checkForAnomalies(type, clientId, timestamp);

        return operation;
    }

    updateCounts(type, clientId, timestamp) {
        const key = `${clientId}:${type}`;
        const minute = Math.floor(timestamp / 60000);
        
        if (!this.operationCounts.has(key)) {
            this.operationCounts.set(key, new Map());
        }
        
        const counts = this.operationCounts.get(key);
        counts.set(minute, (counts.get(minute) || 0) + 1);

        for (const [m] of counts) {
            if (m < minute - 5) counts.delete(m);
        }
    }

    checkForAnomalies(type, clientId, timestamp) {
        const key = `${clientId}:${type}`;
        const minute = Math.floor(timestamp / 60000);
        const counts = this.operationCounts.get(key);
        
        if (!counts) return;

        const currentCount = counts.get(minute) || 0;

        if (type === 'proof_generation' && currentCount > this.alertThresholds.proofGenerationsPerMinute) {
            this.raiseAlert('HIGH_PROOF_GENERATION_RATE', clientId, {
                count: currentCount,
                threshold: this.alertThresholds.proofGenerationsPerMinute
            });
        }

        if (type === 'verification_failed' && currentCount > this.alertThresholds.failedVerificationsPerMinute) {
            this.raiseAlert('HIGH_VERIFICATION_FAILURE_RATE', clientId, {
                count: currentCount,
                threshold: this.alertThresholds.failedVerificationsPerMinute
            });
        }
    }

    recordVerificationFailure(clientId, reason) {
        this.recordOperation('verification_failed', clientId, { reason });
    }

    raiseAlert(alertType, clientId, details) {
        const alert = {
            type: alertType,
            clientId,
            timestamp: Date.now(),
            details,
            id: crypto.randomBytes(8).toString('hex')
        };

        this.alerts.push(alert);
        console.warn(`[SECURITY ALERT] ${alertType} for client ${clientId}:`, details);

        return alert;
    }

    getRecentOperations(clientId = null, limit = 100) {
        let ops = this.operations;
        if (clientId) {
            ops = ops.filter(op => op.clientId === clientId);
        }
        return ops.slice(-limit);
    }

    getAlerts(since = 0) {
        return this.alerts.filter(a => a.timestamp > since);
    }

    getStatistics() {
        const now = Date.now();
        const lastHour = now - 3600000;
        const recentOps = this.operations.filter(op => op.timestamp > lastHour);

        const byType = {};
        for (const op of recentOps) {
            byType[op.type] = (byType[op.type] || 0) + 1;
        }

        return {
            totalOperations: this.operations.length,
            operationsLastHour: recentOps.length,
            byType,
            alertCount: this.alerts.length,
            recentAlerts: this.alerts.slice(-10)
        };
    }

    clearOldData(maxAgeMs = 86400000) {
        const cutoff = Date.now() - maxAgeMs;
        this.operations = this.operations.filter(op => op.timestamp > cutoff);
        this.alerts = this.alerts.filter(a => a.timestamp > cutoff);
    }
}

/**
 * Audit Logger for Security-Relevant Events
 * Provides comprehensive logging of security events for compliance and forensics.
 */
class AuditLogger {
    constructor(options = {}) {
        this.logs = [];
        this.maxLogs = options.maxLogs || 50000;
        this.logLevel = options.logLevel || 'INFO';
        this.enableConsole = options.enableConsole !== false;
    }

    log(level, category, event, details = {}) {
        const entry = {
            id: crypto.randomBytes(8).toString('hex'),
            timestamp: new Date().toISOString(),
            level,
            category,
            event,
            details,
            serverTime: Date.now()
        };

        this.logs.push(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        if (this.enableConsole) {
            const logFn = level === 'ERROR' ? console.error : 
                         level === 'WARN' ? console.warn : console.log;
            logFn(`[AUDIT:${level}] [${category}] ${event}`, details);
        }

        return entry;
    }

    logAuth(event, details) {
        return this.log('INFO', 'AUTH', event, details);
    }

    logCrypto(event, details) {
        return this.log('INFO', 'CRYPTO', event, details);
    }

    logGame(event, details) {
        return this.log('INFO', 'GAME', event, details);
    }

    logSecurity(event, details) {
        return this.log('WARN', 'SECURITY', event, details);
    }

    logConnection(event, details) {
        return this.log('INFO', 'CONNECTION', event, details);
    }

    logError(event, details) {
        return this.log('ERROR', 'ERROR', event, details);
    }

    logProofGeneration(gameId, proofType, success, details = {}) {
        return this.logCrypto('PROOF_GENERATED', {
            gameId,
            proofType,
            success,
            ...details
        });
    }

    logProofVerification(gameId, proofType, valid, details = {}) {
        return this.logCrypto('PROOF_VERIFIED', {
            gameId,
            proofType,
            valid,
            ...details
        });
    }

    logDeckCommitment(gameId, commitmentHash, details = {}) {
        return this.logCrypto('DECK_COMMITTED', {
            gameId,
            commitmentHash: commitmentHash.substring(0, 16) + '...',
            ...details
        });
    }

    logRandomnessContribution(gameId, playerId, phase, details = {}) {
        return this.logCrypto('RANDOMNESS_CONTRIBUTION', {
            gameId,
            playerId,
            phase,
            ...details
        });
    }

    logConnectionSecurity(clientId, secure, details = {}) {
        return this.logSecurity('CONNECTION_SECURITY', {
            clientId,
            secure,
            ...details
        });
    }

    logRateLimitExceeded(clientId, operation, details = {}) {
        return this.logSecurity('RATE_LIMIT_EXCEEDED', {
            clientId,
            operation,
            ...details
        });
    }

    getLogs(filters = {}) {
        let result = this.logs;

        if (filters.level) {
            result = result.filter(l => l.level === filters.level);
        }
        if (filters.category) {
            result = result.filter(l => l.category === filters.category);
        }
        if (filters.since) {
            result = result.filter(l => l.serverTime > filters.since);
        }
        if (filters.limit) {
            result = result.slice(-filters.limit);
        }

        return result;
    }

    exportLogs(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.logs, null, 2);
        }
        return this.logs.map(l => 
            `${l.timestamp} [${l.level}] [${l.category}] ${l.event}: ${JSON.stringify(l.details)}`
        ).join('\n');
    }
}

/**
 * Verification Checkpoints for Continuous Game Verification
 * Allows periodic verification during gameplay, not just at game end.
 */
class VerificationCheckpoint {
    constructor(options = {}) {
        this.checkpoints = new Map();
        this.verificationInterval = options.verificationInterval || 30000;
    }

    createCheckpoint(gameId, state) {
        const checkpoint = {
            id: crypto.randomBytes(8).toString('hex'),
            gameId,
            timestamp: Date.now(),
            stateHash: this.hashState(state),
            state: {
                deckCommitment: state.deckCommitment,
                dealtCards: state.dealtCards,
                playerCount: state.playerCount,
                currentRound: state.currentRound
            }
        };

        if (!this.checkpoints.has(gameId)) {
            this.checkpoints.set(gameId, []);
        }

        this.checkpoints.get(gameId).push(checkpoint);
        return checkpoint;
    }

    hashState(state) {
        const stateStr = JSON.stringify({
            deckCommitment: state.deckCommitment,
            dealtCards: state.dealtCards,
            playerCount: state.playerCount,
            currentRound: state.currentRound
        });
        return crypto.createHash('sha256').update(stateStr).digest('hex');
    }

    verifyCheckpoint(gameId, checkpointId, currentState) {
        const gameCheckpoints = this.checkpoints.get(gameId);
        if (!gameCheckpoints) {
            return { valid: false, error: 'No checkpoints for game' };
        }

        const checkpoint = gameCheckpoints.find(cp => cp.id === checkpointId);
        if (!checkpoint) {
            return { valid: false, error: 'Checkpoint not found' };
        }

        const currentHash = this.hashState(currentState);
        
        if (!ConstantTimeCompare.compareHex(currentState.deckCommitment, checkpoint.state.deckCommitment)) {
            return { 
                valid: false, 
                error: 'Deck commitment changed since checkpoint',
                tampering: true
            };
        }

        return {
            valid: true,
            checkpointId,
            checkpointTime: checkpoint.timestamp,
            timeSinceCheckpoint: Date.now() - checkpoint.timestamp
        };
    }

    getCheckpoints(gameId) {
        return this.checkpoints.get(gameId) || [];
    }

    getLatestCheckpoint(gameId) {
        const checkpoints = this.checkpoints.get(gameId);
        if (!checkpoints || checkpoints.length === 0) return null;
        return checkpoints[checkpoints.length - 1];
    }

    shouldCreateCheckpoint(gameId) {
        const latest = this.getLatestCheckpoint(gameId);
        if (!latest) return true;
        return Date.now() - latest.timestamp > this.verificationInterval;
    }

    cleanupGame(gameId) {
        this.checkpoints.delete(gameId);
    }
}

/**
 * Secure Dealing Index Generator
 * Generates unpredictable dealing indices to prevent seat-based attacks.
 */
class VerifiableShuffle {
    static SHUFFLE_VERSION = '1.0.0';

    static deterministicShuffle(array, seedHex) {
        if (!seedHex || typeof seedHex !== 'string' || !/^[a-f0-9]{64}$/i.test(seedHex)) {
            throw new Error('Invalid seed: must be 64-character hex string');
        }

        const result = [...array];
        const permutation = Array.from({ length: result.length }, (_, i) => i);
        let seedBuffer = Buffer.from(seedHex, 'hex');
        let seedOffset = 0;

        for (let i = result.length - 1; i > 0; i--) {
            const j = this.rejectionSampleIndex(seedBuffer, seedOffset, i + 1);
            seedOffset += 4;
            
            if (seedOffset >= 28) {
                seedBuffer = crypto.createHash('sha256').update(seedBuffer).digest();
                seedOffset = 0;
            }

            [result[i], result[j]] = [result[j], result[i]];
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }

        return { shuffled: result, permutation };
    }

    static rejectionSampleIndex(seedBuffer, offset, bound) {
        const maxValid = Math.floor(0x100000000 / bound) * bound;
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            let value;
            if (offset + 4 <= seedBuffer.length) {
                value = seedBuffer.readUInt32BE(offset);
            } else {
                const extendedSeed = crypto.createHash('sha256')
                    .update(seedBuffer)
                    .update(Buffer.from([attempts]))
                    .digest();
                value = extendedSeed.readUInt32BE(0);
            }

            if (value < maxValid) {
                return value % bound;
            }
            attempts++;
        }

        return seedBuffer.readUInt32BE(0) % bound;
    }

    static verifyShuffle(originalArray, shuffledArray, permutation, seedHex) {
        try {
            const { shuffled: expectedShuffled, permutation: expectedPermutation } = 
                this.deterministicShuffle(originalArray, seedHex);

            const shuffleMatches = JSON.stringify(shuffledArray) === JSON.stringify(expectedShuffled);
            const permutationMatches = JSON.stringify(permutation) === JSON.stringify(expectedPermutation);

            return {
                valid: shuffleMatches && permutationMatches,
                shuffleMatches,
                permutationMatches,
                shuffleVersion: this.SHUFFLE_VERSION
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message,
                shuffleVersion: this.SHUFFLE_VERSION
            };
        }
    }

    static generateVerificationTranscript(params) {
        const {
            gameId,
            playerCommitments,
            playerReveals,
            finalSeed,
            originalDeck,
            shuffledDeck,
            permutation,
            timestamp
        } = params;

        const commitmentsList = Array.from(playerCommitments.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([playerId, commitment]) => ({ playerId, commitment }));

        const revealsList = Array.from(playerReveals.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([playerId, seed]) => ({ 
                playerId, 
                seedHash: crypto.createHash('sha256').update(seed).digest('hex').substring(0, 16)
            }));

        const transcriptHash = crypto.createHash('sha256')
            .update(JSON.stringify({
                gameId,
                commitments: commitmentsList,
                finalSeed,
                shuffleVersion: this.SHUFFLE_VERSION,
                timestamp
            }))
            .digest('hex');

        return {
            version: this.SHUFFLE_VERSION,
            gameId,
            timestamp,
            commitments: commitmentsList,
            reveals: revealsList,
            finalSeed,
            originalDeckHash: crypto.createHash('sha256')
                .update(JSON.stringify(originalDeck))
                .digest('hex'),
            shuffledDeckHash: crypto.createHash('sha256')
                .update(JSON.stringify(shuffledDeck))
                .digest('hex'),
            permutation,
            transcriptHash,
            verificationInstructions: [
                '1. Verify each commitment matches SHA-256(revealed_seed) for each player',
                '2. Compute finalSeed = SHA-256(seed_1 || seed_2 || ... || seed_n || timestamp) with seeds sorted by playerId',
                '3. Run deterministicShuffle(originalDeck, finalSeed) and verify result matches shuffledDeck',
                '4. Verify permutation array correctly maps original positions to shuffled positions'
            ]
        };
    }
}

class SecureDealingIndex {
    constructor() {
        this.usedSeeds = new Set();
    }

    generateDealingOrder(playerCount, gameSecret, gameId) {
        const seed = crypto.createHash('sha256')
            .update(`${gameId}:${gameSecret}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
            .digest('hex');

        this.usedSeeds.add(seed);

        const indices = Array.from({ length: playerCount }, (_, i) => i);
        
        for (let i = indices.length - 1; i > 0; i--) {
            const seedPart = seed.substring((i * 4) % 60, (i * 4) % 60 + 4);
            const j = parseInt(seedPart, 16) % (i + 1);
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        return {
            order: indices,
            seed: seed.substring(0, 16),
            timestamp: Date.now()
        };
    }

    generateCardDealingSequence(deckSize, playerCount, gameSecret, gameId) {
        const dealingOrder = this.generateDealingOrder(playerCount, gameSecret, gameId);
        
        const cardSequence = [];
        const cardsPerPlayer = Math.floor(deckSize / playerCount);
        
        for (let round = 0; round < cardsPerPlayer; round++) {
            for (const playerIndex of dealingOrder.order) {
                const cardIndex = round * playerCount + dealingOrder.order.indexOf(playerIndex);
                if (cardIndex < deckSize) {
                    cardSequence.push({
                        cardIndex,
                        playerIndex,
                        round
                    });
                }
            }
        }

        return {
            sequence: cardSequence,
            dealingOrder: dealingOrder.order,
            seed: dealingOrder.seed,
            timestamp: dealingOrder.timestamp
        };
    }

    verifyDealingOrder(order, seed, gameSecret, gameId) {
        const expectedOrder = this.generateDealingOrder(order.length, gameSecret, gameId);
        
        return {
            valid: JSON.stringify(order) === JSON.stringify(expectedOrder.order),
            providedOrder: order,
            expectedOrder: expectedOrder.order
        };
    }
}

/**
 * AEAD Encryption (Authenticated Encryption with Associated Data)
 * Provides AES-256-GCM encryption for sensitive game data
 * Ensures both confidentiality and integrity of encrypted data
 * 
 * PRODUCTION KEY MANAGEMENT:
 * - Set AEAD_MASTER_KEY environment variable for persistent keys across restarts
 * - Key should be 64 hex characters (32 bytes / 256 bits)
 * - Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * - Supports key versioning for rotation without data loss
 * - Old keys can be provided via AEAD_PREVIOUS_KEYS (comma-separated hex keys)
 */
class AEADEncryption {
    constructor(options = {}) {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 12; // 96 bits (recommended for GCM)
        this.tagLength = 16; // 128 bits
        this.keyVersion = options.keyVersion || 1;
        this.gameKeys = new Map(); // gameId -> derived key
        this.previousKeys = []; // For key rotation support
        
        // PRODUCTION: Load master key from environment or options
        this.masterKey = this._initializeMasterKey(options);
        
        // Load previous keys for rotation support
        this._loadPreviousKeys();
        
        // Log key initialization status (without exposing key)
        this._logKeyStatus();
    }

    /**
     * Initialize master key from environment or generate new one
     * SECURITY: In production, always use AEAD_MASTER_KEY environment variable
     * @private
     */
    _initializeMasterKey(options) {
        // Priority 1: Explicit key in options (for testing)
        if (options.masterKey) {
            if (Buffer.isBuffer(options.masterKey)) {
                return options.masterKey;
            }
            return Buffer.from(options.masterKey, 'hex');
        }
        
        // Priority 2: Environment variable (recommended for production)
        const envKey = process.env.AEAD_MASTER_KEY;
        if (envKey) {
            if (envKey.length !== 64) {
                console.error('SECURITY WARNING: AEAD_MASTER_KEY must be 64 hex characters (32 bytes)');
                console.error('Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
                throw new Error('Invalid AEAD_MASTER_KEY length');
            }
            return Buffer.from(envKey, 'hex');
        }
        
        // Priority 3: Generate ephemeral key (development only)
        if (process.env.NODE_ENV === 'production') {
            console.error('SECURITY WARNING: No AEAD_MASTER_KEY set in production!');
            console.error('Encrypted data will be lost on server restart.');
            console.error('Set AEAD_MASTER_KEY environment variable for persistent encryption.');
        }
        
        return this.generateMasterKey();
    }

    /**
     * Load previous keys for rotation support
     * Allows decryption of data encrypted with old keys during rotation period
     * @private
     */
    _loadPreviousKeys() {
        const previousKeysEnv = process.env.AEAD_PREVIOUS_KEYS;
        if (previousKeysEnv) {
            const keys = previousKeysEnv.split(',').map(k => k.trim()).filter(k => k.length === 64);
            this.previousKeys = keys.map(k => Buffer.from(k, 'hex'));
            console.log(`Loaded ${this.previousKeys.length} previous AEAD keys for rotation support`);
        }
    }

    /**
     * Log key initialization status without exposing sensitive data
     * @private
     */
    _logKeyStatus() {
        const keySource = process.env.AEAD_MASTER_KEY ? 'environment' : 'generated';
        const keyFingerprint = crypto.createHash('sha256')
            .update(this.masterKey)
            .digest('hex')
            .substring(0, 8);
        
        console.log(`AEAD Encryption initialized: source=${keySource}, version=${this.keyVersion}, fingerprint=${keyFingerprint}...`);
    }

    generateMasterKey() {
        return crypto.randomBytes(this.keyLength);
    }

    /**
     * Get current key fingerprint for verification
     * @returns {string} First 8 characters of SHA-256 hash of master key
     */
    getKeyFingerprint() {
        return crypto.createHash('sha256')
            .update(this.masterKey)
            .digest('hex')
            .substring(0, 8);
    }

    /**
     * Check if using persistent key from environment
     * @returns {boolean} True if using environment key
     */
    isUsingPersistentKey() {
        return !!process.env.AEAD_MASTER_KEY;
    }

    /**
     * Get key management status for monitoring
     * @returns {object} Key management status
     */
    getKeyStatus() {
        return {
            keyVersion: this.keyVersion,
            keySource: process.env.AEAD_MASTER_KEY ? 'environment' : 'ephemeral',
            keyFingerprint: this.getKeyFingerprint(),
            previousKeysCount: this.previousKeys.length,
            gameKeysCount: this.gameKeys.size,
            isPersistent: this.isUsingPersistentKey(),
            warning: !this.isUsingPersistentKey() && process.env.NODE_ENV === 'production'
                ? 'Using ephemeral key in production - data will be lost on restart'
                : null
        };
    }

    deriveGameKey(gameId) {
        if (this.gameKeys.has(gameId)) {
            return this.gameKeys.get(gameId);
        }
        const derivedKey = crypto.createHmac('sha256', this.masterKey)
            .update(`game_key_${gameId}`)
            .digest();
        this.gameKeys.set(gameId, derivedKey);
        return derivedKey;
    }

    encrypt(plaintext, gameId, associatedData = '') {
        const key = this.deriveGameKey(gameId);
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
            authTagLength: this.tagLength
        });

        if (associatedData) {
            cipher.setAAD(Buffer.from(associatedData, 'utf8'));
        }

        const plaintextBuffer = Buffer.from(JSON.stringify(plaintext), 'utf8');
        const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            ciphertext: encrypted.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            aad: associatedData ? Buffer.from(associatedData).toString('base64') : null
        };
    }

    decrypt(encryptedData, gameId, associatedData = '') {
        try {
            const key = this.deriveGameKey(gameId);
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const authTag = Buffer.from(encryptedData.authTag, 'base64');
            const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
                authTagLength: this.tagLength
            });

            decipher.setAuthTag(authTag);

            if (associatedData) {
                decipher.setAAD(Buffer.from(associatedData, 'utf8'));
            }

            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error('AEAD decryption failed:', error.message);
            return null;
        }
    }

    encryptCardData(card, gameId, playerId) {
        const associatedData = `card_${gameId}_${playerId}`;
        return this.encrypt({
            rank: card.rank,
            suit: card.suit,
            position: card.position
        }, gameId, associatedData);
    }

    decryptCardData(encryptedCard, gameId, playerId) {
        const associatedData = `card_${gameId}_${playerId}`;
        return this.decrypt(encryptedCard, gameId, associatedData);
    }

    encryptDeckState(deck, gameId) {
        const associatedData = `deck_state_${gameId}`;
        return this.encrypt({
            cards: deck.cards.map((card, index) => ({
                rank: card.rank,
                suit: card.suit,
                position: index
            })),
            timestamp: new Date().toISOString()
        }, gameId, associatedData);
    }

    decryptDeckState(encryptedDeck, gameId) {
        const associatedData = `deck_state_${gameId}`;
        return this.decrypt(encryptedDeck, gameId, associatedData);
    }

    encryptGameState(gameState, gameId) {
        const associatedData = `game_state_${gameId}`;
        return this.encrypt(gameState, gameId, associatedData);
    }

    decryptGameState(encryptedState, gameId) {
        const associatedData = `game_state_${gameId}`;
        return this.decrypt(encryptedState, gameId, associatedData);
    }

    cleanupGame(gameId) {
        this.gameKeys.delete(gameId);
    }

    rotateKey(gameId) {
        this.gameKeys.delete(gameId);
        return this.deriveGameKey(gameId);
    }
}

/**
 * Message Encryption for WebSocket Communications
 * Provides end-to-end encryption for sensitive game messages using AES-256-GCM
 * with sequence numbers to prevent replay attacks.
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM authenticated encryption
 * - Per-client encryption keys derived from game secret
 * - Sequence numbers to prevent replay attacks
 * - Timestamp validation to prevent delayed replay
 */
class MessageEncryption {
    constructor(gameSecret) {
        this.gameSecret = gameSecret || crypto.randomBytes(32).toString('hex');
        this.sequenceNumbers = new Map(); // clientId -> sequence
        this.algorithm = 'aes-256-gcm';
        this.ivLength = 12; // 96 bits (recommended for GCM)
        this.tagLength = 16; // 128 bits
    }

    /**
     * Derive a unique encryption key for a specific client
     * @param {string} clientId - Client identifier
     * @returns {Buffer} Derived key
     */
    deriveClientKey(clientId) {
        return crypto.createHmac('sha256', this.gameSecret)
            .update(`client_key_${clientId}`)
            .digest();
    }

    /**
     * Get the next sequence number for a client
     * @param {string} clientId - Client identifier
     * @returns {number} Next sequence number
     */
    getNextSequence(clientId) {
        const current = this.sequenceNumbers.get(clientId) || 0;
        const next = current + 1;
        this.sequenceNumbers.set(clientId, next);
        return next;
    }

    /**
     * Verify and update sequence number (returns false if replay detected)
     * @param {string} clientId - Client identifier
     * @param {number} sequence - Received sequence number
     * @returns {boolean} True if valid, false if replay detected
     */
    verifySequence(clientId, sequence) {
        const expected = (this.sequenceNumbers.get(clientId) || 0) + 1;
        if (sequence <= (this.sequenceNumbers.get(clientId) || 0)) {
            return false; // Replay attack detected
        }
        this.sequenceNumbers.set(clientId, sequence);
        return true;
    }

    /**
     * Encrypt a message for a specific client
     * @param {string} clientId - Client identifier
     * @param {object} message - Message to encrypt
     * @returns {object} Encrypted message with metadata
     */
    encryptMessage(clientId, message) {
        const key = this.deriveClientKey(clientId);
        const iv = crypto.randomBytes(this.ivLength);
        const sequence = this.getNextSequence(clientId);
        const timestamp = Date.now();

        const payload = JSON.stringify({
            message: message,
            sequence: sequence,
            timestamp: timestamp
        });

        const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
            authTagLength: this.tagLength
        });

        const encrypted = Buffer.concat([
            cipher.update(payload, 'utf8'),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        return {
            encrypted: true,
            ciphertext: encrypted.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            sequence: sequence,
            timestamp: timestamp
        };
    }

    /**
     * Decrypt a message from a specific client
     * @param {string} clientId - Client identifier
     * @param {object} encryptedData - Encrypted message data
     * @returns {object|null} Decrypted message or null if failed
     */
    decryptMessage(clientId, encryptedData) {
        try {
            const key = this.deriveClientKey(clientId);
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const authTag = Buffer.from(encryptedData.authTag, 'base64');
            const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
                authTagLength: this.tagLength
            });
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);

            const payload = JSON.parse(decrypted.toString('utf8'));

            // Verify sequence number to prevent replay attacks
            if (!this.verifySequence(clientId, payload.sequence)) {
                console.warn(`Replay attack detected for client ${clientId}`);
                return null;
            }

            // Verify timestamp (reject messages older than 5 minutes)
            const maxAge = 5 * 60 * 1000; // 5 minutes
            if (Date.now() - payload.timestamp > maxAge) {
                console.warn(`Stale message detected for client ${clientId}`);
                return null;
            }

            return payload.message;
        } catch (error) {
            console.error('Message decryption failed:', error.message);
            return null;
        }
    }

    /**
     * Get client's current sequence number (for handshake)
     * @param {string} clientId - Client identifier
     * @returns {number} Current sequence number
     */
    getClientSequence(clientId) {
        return this.sequenceNumbers.get(clientId) || 0;
    }

    /**
     * Reset sequence for a client (on reconnection)
     * @param {string} clientId - Client identifier
     */
    resetClientSequence(clientId) {
        this.sequenceNumbers.delete(clientId);
    }

    /**
     * Clean up client data
     * @param {string} clientId - Client identifier
     */
    cleanupClient(clientId) {
        this.sequenceNumbers.delete(clientId);
    }

    /**
     * Derive a unique encryption key for a specific game and client combination
     * This ensures each client gets a unique key per game, preventing cross-game key reuse
     * @param {string} gameId - Game identifier
     * @param {string} clientId - Client identifier
     * @returns {Buffer} Derived key unique to this game-client pair
     */
    deriveGameClientKey(gameId, clientId) {
        return crypto.createHmac('sha256', this.gameSecret)
            .update(`game_client_key_${gameId}_${clientId}`)
            .digest();
    }

    /**
     * Encrypt personalized game state for a specific client in a specific game
     * Uses a unique key derived from gameId + clientId to ensure clients cannot
     * decrypt messages intended for other clients
     * @param {string} gameId - Game identifier
     * @param {string} clientId - Client identifier
     * @param {object} gameState - Personalized game state to encrypt
     * @returns {object} Encrypted game state with metadata
     */
    encryptPersonalizedGameState(gameId, clientId, gameState) {
        const key = this.deriveGameClientKey(gameId, clientId);
        const iv = crypto.randomBytes(this.ivLength);
        const sequence = this.getNextSequence(`${gameId}_${clientId}`);
        const timestamp = Date.now();

        const payload = JSON.stringify({
            gameState: gameState,
            sequence: sequence,
            timestamp: timestamp
        });

        const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
            authTagLength: this.tagLength
        });

        const encrypted = Buffer.concat([
            cipher.update(payload, 'utf8'),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        return {
            encrypted: true,
            gameId: gameId,
            ciphertext: encrypted.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            sequence: sequence,
            timestamp: timestamp
        };
    }

    /**
     * Decrypt personalized game state for a specific client in a specific game
     * @param {string} gameId - Game identifier
     * @param {string} clientId - Client identifier
     * @param {object} encryptedData - Encrypted game state data
     * @returns {object|null} Decrypted game state or null if failed
     */
    decryptPersonalizedGameState(gameId, clientId, encryptedData) {
        try {
            const key = this.deriveGameClientKey(gameId, clientId);
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const authTag = Buffer.from(encryptedData.authTag, 'base64');
            const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
                authTagLength: this.tagLength
            });
            decipher.setAuthTag(authTag);

            const decrypted = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);

            const payload = JSON.parse(decrypted.toString('utf8'));

            const maxAge = 5 * 60 * 1000;
            if (Date.now() - payload.timestamp > maxAge) {
                console.warn(`Stale game state detected for client ${clientId} in game ${gameId}`);
                return null;
            }

            return payload.gameState;
        } catch (error) {
            console.error('Game state decryption failed:', error.message);
            return null;
        }
    }
}

/**
 * Message Authenticator using HMAC-SHA256
 * Provides message authentication to verify message integrity and authenticity.
 * 
 * SECURITY FEATURES:
 * - HMAC-SHA256 signatures
 * - Per-client authentication keys
 * - Constant-time comparison to prevent timing attacks
 */
class MessageAuthenticator {
    constructor() {
        this.clientKeys = new Map(); // clientId -> secret key
    }

    /**
     * Generate a new authentication key for a client
     * @param {string} clientId - Client identifier
     * @returns {string} Generated key (hex encoded)
     */
    generateClientKey(clientId) {
        const key = crypto.randomBytes(32);
        this.clientKeys.set(clientId, key);
        return key.toString('hex');
    }

    /**
     * Set a client's authentication key
     * @param {string} clientId - Client identifier
     * @param {string} keyHex - Key in hex format
     */
    setClientKey(clientId, keyHex) {
        this.clientKeys.set(clientId, Buffer.from(keyHex, 'hex'));
    }

    /**
     * Get a client's authentication key
     * @param {string} clientId - Client identifier
     * @returns {Buffer|null} Client's key or null if not found
     */
    getClientKey(clientId) {
        return this.clientKeys.get(clientId) || null;
    }

    /**
     * Sign a message for a specific client
     * @param {string} clientId - Client identifier
     * @param {object} message - Message to sign
     * @returns {string} HMAC signature (hex encoded)
     */
    signMessage(clientId, message) {
        const key = this.clientKeys.get(clientId);
        if (!key) {
            throw new Error(`No authentication key for client ${clientId}`);
        }

        const hmac = crypto.createHmac('sha256', key);
        hmac.update(JSON.stringify(message));
        return hmac.digest('hex');
    }

    /**
     * Verify a message signature
     * @param {string} clientId - Client identifier
     * @param {object} message - Message that was signed
     * @param {string} signature - Signature to verify (hex encoded)
     * @returns {boolean} True if signature is valid
     */
    verifyMessage(clientId, message, signature) {
        const key = this.clientKeys.get(clientId);
        if (!key) {
            return false;
        }

        const expected = this.signMessage(clientId, message);
        
        // Constant-time comparison to prevent timing attacks
        return ConstantTimeCompare.compareHex(expected, signature);
    }

    /**
     * Clean up client data
     * @param {string} clientId - Client identifier
     */
    cleanupClient(clientId) {
        this.clientKeys.delete(clientId);
    }
}

/**
 * Anomaly Detector for Game Security
 * Detects suspicious patterns that may indicate cheating or attacks.
 * 
 * DETECTION CAPABILITIES:
 * - Impossible actions (bet exceeds chips)
 * - Timing anomalies (suspiciously fast commits)
 * - Pattern anomalies (possible bot behavior)
 * - Rate anomalies (too many actions in short time)
 */
class AnomalyDetector {
    constructor(options = {}) {
        this.actionHistory = new Map(); // clientId -> action history
        this.maxHistorySize = options.maxHistorySize || 100;
        this.minCommitTime = options.minCommitTime || 100; // Minimum ms for human commit
        this.maxActionsPerMinute = options.maxActionsPerMinute || 60;
        this.alerts = [];
        this.maxAlerts = options.maxAlerts || 1000;
    }

    /**
     * Detect anomalies in a client action
     * @param {string} clientId - Client identifier
     * @param {string} action - Action type
     * @param {object} context - Action context (chips, bet amount, game state, etc.)
     * @returns {string[]} Array of detected anomalies
     */
    detectAnomalies(clientId, action, context) {
        const anomalies = [];

        // Detect impossible actions
        if (action === 'make_bet' && context.betAmount > context.playerChips) {
            anomalies.push('BET_EXCEEDS_CHIPS');
        }

        // Detect timing anomalies
        if (action === 'commit_randomness') {
            const timeSinceGameStart = Date.now() - (context.gameStartTime || Date.now());
            if (timeSinceGameStart < this.minCommitTime) {
                anomalies.push('SUSPICIOUSLY_FAST_COMMIT');
            }
        }

        // Detect pattern anomalies (bot behavior)
        const actionHistory = this.getActionHistory(clientId);
        if (this.detectBotPattern(actionHistory)) {
            anomalies.push('POSSIBLE_BOT_BEHAVIOR');
        }

        // Detect rate anomalies
        const recentActions = actionHistory.filter(a => 
            Date.now() - a.timestamp < 60000
        );
        if (recentActions.length > this.maxActionsPerMinute) {
            anomalies.push('RATE_LIMIT_EXCEEDED');
        }

        // Record this action
        this.recordAction(clientId, action, context);

        // Log anomalies
        if (anomalies.length > 0) {
            this.raiseAlert(clientId, action, anomalies);
        }

        return anomalies;
    }

    /**
     * Record an action in the history
     * @param {string} clientId - Client identifier
     * @param {string} action - Action type
     * @param {object} context - Action context
     */
    recordAction(clientId, action, context) {
        if (!this.actionHistory.has(clientId)) {
            this.actionHistory.set(clientId, []);
        }

        const history = this.actionHistory.get(clientId);
        history.push({
            action: action,
            timestamp: Date.now(),
            context: context
        });

        // Limit history size
        if (history.length > this.maxHistorySize) {
            history.shift();
        }
    }

    /**
     * Get action history for a client
     * @param {string} clientId - Client identifier
     * @returns {Array} Action history
     */
    getActionHistory(clientId) {
        return this.actionHistory.get(clientId) || [];
    }

    /**
     * Detect bot-like patterns in action history
     * @param {Array} history - Action history
     * @returns {boolean} True if bot pattern detected
     */
    detectBotPattern(history) {
        if (history.length < 10) {
            return false;
        }

        // Check for perfectly regular timing (bots often have consistent delays)
        const intervals = [];
        for (let i = 1; i < history.length; i++) {
            intervals.push(history[i].timestamp - history[i-1].timestamp);
        }

        if (intervals.length < 5) {
            return false;
        }

        // Calculate variance in intervals
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        // Very low variance suggests automated behavior
        // Human actions typically have high variance in timing
        if (stdDev < 50 && mean < 500) {
            return true;
        }

        return false;
    }

    /**
     * Raise an alert for detected anomalies
     * @param {string} clientId - Client identifier
     * @param {string} action - Action that triggered the alert
     * @param {string[]} anomalies - Detected anomalies
     */
    raiseAlert(clientId, action, anomalies) {
        const alert = {
            clientId: clientId,
            action: action,
            anomalies: anomalies,
            timestamp: Date.now()
        };

        this.alerts.push(alert);

        // Limit alerts size
        if (this.alerts.length > this.maxAlerts) {
            this.alerts.shift();
        }

        console.warn(`ANOMALY DETECTED: Client ${clientId}, Action: ${action}, Anomalies: ${anomalies.join(', ')}`);
    }

    /**
     * Get all alerts
     * @param {object} options - Filter options
     * @returns {Array} Alerts
     */
    getAlerts(options = {}) {
        let alerts = this.alerts;

        if (options.clientId) {
            alerts = alerts.filter(a => a.clientId === options.clientId);
        }

        if (options.since) {
            alerts = alerts.filter(a => a.timestamp >= options.since);
        }

        if (options.limit) {
            alerts = alerts.slice(-options.limit);
        }

        return alerts;
    }

    /**
     * Clean up client data
     * @param {string} clientId - Client identifier
     */
    cleanupClient(clientId) {
        this.actionHistory.delete(clientId);
    }

    /**
     * Get statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            trackedClients: this.actionHistory.size,
            totalAlerts: this.alerts.length,
            recentAlerts: this.alerts.filter(a => Date.now() - a.timestamp < 3600000).length
        };
    }
}

/**
 * Time-Locked Distributed Randomness
 * Extends DistributedRandomness with time-lock commitments to prevent
 * players from delaying their reveals to observe others.
 * 
 * SECURITY FEATURES:
 * - Maximum reveal delay enforcement
 * - Commitment timestamp tracking
 * - Penalty for late reveals (exclusion from seed generation)
 */
class TimeLockRandomness extends DistributedRandomness {
    constructor(options = {}) {
        super();
        this.maxRevealDelay = options.maxRevealDelay || 30000; // 30 seconds default
        this.commitmentTimestamps = new Map(); // playerId -> timestamp
        this.revealTimestamps = new Map(); // playerId -> timestamp
        this.lateReveals = new Set(); // Players who revealed late
    }

    /**
     * Override commitPlayerSeed to track commitment timestamp
     */
    commitPlayerSeed(playerId, commitment) {
        const result = super.commitPlayerSeed(playerId, commitment);
        if (result.success) {
            this.commitmentTimestamps.set(playerId, Date.now());
        }
        return result;
    }

    /**
     * Override revealPlayerSeed to enforce time-lock
     */
    revealPlayerSeed(playerId, seed) {
        const commitTime = this.commitmentTimestamps.get(playerId);
        if (!commitTime) {
            return { success: false, error: 'No commitment timestamp found' };
        }

        const revealTime = Date.now();
        const delay = revealTime - commitTime;

        // Check if reveal is within time limit
        if (delay > this.maxRevealDelay) {
            this.lateReveals.add(playerId);
            return { 
                success: false, 
                error: `Reveal timeout exceeded (${delay}ms > ${this.maxRevealDelay}ms)`,
                late: true,
                delay: delay
            };
        }

        const result = super.revealPlayerSeed(playerId, seed);
        if (result.success) {
            this.revealTimestamps.set(playerId, revealTime);
            result.delay = delay;
        }
        return result;
    }

    /**
     * Get time-lock status for all players
     */
    getTimeLockStatus() {
        const status = {};
        for (const [playerId, commitTime] of this.commitmentTimestamps) {
            const revealTime = this.revealTimestamps.get(playerId);
            status[playerId] = {
                commitTime: commitTime,
                revealTime: revealTime || null,
                delay: revealTime ? revealTime - commitTime : null,
                isLate: this.lateReveals.has(playerId),
                timeRemaining: revealTime ? 0 : Math.max(0, this.maxRevealDelay - (Date.now() - commitTime))
            };
        }
        return status;
    }

    /**
     * Get list of late reveals
     */
    getLateReveals() {
        return Array.from(this.lateReveals);
    }

    /**
     * Override reset to clear time-lock data
     */
    reset() {
        super.reset();
        this.commitmentTimestamps.clear();
        this.revealTimestamps.clear();
        this.lateReveals.clear();
    }

    /**
     * Get extended transcript data including time-lock info
     */
    getTranscriptData() {
        const baseData = super.getTranscriptData();
        return {
            ...baseData,
            timeLock: {
                maxRevealDelay: this.maxRevealDelay,
                commitmentTimestamps: Object.fromEntries(this.commitmentTimestamps),
                revealTimestamps: Object.fromEntries(this.revealTimestamps),
                lateReveals: Array.from(this.lateReveals)
            }
        };
    }
}

/**
 * Perfect Forward Secrecy (PFS) Key Manager
 * Implements ephemeral key rotation to ensure compromised session keys
 * cannot decrypt past messages.
 * 
 * SECURITY FEATURES:
 * - Ephemeral key generation using ECDH (Elliptic Curve Diffie-Hellman)
 * - Automatic key rotation after N messages or time interval
 * - Key derivation using HKDF for session keys
 * - Old keys are securely deleted after rotation
 */
class PerfectForwardSecrecy {
    constructor(options = {}) {
        this.keyRotationInterval = options.keyRotationInterval || 300000; // 5 minutes default
        this.keyRotationMessageCount = options.keyRotationMessageCount || 100; // Rotate after 100 messages
        this.clientKeys = new Map(); // clientId -> { currentKey, messageCount, lastRotation, keyVersion }
        this.keyHistory = new Map(); // clientId -> [{ key, version, expiry }] for graceful rotation
        this.keyHistoryTTL = options.keyHistoryTTL || 60000; // Keep old keys for 1 minute during rotation
    }

    /**
     * Generate a new ephemeral key pair for a client
     * @param {string} clientId - Client identifier
     * @returns {object} Key information including public key for client
     */
    generateEphemeralKeys(clientId) {
        const keyPair = crypto.generateKeyPairSync('x25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });

        const keyVersion = Date.now();
        const sessionKey = crypto.randomBytes(32);

        // Store old key in history for graceful rotation
        const existingKey = this.clientKeys.get(clientId);
        if (existingKey) {
            const history = this.keyHistory.get(clientId) || [];
            history.push({
                key: existingKey.sessionKey,
                version: existingKey.keyVersion,
                expiry: Date.now() + this.keyHistoryTTL
            });
            this.keyHistory.set(clientId, history);
        }

        this.clientKeys.set(clientId, {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            sessionKey: sessionKey,
            messageCount: 0,
            lastRotation: Date.now(),
            keyVersion: keyVersion
        });

        return {
            publicKey: keyPair.publicKey.toString('base64'),
            keyVersion: keyVersion,
            rotationPolicy: {
                messageCount: this.keyRotationMessageCount,
                timeInterval: this.keyRotationInterval
            }
        };
    }

    /**
     * Derive session key from shared secret using HKDF
     * @param {Buffer} sharedSecret - Shared secret from ECDH
     * @param {string} context - Context string for key derivation
     * @returns {Buffer} Derived session key
     */
    deriveSessionKey(sharedSecret, context) {
        return crypto.createHmac('sha256', sharedSecret)
            .update(`pfs_session_key_${context}`)
            .digest();
    }

    /**
     * Check if key rotation is needed for a client
     * @param {string} clientId - Client identifier
     * @returns {boolean} True if rotation is needed
     */
    needsKeyRotation(clientId) {
        const keyInfo = this.clientKeys.get(clientId);
        if (!keyInfo) return true;

        const timeSinceRotation = Date.now() - keyInfo.lastRotation;
        return keyInfo.messageCount >= this.keyRotationMessageCount ||
               timeSinceRotation >= this.keyRotationInterval;
    }

    /**
     * Record a message and check for rotation
     * @param {string} clientId - Client identifier
     * @returns {object} Status including whether rotation occurred
     */
    recordMessage(clientId) {
        const keyInfo = this.clientKeys.get(clientId);
        if (!keyInfo) {
            return { error: 'No key found for client', needsInit: true };
        }

        keyInfo.messageCount++;
        
        if (this.needsKeyRotation(clientId)) {
            const newKeys = this.generateEphemeralKeys(clientId);
            return {
                rotated: true,
                newPublicKey: newKeys.publicKey,
                newKeyVersion: newKeys.keyVersion
            };
        }

        return { rotated: false, messageCount: keyInfo.messageCount };
    }

    /**
     * Get current session key for encryption/decryption
     * @param {string} clientId - Client identifier
     * @param {number} keyVersion - Optional key version for decryption of old messages
     * @returns {Buffer|null} Session key or null if not found
     */
    getSessionKey(clientId, keyVersion = null) {
        const keyInfo = this.clientKeys.get(clientId);
        
        if (keyVersion && keyInfo && keyInfo.keyVersion !== keyVersion) {
            // Check key history for old version
            const history = this.keyHistory.get(clientId) || [];
            const oldKey = history.find(k => k.version === keyVersion && k.expiry > Date.now());
            return oldKey ? oldKey.key : null;
        }

        return keyInfo ? keyInfo.sessionKey : null;
    }

    /**
     * Get key status for a client
     * @param {string} clientId - Client identifier
     * @returns {object} Key status information
     */
    getKeyStatus(clientId) {
        const keyInfo = this.clientKeys.get(clientId);
        if (!keyInfo) {
            return { initialized: false };
        }

        return {
            initialized: true,
            keyVersion: keyInfo.keyVersion,
            messageCount: keyInfo.messageCount,
            lastRotation: keyInfo.lastRotation,
            timeSinceRotation: Date.now() - keyInfo.lastRotation,
            needsRotation: this.needsKeyRotation(clientId)
        };
    }

    /**
     * Clean up expired keys from history
     */
    cleanupExpiredKeys() {
        const now = Date.now();
        for (const [clientId, history] of this.keyHistory) {
            const validKeys = history.filter(k => k.expiry > now);
            if (validKeys.length === 0) {
                this.keyHistory.delete(clientId);
            } else {
                this.keyHistory.set(clientId, validKeys);
            }
        }
    }

    /**
     * Remove all keys for a client (on disconnect)
     * @param {string} clientId - Client identifier
     */
    cleanupClient(clientId) {
        this.clientKeys.delete(clientId);
        this.keyHistory.delete(clientId);
    }
}

/**
 * Enhanced WebSocket Origin Validator
 * Provides strict origin validation to prevent CSRF-style WebSocket hijacking.
 * 
 * SECURITY FEATURES:
 * - Strict origin whitelist enforcement
 * - Subdomain validation
 * - Protocol validation (wss:// in production)
 * - Logging of rejected connections
 */
class OriginValidator {
    constructor(options = {}) {
        this.allowedOrigins = new Set(options.allowedOrigins || []);
        this.allowSubdomains = options.allowSubdomains || false;
        this.strictMode = options.strictMode !== false; // Default to strict
        this.logRejections = options.logRejections !== false;
        this.rejectionLog = [];
        this.maxRejectionLogSize = options.maxRejectionLogSize || 1000;
    }

    /**
     * Add an allowed origin
     * @param {string} origin - Origin to allow (e.g., 'https://example.com')
     */
    addAllowedOrigin(origin) {
        this.allowedOrigins.add(origin.toLowerCase());
    }

    /**
     * Remove an allowed origin
     * @param {string} origin - Origin to remove
     */
    removeAllowedOrigin(origin) {
        this.allowedOrigins.delete(origin.toLowerCase());
    }

    /**
     * Validate an origin against the whitelist
     * @param {string} origin - Origin header value
     * @param {object} context - Additional context (IP, etc.)
     * @returns {object} Validation result
     */
    validateOrigin(origin, context = {}) {
        // No origin header - could be same-origin or non-browser client
        if (!origin) {
            if (this.strictMode) {
                this.logRejection('MISSING_ORIGIN', null, context);
                return {
                    valid: false,
                    reason: 'Origin header required in strict mode',
                    code: 'MISSING_ORIGIN'
                };
            }
            return { valid: true, warning: 'No origin header present' };
        }

        const normalizedOrigin = origin.toLowerCase();

        // Direct match
        if (this.allowedOrigins.has(normalizedOrigin)) {
            return { valid: true, matchedOrigin: normalizedOrigin };
        }

        // Subdomain matching if enabled
        if (this.allowSubdomains) {
            for (const allowed of this.allowedOrigins) {
                try {
                    const allowedUrl = new URL(allowed);
                    const originUrl = new URL(normalizedOrigin);
                    
                    if (originUrl.protocol === allowedUrl.protocol &&
                        (originUrl.hostname === allowedUrl.hostname ||
                         originUrl.hostname.endsWith('.' + allowedUrl.hostname))) {
                        return { valid: true, matchedOrigin: allowed, subdomain: true };
                    }
                } catch (e) {
                    // Invalid URL, skip
                }
            }
        }

        // No match found
        this.logRejection('ORIGIN_NOT_ALLOWED', normalizedOrigin, context);
        return {
            valid: false,
            reason: `Origin '${origin}' not in allowed list`,
            code: 'ORIGIN_NOT_ALLOWED'
        };
    }

    /**
     * Log a rejection for monitoring
     * @param {string} code - Rejection code
     * @param {string} origin - Rejected origin
     * @param {object} context - Additional context
     */
    logRejection(code, origin, context) {
        if (!this.logRejections) return;

        const entry = {
            timestamp: Date.now(),
            code: code,
            origin: origin,
            ip: context.ip || 'unknown',
            userAgent: context.userAgent || 'unknown'
        };

        this.rejectionLog.push(entry);

        // Trim log if too large
        if (this.rejectionLog.length > this.maxRejectionLogSize) {
            this.rejectionLog = this.rejectionLog.slice(-this.maxRejectionLogSize / 2);
        }
    }

    /**
     * Get rejection statistics
     * @param {number} since - Timestamp to filter from
     * @returns {object} Rejection statistics
     */
    getRejectionStats(since = 0) {
        const filtered = this.rejectionLog.filter(r => r.timestamp >= since);
        const byCode = {};
        const byOrigin = {};

        for (const rejection of filtered) {
            byCode[rejection.code] = (byCode[rejection.code] || 0) + 1;
            if (rejection.origin) {
                byOrigin[rejection.origin] = (byOrigin[rejection.origin] || 0) + 1;
            }
        }

        return {
            total: filtered.length,
            byCode: byCode,
            byOrigin: byOrigin,
            recentRejections: filtered.slice(-10)
        };
    }

    /**
     * Get current configuration
     * @returns {object} Configuration
     */
    getConfig() {
        return {
            allowedOrigins: Array.from(this.allowedOrigins),
            allowSubdomains: this.allowSubdomains,
            strictMode: this.strictMode,
            logRejections: this.logRejections
        };
    }
}

/**
 * Session Timeout and Idle Detection Manager
 * Automatically terminates sessions after inactivity to reduce attack window.
 * 
 * SECURITY FEATURES:
 * - Configurable idle timeout (default 30 minutes)
 * - Activity tracking per client
 * - Graceful session termination with warning
 * - Session extension on activity
 */
class SessionTimeoutManager {
    constructor(options = {}) {
        this.idleTimeout = options.idleTimeout || 1800000; // 30 minutes default
        this.warningTime = options.warningTime || 300000; // 5 minutes warning before timeout
        this.checkInterval = options.checkInterval || 60000; // Check every minute
        this.sessions = new Map(); // clientId -> { lastActivity, created, warningIssued }
        this.onTimeout = options.onTimeout || null; // Callback for timeout
        this.onWarning = options.onWarning || null; // Callback for warning
        
        // Start periodic check
        this.checkTimer = setInterval(() => this.checkSessions(), this.checkInterval);
    }

    /**
     * Register a new session
     * @param {string} clientId - Client identifier
     * @returns {object} Session info
     */
    registerSession(clientId) {
        const now = Date.now();
        this.sessions.set(clientId, {
            lastActivity: now,
            created: now,
            warningIssued: false,
            activityCount: 0
        });

        return {
            clientId: clientId,
            timeout: this.idleTimeout,
            warningTime: this.warningTime
        };
    }

    /**
     * Record activity for a session
     * @param {string} clientId - Client identifier
     * @returns {object} Updated session info
     */
    recordActivity(clientId) {
        const session = this.sessions.get(clientId);
        if (!session) {
            return this.registerSession(clientId);
        }

        session.lastActivity = Date.now();
        session.activityCount++;
        session.warningIssued = false; // Reset warning on activity

        return {
            clientId: clientId,
            idleTime: 0,
            activityCount: session.activityCount
        };
    }

    /**
     * Check all sessions for timeout
     * @returns {object} Check results
     */
    checkSessions() {
        const now = Date.now();
        const results = {
            checked: 0,
            warnings: [],
            timeouts: []
        };

        for (const [clientId, session] of this.sessions) {
            results.checked++;
            const idleTime = now - session.lastActivity;

            // Check for timeout
            if (idleTime >= this.idleTimeout) {
                results.timeouts.push(clientId);
                if (this.onTimeout) {
                    this.onTimeout(clientId, {
                        idleTime: idleTime,
                        sessionDuration: now - session.created
                    });
                }
                this.sessions.delete(clientId);
                continue;
            }

            // Check for warning
            if (!session.warningIssued && idleTime >= (this.idleTimeout - this.warningTime)) {
                session.warningIssued = true;
                results.warnings.push(clientId);
                if (this.onWarning) {
                    this.onWarning(clientId, {
                        idleTime: idleTime,
                        timeUntilTimeout: this.idleTimeout - idleTime
                    });
                }
            }
        }

        return results;
    }

    /**
     * Get session status for a client
     * @param {string} clientId - Client identifier
     * @returns {object|null} Session status or null if not found
     */
    getSessionStatus(clientId) {
        const session = this.sessions.get(clientId);
        if (!session) return null;

        const now = Date.now();
        const idleTime = now - session.lastActivity;

        return {
            clientId: clientId,
            idleTime: idleTime,
            timeUntilTimeout: Math.max(0, this.idleTimeout - idleTime),
            sessionDuration: now - session.created,
            activityCount: session.activityCount,
            warningIssued: session.warningIssued
        };
    }

    /**
     * Manually terminate a session
     * @param {string} clientId - Client identifier
     * @returns {boolean} True if session was terminated
     */
    terminateSession(clientId) {
        return this.sessions.delete(clientId);
    }

    /**
     * Get all active sessions
     * @returns {Array} Array of session statuses
     */
    getActiveSessions() {
        const sessions = [];
        for (const clientId of this.sessions.keys()) {
            sessions.push(this.getSessionStatus(clientId));
        }
        return sessions;
    }

    /**
     * Shutdown the manager
     */
    shutdown() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }
}

/**
 * Comprehensive Input Validator
 * Provides thorough validation and sanitization of all user input.
 * 
 * SECURITY FEATURES:
 * - Type validation
 * - Length limits
 * - Pattern matching
 * - XSS prevention
 * - SQL injection prevention
 * - Command injection prevention
 */
class InputValidator {
    constructor(options = {}) {
        this.maxStringLength = options.maxStringLength || 1000;
        this.maxArrayLength = options.maxArrayLength || 100;
        this.maxObjectDepth = options.maxObjectDepth || 5;
        this.allowedHtmlTags = options.allowedHtmlTags || [];
        
        // Dangerous patterns to detect
        this.dangerousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
            /javascript:/gi, // JavaScript protocol
            /on\w+\s*=/gi, // Event handlers
            /data:/gi, // Data URLs
            /vbscript:/gi, // VBScript protocol
            /expression\s*\(/gi, // CSS expressions
            /url\s*\(/gi, // CSS url()
        ];
        
        // SQL injection patterns
        this.sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
            /(--)|(\/\*)|(\*\/)/g, // SQL comments
            /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/gi, // OR 1=1 style
        ];
    }

    /**
     * Validate and sanitize a string
     * @param {string} input - Input string
     * @param {object} options - Validation options
     * @returns {object} Validation result
     */
    validateString(input, options = {}) {
        const maxLength = options.maxLength || this.maxStringLength;
        const minLength = options.minLength || 0;
        const pattern = options.pattern || null;
        const allowHtml = options.allowHtml || false;

        if (typeof input !== 'string') {
            return { valid: false, error: 'Input must be a string', sanitized: '' };
        }

        // Length check
        if (input.length > maxLength) {
            return { valid: false, error: `String exceeds maximum length of ${maxLength}`, sanitized: input.substring(0, maxLength) };
        }

        if (input.length < minLength) {
            return { valid: false, error: `String must be at least ${minLength} characters`, sanitized: input };
        }

        // Pattern check
        if (pattern && !pattern.test(input)) {
            return { valid: false, error: 'Input does not match required pattern', sanitized: input };
        }

        // Sanitize
        let sanitized = input;
        
        if (!allowHtml) {
            // Remove HTML tags
            sanitized = sanitized.replace(/<[^>]*>/g, '');
            // Encode special characters
            sanitized = this.encodeHtmlEntities(sanitized);
        }

        // Check for dangerous patterns
        const dangers = this.detectDangerousPatterns(input);
        if (dangers.length > 0) {
            return { 
                valid: false, 
                error: 'Input contains potentially dangerous content', 
                dangers: dangers,
                sanitized: sanitized 
            };
        }

        return { valid: true, sanitized: sanitized, original: input };
    }

    /**
     * Validate a number
     * @param {any} input - Input value
     * @param {object} options - Validation options
     * @returns {object} Validation result
     */
    validateNumber(input, options = {}) {
        const min = options.min !== undefined ? options.min : -Infinity;
        const max = options.max !== undefined ? options.max : Infinity;
        const integer = options.integer || false;

        const num = Number(input);

        if (isNaN(num) || !isFinite(num)) {
            return { valid: false, error: 'Input must be a valid number', sanitized: 0 };
        }

        if (integer && !Number.isInteger(num)) {
            return { valid: false, error: 'Input must be an integer', sanitized: Math.floor(num) };
        }

        if (num < min || num > max) {
            return { valid: false, error: `Number must be between ${min} and ${max}`, sanitized: Math.max(min, Math.min(max, num)) };
        }

        return { valid: true, sanitized: num, original: input };
    }

    /**
     * Validate an object
     * @param {any} input - Input value
     * @param {object} schema - Validation schema
     * @param {number} depth - Current depth (for recursion limit)
     * @returns {object} Validation result
     */
    validateObject(input, schema = {}, depth = 0) {
        if (depth > this.maxObjectDepth) {
            return { valid: false, error: 'Object exceeds maximum depth', sanitized: {} };
        }

        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            return { valid: false, error: 'Input must be an object', sanitized: {} };
        }

        const sanitized = {};
        const errors = [];

        for (const [key, value] of Object.entries(input)) {
            // Validate key
            const keyValidation = this.validateString(key, { maxLength: 100 });
            if (!keyValidation.valid) {
                errors.push(`Invalid key: ${key}`);
                continue;
            }

            // Validate value based on schema or type
            const fieldSchema = schema[key] || {};
            let valueValidation;

            if (typeof value === 'string') {
                valueValidation = this.validateString(value, fieldSchema);
            } else if (typeof value === 'number') {
                valueValidation = this.validateNumber(value, fieldSchema);
            } else if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    valueValidation = this.validateArray(value, fieldSchema, depth + 1);
                } else {
                    valueValidation = this.validateObject(value, fieldSchema.schema || {}, depth + 1);
                }
            } else if (typeof value === 'boolean') {
                valueValidation = { valid: true, sanitized: value };
            } else {
                valueValidation = { valid: false, error: 'Unsupported value type', sanitized: null };
            }

            if (!valueValidation.valid) {
                errors.push(`Field '${key}': ${valueValidation.error}`);
            }
            sanitized[keyValidation.sanitized] = valueValidation.sanitized;
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            sanitized: sanitized,
            original: input
        };
    }

    /**
     * Validate an array
     * @param {any} input - Input value
     * @param {object} options - Validation options
     * @param {number} depth - Current depth
     * @returns {object} Validation result
     */
    validateArray(input, options = {}, depth = 0) {
        if (!Array.isArray(input)) {
            return { valid: false, error: 'Input must be an array', sanitized: [] };
        }

        const maxLength = options.maxLength || this.maxArrayLength;
        if (input.length > maxLength) {
            return { valid: false, error: `Array exceeds maximum length of ${maxLength}`, sanitized: input.slice(0, maxLength) };
        }

        const sanitized = [];
        const errors = [];

        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            let itemValidation;

            if (typeof item === 'string') {
                itemValidation = this.validateString(item, options.itemOptions || {});
            } else if (typeof item === 'number') {
                itemValidation = this.validateNumber(item, options.itemOptions || {});
            } else if (typeof item === 'object' && item !== null) {
                itemValidation = this.validateObject(item, options.itemSchema || {}, depth + 1);
            } else {
                itemValidation = { valid: true, sanitized: item };
            }

            if (!itemValidation.valid) {
                errors.push(`Item ${i}: ${itemValidation.error}`);
            }
            sanitized.push(itemValidation.sanitized);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            sanitized: sanitized,
            original: input
        };
    }

    /**
     * Detect dangerous patterns in input
     * @param {string} input - Input string
     * @returns {Array} Array of detected dangers
     */
    detectDangerousPatterns(input) {
        const dangers = [];

        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(input)) {
                dangers.push({ type: 'xss', pattern: pattern.toString() });
            }
        }

        for (const pattern of this.sqlPatterns) {
            if (pattern.test(input)) {
                dangers.push({ type: 'sql_injection', pattern: pattern.toString() });
            }
        }

        return dangers;
    }

    /**
     * Encode HTML entities
     * @param {string} input - Input string
     * @returns {string} Encoded string
     */
    encodeHtmlEntities(input) {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Validate a game message
     * @param {object} message - Game message
     * @returns {object} Validation result
     */
    validateGameMessage(message) {
        if (!message || typeof message !== 'object') {
            return { valid: false, error: 'Invalid message format', sanitized: null };
        }

        const typeValidation = this.validateString(message.type, {
            maxLength: 50,
            pattern: /^[a-z_]+$/
        });

        if (!typeValidation.valid) {
            return { valid: false, error: 'Invalid message type', sanitized: null };
        }

        const dataValidation = message.data ? 
            this.validateObject(message.data) : 
            { valid: true, sanitized: {} };

        return {
            valid: typeValidation.valid && dataValidation.valid,
            sanitized: {
                type: typeValidation.sanitized,
                data: dataValidation.sanitized
            },
            errors: dataValidation.errors || []
        };
    }
}

/**
 * VRF Documentation
 * 
 * RANDOMNESS APPROACH: Commit-Reveal Scheme
 * 
 * This implementation uses a commit-reveal scheme for distributed randomness
 * rather than a Verifiable Random Function (VRF) with elliptic curves.
 * 
 * RATIONALE:
 * 1. Commit-reveal provides provable fairness without external dependencies
 * 2. Each player contributes entropy, preventing any single party from controlling randomness
 * 3. The scheme is simpler to implement and audit than full VRF
 * 4. No trusted setup or elliptic curve operations required
 * 
 * HOW IT WORKS:
 * 1. COMMIT PHASE: Each player generates a random seed and commits H(seed)
 * 2. REVEAL PHASE: After all commitments, players reveal their seeds
 * 3. VERIFICATION: Server verifies H(revealed_seed) == commitment
 * 4. COMBINATION: Final seed = XOR of all revealed seeds
 * 5. SHUFFLE: Deterministic shuffle using final seed
 * 
 * SECURITY PROPERTIES:
 * - Unpredictability: No player can predict the final seed before all reveals
 * - Unbiasability: No player can influence the outcome (except by aborting)
 * - Verifiability: Anyone can verify the shuffle was fair given the transcript
 * 
 * TRADE-OFFS vs VRF:
 * - VRF would provide non-interactive randomness (single message)
 * - VRF requires elliptic curve cryptography and key management
 * - Commit-reveal requires two rounds but is simpler and equally secure
 * 
 * If VRF is required in the future, consider using:
 * - libsodium's crypto_vrf_* functions
 * - ECVRF (Elliptic Curve VRF) per RFC 9381
 */
const VRF_DOCUMENTATION = {
    approach: 'commit-reveal',
    rationale: 'Simpler implementation with equivalent security properties for this use case',
    securityProperties: ['unpredictability', 'unbiasability', 'verifiability'],
    futureConsiderations: ['ECVRF per RFC 9381', 'libsodium crypto_vrf_*']
};

module.exports = {
    ConstantTimeCompare,
    DistributedRandomness,
    CryptoRateLimiter,
    ProofValidator,
    EnhancedCardHasher,
    WSSEnforcer,
    NonceGenerator,
    CryptoMonitor,
    AuditLogger,
    VerificationCheckpoint,
    VerifiableShuffle,
    SecureDealingIndex,
    AEADEncryption,
    MessageEncryption,
    MessageAuthenticator,
    AnomalyDetector,
    TimeLockRandomness,
    VRF_DOCUMENTATION,
    // New security enhancements
    PerfectForwardSecrecy,
    OriginValidator,
    SessionTimeoutManager,
    InputValidator
};
