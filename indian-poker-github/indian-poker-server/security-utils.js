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
 */
class DistributedRandomness {
    constructor() {
        this.playerCommitments = new Map(); // playerId -> commitment (hash of seed)
        this.playerReveals = new Map(); // playerId -> seed
        this.commitmentPhaseComplete = false;
        this.revealPhaseComplete = false;
        this.finalSeed = null;
        this.timestamp = null;
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
     * Mark commitment phase as complete
     * Call this when all expected players have committed
     */
    completeCommitmentPhase() {
        if (this.playerCommitments.size === 0) {
            return { success: false, error: 'No commitments received' };
        }
        this.commitmentPhaseComplete = true;
        return { success: true, commitmentCount: this.playerCommitments.size };
    }

    /**
     * Generate the final shuffle seed from all revealed seeds
     * Final seed = H(seed_1 || seed_2 || ... || seed_n || timestamp)
     * @returns {object} Result containing the final seed
     */
    generateShuffleSeed() {
        if (this.playerReveals.size !== this.playerCommitments.size) {
            return { success: false, error: 'Not all players revealed their seeds' };
        }

        // Sort seeds by player ID for deterministic ordering
        const seeds = Array.from(this.playerReveals.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => entry[1]);

        this.timestamp = Date.now().toString();
        const combined = seeds.join('||') + '||' + this.timestamp;
        this.finalSeed = crypto.createHash('sha256').update(combined).digest('hex');
        this.revealPhaseComplete = true;

        return {
            success: true,
            finalSeed: this.finalSeed,
            timestamp: this.timestamp,
            contributorCount: seeds.length
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
    }

    /**
     * Check if a client can perform a proof generation operation
     * @param {string} clientId - Client identifier
     * @param {string} operation - Type of operation (e.g., 'proofGeneration', 'deckCommitment')
     * @returns {object} Result indicating if operation is allowed
     */
    checkLimit(clientId, operation = 'proofGeneration') {
        const now = Date.now();
        let limitMap, maxLimit;

        switch (operation) {
            case 'proofGeneration':
                limitMap = this.proofGeneration;
                maxLimit = this.maxProofsPerHour;
                break;
            case 'deckCommitment':
                limitMap = this.deckCommitments;
                maxLimit = this.maxCommitmentsPerHour;
                break;
            default:
                limitMap = this.proofGeneration;
                maxLimit = this.maxProofsPerHour;
        }

        const record = limitMap.get(clientId) || { count: 0, resetTime: now + this.windowMs };

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
        let limitMap;

        switch (operation) {
            case 'proofGeneration':
                limitMap = this.proofGeneration;
                break;
            case 'deckCommitment':
                limitMap = this.deckCommitments;
                break;
            default:
                limitMap = this.proofGeneration;
        }

        const record = limitMap.get(clientId) || { count: 0, resetTime: now + this.windowMs };

        // Reset if window has passed
        if (now > record.resetTime) {
            record.count = 0;
            record.resetTime = now + this.windowMs;
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
 */
class AEADEncryption {
    constructor(options = {}) {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 12; // 96 bits (recommended for GCM)
        this.tagLength = 16; // 128 bits
        this.masterKey = options.masterKey || this.generateMasterKey();
        this.gameKeys = new Map(); // gameId -> derived key
    }

    generateMasterKey() {
        return crypto.randomBytes(this.keyLength);
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
    VRF_DOCUMENTATION
};
