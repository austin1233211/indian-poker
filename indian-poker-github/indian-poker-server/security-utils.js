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

module.exports = {
    DistributedRandomness,
    CryptoRateLimiter,
    ProofValidator,
    EnhancedCardHasher,
    WSSEnforcer,
    NonceGenerator
};
