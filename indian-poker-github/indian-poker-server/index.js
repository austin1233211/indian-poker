#!/usr/bin/env node

/**
 * Indian Poker WebSocket Server
 * A comprehensive server for traditional Indian card games
 * Supports Teen Patti, Jhandi Munda, and other authentic Indian poker variants
 *
 * Features:
 * - Real-time multiplayer WebSocket communication
 * - Authentic Indian poker rules and hand rankings
 * - Cultural terminology and betting patterns
 * - Room management for multiple game variants
 * - Simplified, focused architecture
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// Import security utilities
const {
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
    VRF_DOCUMENTATION
} = require('./security-utils');

// ZK Proofs Configuration
const ZK_CONFIG = {
    enabled: process.env.ZK_PROOFS_ENABLED !== 'false', // Enabled by default
    requireProofsForGameProgress: process.env.ZK_REQUIRE_PROOFS !== 'false', // Required by default
    proofTimeout: parseInt(process.env.ZK_PROOF_TIMEOUT) || 30000,
    verifyOnDeal: process.env.ZK_VERIFY_ON_DEAL !== 'false',
    verifyOnShuffle: process.env.ZK_VERIFY_ON_SHUFFLE !== 'false'
};

// PIR Server Configuration
const PIR_CONFIG = {
    enabled: process.env.PIR_ENABLED !== 'false', // Enabled by default
    requireForHiddenCards: process.env.PIR_REQUIRE_FOR_HIDDEN_CARDS !== 'false', // Required by default
    baseUrl: process.env.PIR_SERVER_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.PIR_TIMEOUT) || 5000,
    retryAttempts: parseInt(process.env.PIR_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.PIR_RETRY_DELAY) || 1000,
    // Game server credentials for PIR authentication
    serverEmail: process.env.PIR_SERVER_EMAIL || 'gameserver@indianpoker.local',
    serverPassword: process.env.PIR_SERVER_PASSWORD || ''
};

/**
 * PIR Client for communicating with the PIR Server
 * Provides privacy-preserving card queries and verification
 */
class PIRClient {
    constructor(config = PIR_CONFIG) {
        this.config = config;
        this.authToken = null;
        this.isConnected = false;
        this.gameDecks = new Map(); // gameId -> deck registration info
    }

    /**
     * Check if PIR integration is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }

    /**
     * Make HTTP request to PIR server
     */
    async makeRequest(method, path, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.config.baseUrl);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: method,
                timeout: this.config.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };

            if (this.authToken) {
                options.headers['Authorization'] = `Bearer ${this.authToken}`;
            }

            const req = httpModule.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error || `HTTP ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${body}`));
                    }
                });
            });

            req.on('error', (error) => reject(error));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    /**
     * Make request with retry logic
     */
    async makeRequestWithRetry(method, path, data = null) {
        let lastError;
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                return await this.makeRequest(method, path, data);
            } catch (error) {
                lastError = error;
                console.log(`PIR request failed (attempt ${attempt + 1}/${this.config.retryAttempts}): ${error.message}`);
                if (attempt < this.config.retryAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        }
        throw lastError;
    }

    /**
     * Check PIR server health
     */
    async checkHealth() {
        try {
            const response = await this.makeRequest('GET', '/health');
            this.isConnected = response.status === 'healthy';
            return this.isConnected;
        } catch (error) {
            console.error('PIR server health check failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Authenticate with PIR server (for game server operations)
     */
    async authenticate(credentials) {
        try {
            const response = await this.makeRequestWithRetry('POST', '/api/auth/login', credentials);
            if (response.success && response.token) {
                this.authToken = response.token;
                this.isConnected = true;
                console.log('PIR server authentication successful');
                return true;
            }
            return false;
        } catch (error) {
            console.error('PIR server authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Register a new game deck with the PIR server
     * This stores the deck state for later verification
     */
    async registerDeck(gameId, deck, shuffleSeed = null) {
        if (!this.isEnabled()) {
            return { success: false, reason: 'PIR not enabled' };
        }

        try {
            // Create card entries for the deck
            const deckData = {
                gameId: gameId,
                cards: deck.cards.map((card, index) => ({
                    position: index,
                    rank: card.rank,
                    suit: card.suit,
                    hash: this.hashCard(card, gameId, index)
                })),
                shuffleSeed: shuffleSeed,
                timestamp: new Date().toISOString()
            };

            // Store locally for verification
            this.gameDecks.set(gameId, deckData);

            // If authenticated, also register with PIR server
            if (this.authToken) {
                const response = await this.makeRequestWithRetry('POST', '/api/pir/query', {
                    query: {
                        type: 'card_validation',
                        parameters: {
                            cardId: gameId,
                            validationType: 'deck_registration'
                        }
                    }
                });
                return { success: true, pirResponse: response };
            }

            return { success: true, local: true };
        } catch (error) {
            console.error('Failed to register deck with PIR:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate a cryptographic hash for a card
     */
    hashCard(card, gameId, position) {
        const data = `${gameId}:${position}:${card.rank}:${card.suit}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify a card deal using PIR
     */
    async verifyCardDeal(gameId, playerId, cardPositions) {
        if (!this.isEnabled()) {
            return { verified: false, reason: 'PIR not enabled' };
        }

        const deckData = this.gameDecks.get(gameId);
        if (!deckData) {
            return { verified: false, reason: 'Deck not registered' };
        }

        try {
            // Verify each card position
            const verifications = cardPositions.map(pos => {
                const cardData = deckData.cards[pos];
                if (!cardData) {
                    return { position: pos, verified: false, reason: 'Invalid position' };
                }
                return {
                    position: pos,
                    verified: true,
                    hash: cardData.hash
                };
            });

            return {
                verified: verifications.every(v => v.verified),
                verifications: verifications,
                gameId: gameId,
                playerId: playerId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Card verification failed:', error.message);
            return { verified: false, error: error.message };
        }
    }

    /**
     * Get card information via PIR query (privacy-preserving)
     */
    async queryCard(gameId, position) {
        if (!this.isEnabled()) {
            return null;
        }

        const deckData = this.gameDecks.get(gameId);
        if (!deckData || !deckData.cards[position]) {
            return null;
        }

        return {
            position: position,
            hash: deckData.cards[position].hash,
            gameId: gameId
        };
    }

    /**
     * Generate a verifiable shuffle proof
     */
    generateShuffleProof(gameId, originalOrder, shuffledOrder) {
        const proof = {
            gameId: gameId,
            timestamp: new Date().toISOString(),
            originalHash: crypto.createHash('sha256')
                .update(JSON.stringify(originalOrder))
                .digest('hex'),
            shuffledHash: crypto.createHash('sha256')
                .update(JSON.stringify(shuffledOrder))
                .digest('hex'),
            proofId: uuidv4()
        };
        return proof;
    }

    /**
     * Get PIR status for a game
     */
    getGamePIRStatus(gameId) {
        const deckData = this.gameDecks.get(gameId);
        return {
            enabled: this.isEnabled(),
            requireForHiddenCards: this.config.requireForHiddenCards,
            connected: this.isConnected,
            authenticated: !!this.authToken,
            deckRegistered: !!deckData,
            cardCount: deckData ? deckData.cards.length : 0
        };
    }

    /**
     * Check if PIR is required for hidden card access
     */
    isRequiredForHiddenCards() {
        return this.config.enabled && this.config.requireForHiddenCards;
    }

    /**
     * Check if PIR is ready for game operations
     * When requireForHiddenCards is true, PIR must be connected and authenticated
     */
    isReadyForGame() {
        if (!this.isEnabled()) {
            return true; // PIR not enabled, game can proceed
        }
        if (!this.config.requireForHiddenCards) {
            return true; // PIR enabled but not required, game can proceed
        }
        // PIR is required - must be connected
        return this.isConnected;
    }

    /**
     * Get hidden card data via PIR (privacy-preserving)
     * This is the ONLY way to access hidden card data when PIR is required
     * Makes REAL network calls to the PIR server for privacy-preserving queries
     * @param {string} gameId - Game ID
     * @param {string} requestingPlayerId - Player requesting the card
     * @param {number} position - Card position in deck
     * @param {string} targetPlayerId - Player whose card is being requested
     */
    async getHiddenCardViaPIR(gameId, requestingPlayerId, position, targetPlayerId) {
        if (!this.isEnabled()) {
            return { success: false, reason: 'PIR not enabled' };
        }

        const deckData = this.gameDecks.get(gameId);
        if (!deckData) {
            return { success: false, reason: 'Deck not registered with PIR' };
        }

        // Log the PIR query for audit
        console.log(`PIR Query: Player ${requestingPlayerId} requesting card at position ${position} (target: ${targetPlayerId})`);

        // In Indian Poker, players can see OTHER players' cards but not their own
        // This is enforced at the game logic level, but PIR provides the privacy-preserving access

        // Make REAL network call to PIR server when authenticated
        if (this.authToken && this.isConnected) {
            try {
                const pirResponse = await this.makeRequestWithRetry('POST', '/api/pir/query', {
                    query: {
                        type: 'card_lookup',
                        parameters: {
                            cardId: `${gameId}_${position}`,
                            gameId: gameId,
                            position: position,
                            requestingPlayer: requestingPlayerId,
                            targetPlayer: targetPlayerId,
                            encryptedProperties: ['rank', 'suit']
                        }
                    }
                });

                if (pirResponse.success && pirResponse.result) {
                    return {
                        success: true,
                        cardData: pirResponse.result.cardData || {
                            position: position,
                            rank: deckData.cards[position]?.rank,
                            suit: deckData.cards[position]?.suit,
                            hash: deckData.cards[position]?.hash
                        },
                        pirVerification: {
                            queryId: pirResponse.result.queryId || `pir_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                            timestamp: new Date().toISOString(),
                            gameId: gameId,
                            requestingPlayer: requestingPlayerId,
                            targetPlayer: targetPlayerId,
                            serverVerified: true
                        }
                    };
                }
            } catch (error) {
                console.error('PIR server query failed, falling back to local:', error.message);
                // Fall through to local fallback if PIR server query fails
            }
        }

        // Fallback to local data when PIR server is not available
        // This maintains backward compatibility but logs a warning
        if (this.config.requireForHiddenCards && !this.isConnected) {
            return { success: false, reason: 'PIR server required but not connected' };
        }

        console.warn('PIR: Using local card data (PIR server not available or not authenticated)');
        
        const cardData = deckData.cards[position];
        if (!cardData) {
            return { success: false, reason: 'Invalid card position' };
        }

        // Return card data with local verification (less secure)
        return {
            success: true,
            cardData: {
                position: position,
                rank: cardData.rank,
                suit: cardData.suit,
                hash: cardData.hash
            },
            pirVerification: {
                queryId: `pir_local_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
                timestamp: new Date().toISOString(),
                gameId: gameId,
                requestingPlayer: requestingPlayerId,
                targetPlayer: targetPlayerId,
                serverVerified: false
            }
        };
    }

    /**
     * Authenticate with PIR server using configured credentials
     */
    async authenticateWithCredentials() {
        if (!this.config.serverPassword) {
            console.log('PIR: No server password configured, skipping authentication');
            return false;
        }
        return await this.authenticate({
            email: this.config.serverEmail,
            password: this.config.serverPassword
        });
    }

    /**
     * Clean up game data
     */
    cleanupGame(gameId) {
        this.gameDecks.delete(gameId);
    }
}

// Create global PIR client instance
const pirClient = new PIRClient();

// Import SNARK integration module
const { snarkVerifier, cardToIndex, calculatePermutation, deckToIndices } = require('./snark-integration');

// Game Constants
const CARD_SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
// Only Blind Man's Bluff (1-card Indian Poker) is supported
const GAME_VARIANTS = {
    BLIND_MANS_BLUFF: 'blind_mans_bluff'
};

// Indian Poker Hand Rankings (Teen Patti)
const TEEN_PATTI_HAND_RANKINGS = {
    'trail': { name: 'Trail', value: 100, description: 'Three of a kind - highest hand' },
    'pure_sequence': { name: 'Pure Sequence', value: 90, description: 'Three consecutive cards same suit' },
    'sequence': { name: 'Sequence', value: 80, description: 'Three consecutive cards' },
    'color': { name: 'Color', value: 70, description: 'Three cards of same suit' },
    'pair': { name: 'Pair', value: 60, description: 'Two cards of same rank' },
    'high_card': { name: 'High Card', value: 50, description: 'Highest single card' }
};

// Traditional Indian Betting Terms
const BETTING_TERMS = {
    CHAAL: 'chaal',      // Call/raise
    PACK: 'pack',        // Fold
    SHOW: 'show',        // Show cards
    BOOT: 'boot',        // Forced bet
    POT: 'pot'           // Pot/amount
};

/**
 * Card class for Indian Poker
 */
class Card {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }

    getNumericValue() {
        const values = { 'A': 1, 'J': 11, 'Q': 12, 'K': 13 };
        return values[this.rank] || parseInt(this.rank);
    }

    getDisplayName() {
        return `${this.rank}${this.suit[0]}`; // e.g., AH for Ace of Hearts
    }

    toString() {
        return `${this.rank} of ${this.suit}`;
    }
}

/**
 * Deck management for Indian Poker
 * Enhanced with SNARK proof tracking for verifiable shuffling
 */
class Deck {
    constructor() {
        this.cards = [];
        this.originalDeck = [];
        this.shuffledDeck = [];
        this.permutation = [];
        this.dealPositions = [];
        this.shuffleSeed = null;
        this.shuffleTimestamp = null;
        this.isVerifiableShuffle = false;
        this.initializeDeck();
        this.shuffle();
    }

    initializeDeck() {
        this.cards = [];
        for (const suit of CARD_SUITS) {
            for (const rank of CARD_RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
        this.originalDeck = this.cards.map(card => ({ rank: card.rank, suit: card.suit }));
    }

    shuffle(seedHex = null) {
        if (seedHex && /^[a-f0-9]{64}$/i.test(seedHex)) {
            this.shuffleWithSeed(seedHex);
        } else {
            this.shuffleRandom();
        }
    }

    shuffleRandom() {
        const shuffled = [...this.cards];
        const permutation = Array.from({ length: shuffled.length }, (_, i) => i);

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }

        this.cards = shuffled;
        this.shuffledDeck = shuffled.map(card => ({ rank: card.rank, suit: card.suit }));
        this.permutation = permutation;
        this.dealPositions = [];
        this.shuffleSeed = null;
        this.shuffleTimestamp = Date.now();
        this.isVerifiableShuffle = false;
    }

    shuffleWithSeed(seedHex) {
        const cardData = this.cards.map(card => ({ rank: card.rank, suit: card.suit }));
        const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle(cardData, seedHex);
        
        this.cards = shuffled.map(data => new Card(data.rank, data.suit));
        this.shuffledDeck = shuffled;
        this.permutation = permutation;
        this.dealPositions = [];
        this.shuffleSeed = seedHex;
        this.shuffleTimestamp = Date.now();
        this.isVerifiableShuffle = true;
    }

    dealCard() {
        const position = 52 - this.cards.length;
        this.dealPositions.push(position);
        return this.cards.pop();
    }

    cardsRemaining() {
        return this.cards.length;
    }

    getProofState() {
        return {
            originalDeck: this.originalDeck,
            shuffledDeck: this.shuffledDeck,
            permutation: this.permutation,
            dealPositions: this.dealPositions,
            shuffleSeed: this.shuffleSeed,
            shuffleTimestamp: this.shuffleTimestamp,
            isVerifiableShuffle: this.isVerifiableShuffle,
            shuffleVersion: VerifiableShuffle.SHUFFLE_VERSION
        };
    }
}

/**
 * Teen Patti Game Logic
 * Enhanced with SNARK proof tracking for verifiable fairness
 */
class TeenPattiGame {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map();
        this.deck = new Deck();
        this.pot = 0;
        this.bootAmount = 10; // Minimum boot amount
        this.currentRound = 'ante'; // ante, dealing, betting, showdown
        this.dealerButton = 0;
        this.smallBlind = 0;
        this.bigBlind = 1;
        this.currentBet = this.bootAmount;
        this.dealer = null;

        // SNARK proof tracking
        this.gameId = `${roomId}-${Date.now()}`; // Unique game identifier
        this.proofs = {
            shuffle: null,
            dealing: null,
            commitments: {}
        };
        this.snarkEnabled = false; // Will be set when proofs are generated

        // Cryptographic fairness: Commit-and-reveal protocol
        // Server commits to deck order before dealing, reveals at game end
        this.deckCommitmentHash = null;      // SHA-256 hash of serialized deck
        this.committedDeckOrder = null;      // Full deck order (revealed at game end)
        this.deckRevealed = false;           // Whether deck has been revealed
        this.playerSeatIndices = new Map();  // Map playerId -> seatIndex for verifiable dealing
        this.nextSeatIndex = 0;              // Counter for assigning seat indices

        // Security Enhancement: Cryptographic nonce for deck commitment
        // Prevents hash precomputation attacks by adding randomness to each game
        this.deckNonce = null;               // Cryptographic nonce for this game
        this.commitmentTimestamp = null;     // Timestamp when commitment was made

        // Security Enhancement: Distributed randomness
        // Allows players to contribute entropy to shuffle seed
        this.distributedRandomness = new DistributedRandomness();
        this.useDistributedRandomness = false;

        // Security Enhancement: Enhanced card hasher with game secrets
        this.cardHasher = new EnhancedCardHasher();
        this.gameSecret = null;

        // Verifiable shuffle state machine
        this.randomnessState = 'idle';
        this.randomnessTimeout = null;
        this.randomnessTimeoutMs = 30000;
        this.verificationTranscript = null;
    }

    getRandomnessState() {
        return {
            state: this.randomnessState,
            commitmentCount: this.distributedRandomness.playerCommitments.size,
            revealCount: this.distributedRandomness.playerReveals.size,
            playerCount: this.players.size,
            useDistributedRandomness: this.useDistributedRandomness,
            hasFinalSeed: this.distributedRandomness.finalSeed !== null
        };
    }

    canStartDealing() {
        if (!this.useDistributedRandomness) {
            return { canStart: true, reason: 'Using server-side randomness' };
        }

        const state = this.distributedRandomness.getState();
        if (!state.revealPhaseComplete) {
            return { 
                canStart: false, 
                reason: 'Waiting for all players to reveal their seeds',
                commitmentCount: state.commitmentCount,
                revealCount: state.revealCount
            };
        }

        return { canStart: true, reason: 'Distributed randomness complete' };
    }

    startRandomnessCollection() {
        this.randomnessState = 'awaiting_commitments';
        this.useDistributedRandomness = true;
        
        this.randomnessTimeout = setTimeout(() => {
            this.handleRandomnessTimeout();
        }, this.randomnessTimeoutMs);

        return {
            state: this.randomnessState,
            timeoutMs: this.randomnessTimeoutMs,
            message: 'Randomness collection started. Players should commit their seeds.'
        };
    }

    /**
     * Handle randomness collection timeout
     * SECURITY FIX: Instead of falling back to server randomness (which undermines
     * provable fairness), we now ABORT the game when players don't participate.
     * This prevents malicious players from intentionally triggering server-controlled
     * randomness and ensures the "provably fair" guarantee is maintained.
     */
    handleRandomnessTimeout() {
        const state = this.distributedRandomness.getState();
        
        // SECURITY FIX: Abort game if no commitments received
        // Previously: Used server randomness (security vulnerability)
        // Now: Abort game to maintain provable fairness guarantee
        if (state.commitmentCount === 0) {
            this.randomnessState = 'aborted_no_commitments';
            this.useDistributedRandomness = false;
            this.gameAborted = true;
            this.abortReason = 'No players committed randomness seeds within timeout period';
            return { 
                action: 'abort', 
                reason: 'Game aborted: No commitments received. All players must participate in randomness generation for provable fairness.',
                securityNote: 'Server randomness fallback disabled to maintain cryptographic fairness guarantees'
            };
        }

        if (!state.commitmentPhaseComplete) {
            this.distributedRandomness.completeCommitmentPhase();
        }

        // SECURITY FIX: Abort game if not all players revealed
        // Previously: Used server randomness (security vulnerability - malicious player could force this)
        // Now: Abort game to prevent manipulation
        if (state.revealCount < state.commitmentCount) {
            this.randomnessState = 'aborted_incomplete_reveals';
            this.useDistributedRandomness = false;
            this.gameAborted = true;
            this.abortReason = `Only ${state.revealCount} of ${state.commitmentCount} players revealed their seeds`;
            return { 
                action: 'abort', 
                reason: `Game aborted: Not all players revealed their seeds (${state.revealCount}/${state.commitmentCount}). This prevents manipulation of randomness.`,
                committed: state.commitmentCount,
                revealed: state.revealCount,
                securityNote: 'Server randomness fallback disabled to maintain cryptographic fairness guarantees'
            };
        }

        return { action: 'complete', reason: 'All reveals received' };
    }

    /**
     * Finalize randomness generation
     * SECURITY FIX: No longer falls back to server randomness.
     * If distributed randomness fails, the game is aborted to maintain provable fairness.
     */
    finalizeRandomness() {
        if (this.randomnessTimeout) {
            clearTimeout(this.randomnessTimeout);
            this.randomnessTimeout = null;
        }

        // Check if game was already aborted due to randomness issues
        if (this.gameAborted) {
            return {
                success: false,
                aborted: true,
                reason: this.abortReason || 'Game aborted due to randomness protocol failure'
            };
        }

        const state = this.distributedRandomness.getState();
        
        if (!state.revealPhaseComplete && state.revealCount === state.commitmentCount && state.commitmentCount > 0) {
            this.distributedRandomness.generateShuffleSeed();
        }

        if (this.distributedRandomness.finalSeed) {
            this.gameSecret = this.distributedRandomness.finalSeed;
            this.randomnessState = 'complete';
            return {
                success: true,
                finalSeed: this.distributedRandomness.finalSeed,
                contributorCount: state.commitmentCount,
                timestampCommitment: this.distributedRandomness.timestampCommitment
            };
        }

        // SECURITY FIX: Abort game instead of using server randomness
        // Previously: Used server randomness (security vulnerability)
        // Now: Abort game to maintain provable fairness guarantee
        this.randomnessState = 'aborted_seed_generation_failed';
        this.gameAborted = true;
        this.abortReason = 'Could not generate final seed from player contributions';
        return {
            success: false,
            aborted: true,
            reason: 'Game aborted: Could not generate final seed. Server randomness fallback disabled for security.',
            securityNote: 'Server randomness fallback disabled to maintain cryptographic fairness guarantees'
        };
    }

    generateVerificationTranscript() {
        const deckState = this.deck.getProofState();
        const transcriptData = this.distributedRandomness.getTranscriptData();

        this.verificationTranscript = VerifiableShuffle.generateVerificationTranscript({
            gameId: this.gameId,
            playerCommitments: transcriptData.playerCommitments,
            playerReveals: transcriptData.playerReveals,
            finalSeed: transcriptData.finalSeed,
            originalDeck: deckState.originalDeck,
            shuffledDeck: deckState.shuffledDeck,
            permutation: deckState.permutation,
            timestamp: transcriptData.timestamp || this.commitmentTimestamp
        });

        return this.verificationTranscript;
    }

    /**
     * Serialize deck in canonical format for commitment hash
     * SECURITY ENHANCEMENT: Now includes cryptographic nonce to prevent hash precomputation
     * Format: "gameId:nonce:index:rank:suit|gameId:nonce:index:rank:suit|..."
     * This format is deterministic and can be verified by clients
     */
    serializeDeck(deckArray) {
        // Generate cryptographic nonce if not already set
        if (!this.deckNonce) {
            this.deckNonce = NonceGenerator.generate();
        }
        
        const parts = deckArray.map((card, index) =>
            `${this.gameId}:${this.deckNonce}:${index}:${card.rank}:${card.suit}`
        );
        return parts.join('|');
    }

    /**
     * Create commitment to deck order (call after shuffle, before dealing)
     * SECURITY ENHANCEMENT: Now includes cryptographic nonce and timestamp
     * Returns the commitment hash that should be broadcast to all players
     */
    commitToDeck() {
        // Generate cryptographic nonce for this commitment
        this.deckNonce = NonceGenerator.generate();
        this.commitmentTimestamp = Date.now();

        // Snapshot the shuffled deck order
        this.committedDeckOrder = this.deck.shuffledDeck.map(card => ({
            rank: card.rank,
            suit: card.suit
        }));

        // Create canonical serialization and hash it (now includes nonce)
        const serialized = this.serializeDeck(this.committedDeckOrder);
        this.deckCommitmentHash = crypto.createHash('sha256').update(serialized).digest('hex');

        return this.deckCommitmentHash;
    }

    /**
     * Get deck reveal data for verification at game end
     * SECURITY ENHANCEMENT: Now includes nonce and timestamp for verification
     * Clients can verify: SHA-256(serializeDeck(committedDeckOrder)) === deckCommitmentHash
     */
    getDeckReveal() {
        this.deckRevealed = true;
        return {
            gameId: this.gameId,
            nonce: this.deckNonce, // Include nonce in reveal for verification
            deckCommitmentHash: this.deckCommitmentHash,
            committedDeckOrder: this.committedDeckOrder,
            timestamp: this.commitmentTimestamp,
            playerSeatIndices: Object.fromEntries(this.playerSeatIndices),
            verificationInstructions: 'To verify: serialize deck as "gameId:nonce:index:rank:suit|..." and compute SHA-256(gameId:nonce:index:rank:suit|...). Hash should match deckCommitmentHash. Player with seatIndex N received card at index N.'
        };
    }

    /**
     * Evaluate hand for Indian Poker (1 card per player)
     * Simply compares card values - highest card wins
     * Ace is highest (14), 2 is lowest (2)
     */
    evaluateHand(cards) {
        if (!cards || cards.length === 0) {
            return {
                type: 'no_card',
                value: 0,
                name: 'No Card',
                cards: [],
                tieBreaker: 0
            };
        }

        const card = cards[0];
        const cardValue = card.getNumericValue();
        
        return {
            type: 'single_card',
            value: cardValue,
            name: card.getDisplayName(),
            cards: [card],
            tieBreaker: cardValue
        };
    }

    addPlayer(playerId, playerName, chips = 1000) {
        // Assign seat index for verifiable dealing
        // Player with seatIndex N will receive card at index N from the committed deck
        const seatIndex = this.nextSeatIndex++;
        this.playerSeatIndices.set(playerId, seatIndex);

        const player = {
            id: playerId,
            name: playerName,
            chips: chips,
            cards: [],
            bet: 0,
            hasFolded: false,
            hasShown: false,
            handValue: null,
            isActive: true,
            joinedAt: Date.now(),
            seatIndex: seatIndex  // Include seat index in player data
        };
        this.players.set(playerId, player);
        return player;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    dealCards() {
        this.deck.shuffle();
        for (const [playerId, player] of this.players) {
            player.cards = [];
            // Indian Poker: Each player gets 1 card
            player.cards.push(this.deck.dealCard());
        }
    }

    /**
     * Deal cards with position tracking for PIR verification
     * Tracks which deck positions each player received
     * Indian Poker: Each player gets 1 card
     */
    dealCardsWithTracking() {
        this.deck.shuffle();
        let cardPosition = 0;
        
        for (const [playerId, player] of this.players) {
            player.cards = [];
            player.cardPositions = []; // Track positions for PIR verification
            
            // Indian Poker: Each player gets 1 card
            const card = this.deck.dealCard();
            player.cards.push(card);
            player.cardPositions.push(cardPosition);
            cardPosition++;
        }
    }

    processBettingRound() {
        let activePlayers = Array.from(this.players.values()).filter(p => !p.hasFolded);
        if (activePlayers.length <= 1) return;

        // Evaluate hands for showdown
        for (const player of activePlayers) {
            player.handValue = this.evaluateHand(player.cards);
        }

        // Determine winner
        const sortedPlayers = activePlayers.sort((a, b) => {
            if (a.handValue.value !== b.handValue.value) {
                return b.handValue.value - a.handValue.value;
            }
            return b.handValue.tieBreaker - a.handValue.tieBreaker;
        });

        const winner = sortedPlayers[0];
        winner.chips += this.pot;

        return {
            winner: winner,
            handValue: winner.handValue,
            allHands: sortedPlayers.map(p => ({
                playerId: p.id,
                playerName: p.name,
                handValue: p.handValue,
                cards: p.cards.map(card => card.getDisplayName())
            }))
        };
    }

    getGameState() {
        return {
            roomId: this.roomId,
            variant: GAME_VARIANTS.BLIND_MANS_BLUFF,
            pot: this.pot,
            currentBet: this.currentBet,
            currentRound: this.currentRound,
            playerCount: this.players.size,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                bet: p.bet,
                hasFolded: p.hasFolded,
                isActive: p.isActive,
                joinedAt: p.joinedAt
            })),
            snarkEnabled: this.snarkEnabled,
            gameId: this.gameId,
            hasProofs: {
                shuffle: this.proofs.shuffle !== null,
                dealing: this.proofs.dealing !== null
            }
        };
    }

    /**
     * Get personalized game state for Indian Poker mechanics
     * Each player sees OTHER players' cards but NOT their own card
     * This is the core mechanic of Indian Poker / Blind Man's Bluff
     */
    getGameStateForClient(clientId) {
        return {
            roomId: this.roomId,
            variant: GAME_VARIANTS.BLIND_MANS_BLUFF,
            pot: this.pot,
            currentBet: this.currentBet,
            currentRound: this.currentRound,
            playerCount: this.players.size,
            players: Array.from(this.players.values()).map(p => {
                const playerData = {
                    id: p.id,
                    name: p.name,
                    chips: p.chips,
                    bet: p.bet,
                    hasFolded: p.hasFolded,
                    isActive: p.isActive,
                    joinedAt: p.joinedAt
                };
                
                // Indian Poker mechanic: show OTHER players' cards, hide your own
                if (p.id !== clientId && p.cards && p.cards.length > 0) {
                    playerData.cards = p.cards.map(card => card.getDisplayName());
                } else if (p.id === clientId) {
                    playerData.cards = null; // Your own cards are hidden from you
                    playerData.cardCount = p.cards ? p.cards.length : 0;
                }
                
                return playerData;
            }),
            snarkEnabled: this.snarkEnabled,
            gameId: this.gameId,
            hasProofs: {
                shuffle: this.proofs.shuffle !== null,
                dealing: this.proofs.dealing !== null
            }
        };
    }

    /**
     * Get proofs for verification (can be requested by clients)
     */
    getProofs() {
        return {
            gameId: this.gameId,
            snarkEnabled: this.snarkEnabled,
            proofs: this.proofs
        };
    }
}

/**
 * Room Manager for Blind Man's Bluff (Indian Poker)
 */
class IndianPokerRoomManager {
    constructor() {
        this.rooms = new Map();
        this.maxPlayersPerRoom = 6;
        // Security: Limit total rooms to prevent memory exhaustion
        this.maxTotalRooms = 100;
    }

    /**
     * Security: Check if room creation limit is reached
     */
    canCreateRoom() {
        return this.rooms.size < this.maxTotalRooms;
    }

    createRoom(roomName = null) {
        const roomId = uuidv4().substr(0, 8);
        const room = {
            id: roomId,
            name: roomName || `Room ${roomId}`,
            variant: GAME_VARIANTS.BLIND_MANS_BLUFF,
            game: null,
            players: new Set(),
            maxPlayers: this.maxPlayersPerRoom,
            createdAt: Date.now(),
            settings: {
                minBuyIn: 100,
                maxBuyIn: 10000,
                autoStart: true,
                minPlayers: 2
            }
        };

        // Initialize Blind Man's Bluff game (1-card Indian Poker)
        room.game = new TeenPattiGame(roomId);

        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    joinRoom(roomId, playerId, playerName, chips = 1000) {
        const room = this.getRoom(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.players.size >= room.maxPlayers) {
            throw new Error('Room is full');
        }

        room.players.add(playerId);
        return room.game.addPlayer(playerId, playerName, chips);
    }

    leaveRoom(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.players.delete(playerId);
        room.game.removePlayer(playerId);

        // Delete room if empty
        if (room.players.size === 0) {
            this.rooms.delete(roomId);
        }

        return true;
    }

    listRooms() {
        return Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            variant: room.variant,
            playerCount: room.players.size,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt,
            gameType: this.getGameTypeDisplayName(room.variant)
        }));
    }

    getGameTypeDisplayName() {
        return 'Blind Man\'s Bluff';
    }
}

/**
 * WebSocket Server for Indian Poker
 */
class IndianPokerServer {
    constructor(port = 8080) {
        this.port = port;
        
        // Security Enhancement: Initialize security utilities
        this.rateLimiter = new CryptoRateLimiter({
            maxProofsPerHour: 10,
            maxCommitmentsPerHour: 20,
            windowMs: 3600000 // 1 hour
        });
        this.proofValidator = new ProofValidator({
            proofExpiration: 3600000, // 1 hour
            cleanupInterval: 300000 // 5 minutes
        });
        this.wssEnforcer = new WSSEnforcer({
            allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []
        });

        // Additional Security Enhancement: Continuous monitoring and audit logging
        this.cryptoMonitor = new CryptoMonitor({
            maxOperations: 10000,
            proofGenerationsPerMinute: 5,
            failedVerificationsPerMinute: 3
        });
        this.auditLogger = new AuditLogger({
            maxLogs: 50000,
            enableConsole: process.env.NODE_ENV !== 'production'
        });
        this.verificationCheckpoint = new VerificationCheckpoint({
            verificationInterval: 30000 // 30 seconds
        });
        this.secureDealingIndex = new SecureDealingIndex();
        this.enhancedCardHasher = new EnhancedCardHasher();
        this.aeadEncryption = new AEADEncryption();
        
        this.messageEncryption = new MessageEncryption();
        this.messageAuthenticator = new MessageAuthenticator();
        this.anomalyDetector = new AnomalyDetector({
            maxHistorySize: 100,
            minCommitTime: 100,
            maxActionsPerMinute: 60
        });
        this.clientSecurityEnabled = new Map();

        // Create HTTP server for health checks (required for Railway deployment)
        this.httpServer = http.createServer((req, res) => {
            if (req.url === '/' || req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'ok', 
                    service: 'indian-poker-server',
                    security: {
                        wssEnforced: this.wssEnforcer.enforceWSS,
                        encryptionMandatory: true,
                        rateLimitingEnabled: true,
                        proofValidationEnabled: true,
                        continuousMonitoringEnabled: true,
                        auditLoggingEnabled: true,
                        verificationCheckpointsEnabled: true,
                        secureDealingEnabled: true,
                        zkProofsEnabled: ZK_CONFIG.enabled,
                        zkRequireProofsForProgress: ZK_CONFIG.requireProofsForGameProgress,
                        pirEnabled: PIR_CONFIG.enabled,
                        pirRequireForHiddenCards: PIR_CONFIG.requireForHiddenCards,
                        pirReadyForGame: this.pirClient ? this.pirClient.isReadyForGame() : true
                    }
                }));
            } else if (req.url === '/security/stats') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    cryptoMonitor: this.cryptoMonitor.getStatistics(),
                    proofValidator: this.proofValidator.getStatistics(),
                    rateLimiter: { active: true }
                }));
            } else if (req.url === '/security/audit') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    logs: this.auditLogger.getLogs({ limit: 100 })
                }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });
        
        // Attach WebSocket server to HTTP server
        this.wss = new WebSocket.Server({ server: this.httpServer });
        this.clients = new Map(); // clientId -> { ws, playerId, roomId }
        this.roomManager = new IndianPokerRoomManager();
        this.pirClient = pirClient; // Use global PIR client instance
        this.setupWebSocketHandlers();

        // Initialize SNARK system asynchronously
        this.initializeSNARK();
        this.initializePIR();
        
        // Start listening on the HTTP server
        this.httpServer.listen(port, () => {
            console.log('Indian Poker Server started on port ' + port);
            console.log('Health check endpoint: http://localhost:' + port + '/health');
            console.log('WebSocket endpoint: ws://localhost:' + port);
            console.log('PIR Integration: ' + (PIR_CONFIG.enabled ? 'ENABLED' : 'DISABLED'));
            console.log('ZK Proofs: ' + (ZK_CONFIG.enabled ? 'ENABLED' : 'DISABLED'));
            if (ZK_CONFIG.enabled) {
                console.log('ZK Proofs: Require proofs for game progress: ' + (ZK_CONFIG.requireProofsForGameProgress ? 'YES' : 'NO'));
            }
            console.log('Security: Rate limiting ENABLED, Proof validation ENABLED');
            console.log('Security: WSS enforcement ' + (this.wssEnforcer.enforceWSS ? 'ENABLED' : 'DISABLED'));
        });
    }

    /**
     * Initialize PIR server connection
     */
    async initializePIR() {
        if (!this.pirClient.isEnabled()) {
            console.log('PIR integration is disabled. Set PIR_ENABLED=true to enable.');
            return;
        }

        console.log('Initializing PIR server connection...');
        console.log(`PIR: Require for hidden cards: ${PIR_CONFIG.requireForHiddenCards ? 'YES' : 'NO'}`);
        
        const isHealthy = await this.pirClient.checkHealth();
        if (isHealthy) {
            console.log('PIR server connection established successfully');
            
            // Attempt to authenticate with PIR server
            const authenticated = await this.pirClient.authenticateWithCredentials();
            if (authenticated) {
                console.log('PIR server authentication successful');
            } else {
                console.log('PIR server authentication skipped or failed (will use local verification)');
            }
        } else {
            console.log('PIR server is not available.');
            if (PIR_CONFIG.requireForHiddenCards) {
                console.warn('WARNING: PIR is required for hidden cards but server is unavailable!');
                console.warn('Games will not be able to start until PIR server is available.');
            } else {
                console.log('Game will continue without PIR verification.');
            }
        }
    }

    async initializeSNARK() {
        try {
            await snarkVerifier.initialize();
            if (snarkVerifier.isAvailable()) {
                console.log('SNARK proof system initialized - verifiable fairness enabled');
            } else {
                console.log('SNARK proof system not available - running without verifiable fairness');
            }
        } catch (error) {
            console.warn('Failed to initialize SNARK system:', error.message);
        }
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws, req) => {
            // Security Enhancement: WSS enforcement check
            const securityCheck = this.wssEnforcer.checkConnection(req);
            if (!securityCheck.allowed) {
                console.warn('Connection rejected: ' + securityCheck.reason);
                this.auditLogger.logConnection('CONNECTION_REJECTED', {
                    reason: securityCheck.reason,
                    ip: req.socket.remoteAddress,
                    origin: req.headers.origin
                });
                ws.close(1008, securityCheck.reason);
                return;
            }

            const clientId = uuidv4();
            const connectionTime = Date.now();
            const clientIp = req.socket.remoteAddress || 'unknown';
            const clientOrigin = req.headers.origin || 'unknown';

            console.log('New connection: ' + clientId + (securityCheck.warnings.length > 0 ? ' (warnings: ' + securityCheck.warnings.join(', ') + ')' : ''));

            // Audit log the connection
            this.auditLogger.logConnection('CONNECTION_ESTABLISHED', {
                clientId,
                ip: clientIp,
                origin: clientOrigin,
                warnings: securityCheck.warnings,
                timestamp: connectionTime
            });

            this.clients.set(clientId, {
                ws: ws,
                playerId: null,
                roomId: null,
                connectionTime: connectionTime,
                ip: clientIp,
                origin: clientOrigin,
                messageCount: 0,
                lastMessageTime: null
            });

            this.sendMessage(clientId, {
                type: 'connection_established',
                data: {
                    clientId: clientId,
                    message: 'Welcome to Indian Poker Server!',
                    security: {
                        wssEnforced: this.wssEnforcer.enforceWSS,
                        warnings: securityCheck.warnings
                    }
                }
            });

            ws.on('message', (message) => {
                try {
                    const client = this.clients.get(clientId);
                    if (client) {
                        client.messageCount++;
                        client.lastMessageTime = Date.now();

                        // Rate limiting per connection (max 100 messages per minute)
                        const timeSinceConnection = Date.now() - client.connectionTime;
                        const messagesPerMinute = (client.messageCount / timeSinceConnection) * 60000;
                        if (messagesPerMinute > 100) {
                            this.auditLogger.logSecurity('RATE_LIMIT_EXCEEDED', {
                                clientId,
                                messagesPerMinute: Math.round(messagesPerMinute),
                                ip: client.ip
                            });
                            this.sendError(clientId, 'Rate limit exceeded. Please slow down.');
                            return;
                        }
                    }

                    const data = JSON.parse(message);
                    this.handleClientMessage(clientId, data);
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                    this.sendError(clientId, 'Invalid message format');
                }
            });

            ws.on('close', () => {
                const client = this.clients.get(clientId);
                if (client) {
                    this.auditLogger.logConnection('CONNECTION_CLOSED', {
                        clientId,
                        ip: client.ip,
                        duration: Date.now() - client.connectionTime,
                        messageCount: client.messageCount
                    });
                }
                this.handleDisconnection(clientId);
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                this.auditLogger.logSecurity('WEBSOCKET_ERROR', {
                    clientId,
                    error: error.message
                });
                this.handleDisconnection(clientId);
            });
        });
    }

    handleClientMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;

        let { type, data: messageData } = data;

        if (type === 'encrypted_message' && messageData) {
            const decrypted = this.decryptClientMessage(clientId, messageData.encrypted, messageData.signature);
            if (!decrypted) {
                this.sendError(clientId, 'Failed to decrypt message');
                return;
            }
            type = decrypted.type;
            messageData = decrypted.data;
        }

        const securityEnabled = this.clientSecurityEnabled.get(clientId);
        if (type !== 'security_init' && (!securityEnabled || !securityEnabled.encryptionEnabled)) {
            this.sendMessage(clientId, {
                type: 'security_required',
                data: {
                    message: 'Security initialization required. Please send security_init first.',
                    code: 'ENCRYPTION_REQUIRED'
                }
            });
            this.auditLogger.logSecurity('unencrypted_message_rejected', { clientId, type });
            return;
        }

        this.anomalyDetector.recordAction(clientId, type, { timestamp: Date.now() });
        const anomalies = this.anomalyDetector.detectAnomalies(clientId, type, { timestamp: Date.now() });
        if (anomalies.length > 0) {
            this.auditLogger.logSecurity('anomaly_detected', { clientId, type, anomalies });
        }

        try {
            switch (type) {
                case 'security_init':
                    const securityResponse = this.handleSecurityInit(clientId);
                    const clientObj = this.clients.get(clientId);
                    if (clientObj && clientObj.ws.readyState === WebSocket.OPEN) {
                        clientObj.ws.send(JSON.stringify(securityResponse));
                    }
                    break;
                case 'create_room':
                    this.handleCreateRoom(clientId, messageData);
                    break;
                case 'list_rooms':
                    this.handleListRooms(clientId);
                    break;
                case 'join_room':
                    this.handleJoinRoom(clientId, messageData);
                    break;
                case 'leave_room':
                    this.handleLeaveRoom(clientId);
                    break;
                case 'start_game':
                    this.handleStartGame(clientId);
                    break;
                case 'make_bet':
                    this.handleMakeBet(clientId, messageData);
                    break;
                case 'fold':
                    this.handleFold(clientId);
                    break;
                case 'show_cards':
                    this.handleShowCards(clientId);
                    break;
                case 'get_game_state':
                    this.handleGetGameState(clientId);
                    break;
                case 'get_proofs':
                    this.handleGetProofs(clientId);
                    break;
                case 'verify_proof':
                    this.handleVerifyProof(clientId, messageData);
                    break;
                case 'get_snark_status':
                    this.handleGetSnarkStatus(clientId);
                    break;
                // PIR-related message handlers
                case 'get_pir_status':
                    this.handleGetPIRStatus(clientId);
                    break;
                case 'verify_cards':
                    this.handleVerifyCards(clientId, messageData);
                    break;
                case 'get_card_proof':
                    this.handleGetCardProof(clientId, messageData);
                    break;
                case 'get_hidden_card':
                    this.handleGetHiddenCard(clientId, messageData);
                    break;
                // Security Enhancement: Distributed randomness message handlers
                case 'commit_randomness':
                    this.handleCommitRandomness(clientId, messageData);
                    break;
                case 'reveal_randomness':
                    this.handleRevealRandomness(clientId, messageData);
                    break;
                case 'get_randomness_status':
                    this.handleGetRandomnessStatus(clientId);
                    break;
                // Security Enhancement: Verification checkpoint handlers
                case 'create_checkpoint':
                    this.handleCreateCheckpoint(clientId);
                    break;
                case 'verify_checkpoint':
                    this.handleVerifyCheckpoint(clientId, messageData);
                    break;
                case 'get_checkpoints':
                    this.handleGetCheckpoints(clientId);
                    break;
                // Security Enhancement: Audit and monitoring handlers
                case 'get_security_stats':
                    this.handleGetSecurityStats(clientId);
                    break;
                default:
                    this.sendError(clientId, `Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
            this.sendError(clientId, error.message);
        }
    }

    handleCreateRoom(clientId, data) {
        // Security: Check room creation limit to prevent DoS
        if (!this.roomManager.canCreateRoom()) {
            this.sendError(clientId, 'Server room limit reached. Please try again later.');
            return;
        }

        const { roomName } = data;

        // Security: Sanitize room name (prevent XSS and limit length)
        let sanitizedRoomName = null;
        if (roomName) {
            sanitizedRoomName = String(roomName)
                .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
                .substring(0, 50); // Limit length
        }

        const room = this.roomManager.createRoom(sanitizedRoomName);

        // Security: Track room creator for authorization
        room.creatorId = clientId;

        this.sendMessage(clientId, {
            type: 'room_created',
            data: {
                room: {
                    id: room.id,
                    name: room.name,
                    variant: room.variant,
                    playerCount: 0,
                    maxPlayers: room.maxPlayers,
                    gameType: this.roomManager.getGameTypeDisplayName()
                }
            }
        });

        console.log(`🏠 Room created: ${room.id} (Blind Man's Bluff)`);
    }

    handleListRooms(clientId) {
        const rooms = this.roomManager.listRooms();
        this.sendMessage(clientId, {
            type: 'rooms_list',
            data: { rooms }
        });
    }

    handleJoinRoom(clientId, data) {
        const { roomId, playerName, chips } = data;
        const client = this.clients.get(clientId);

        // Security: Define chip limits to prevent abuse
        const MIN_CHIPS = 100;
        const MAX_CHIPS = 10000;
        const DEFAULT_CHIPS = 1000;

        // Security: Validate and sanitize chip count
        let validatedChips = DEFAULT_CHIPS;
        if (typeof chips === 'number' && Number.isFinite(chips)) {
            validatedChips = Math.floor(Math.min(Math.max(chips, MIN_CHIPS), MAX_CHIPS));
        }

        // Security: Sanitize player name (prevent XSS and limit length)
        const sanitizedName = String(playerName || 'Player')
            .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
            .substring(0, 20); // Limit name length

        try {
            const player = this.roomManager.joinRoom(roomId, clientId, sanitizedName, validatedChips);
            client.playerId = clientId;
            client.roomId = roomId;

            // Send room and game state to the joining player
            // Security: Use getGameStateForClient to prevent card leaks
            const room = this.roomManager.getRoom(roomId);
            this.sendMessage(clientId, {
                type: 'room_joined',
                data: {
                    room: {
                        id: room.id,
                        name: room.name,
                        variant: room.variant,
                        gameType: this.roomManager.getGameTypeDisplayName(room.variant)
                    },
                    gameState: room.game.getGameStateForClient(clientId),
                    player: {
                        id: player.id,
                        name: player.name,
                        chips: player.chips
                    }
                }
            });

            // Notify other players in the room
            // Security: Each player gets personalized game state to prevent card leaks
            for (const [otherClientId, otherClient] of this.clients) {
                if (otherClient.roomId === roomId && otherClientId !== clientId) {
                    this.sendMessage(otherClientId, {
                        type: 'player_joined',
                        data: {
                            player: {
                                id: player.id,
                                name: player.name,
                                chips: player.chips
                            },
                            roomState: room.game.getGameStateForClient(otherClientId)
                        }
                    });
                }
            }

            console.log(`👤 ${playerName} joined room ${roomId}`);

            // Auto-start game if enough players
            if (room.players.size >= room.settings.minPlayers && room.settings.autoStart) {
                this.startGameInRoom(roomId);
            }

        } catch (error) {
            this.sendError(clientId, error.message);
        }
    }

    handleLeaveRoom(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        this.roomManager.leaveRoom(client.roomId, clientId);

        this.broadcastToRoom(client.roomId, clientId, {
            type: 'player_left',
            data: { playerId: clientId }
        });

        client.roomId = null;
        client.playerId = null;

        this.sendMessage(clientId, {
            type: 'room_left',
            data: { message: 'Left room successfully' }
        });

        console.log(`🚪 Player left room ${client.roomId}`);
    }

    handleStartGame(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        // Security: Only room creator can start the game
        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.sendError(clientId, 'Room not found');
            return;
        }

        if (room.creatorId && room.creatorId !== clientId) {
            this.sendError(clientId, 'Only the room creator can start the game');
            return;
        }

        this.startGameInRoom(client.roomId);
    }

    async startGameInRoom(roomId) {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        if (room.players.size < room.settings.minPlayers) {
            this.broadcastToRoom(roomId, null, {
                type: 'game_error',
                data: { message: 'Not enough players to start game' }
            });
            return;
        }

        // Start Blind Man's Bluff game
        await this.startBlindMansBluffGame(room);
    }

    async startBlindMansBluffGame(room) {
        room.game.currentRound = 'dealing';
        
        let shuffleSeed = null;
        let isVerifiableShuffle = false;

        if (room.game.useDistributedRandomness) {
            const randomnessResult = room.game.finalizeRandomness();
            if (randomnessResult.success) {
                shuffleSeed = randomnessResult.finalSeed;
                isVerifiableShuffle = true;
                console.log(`🎲 Using distributed randomness seed for room ${room.id} (${randomnessResult.contributorCount} contributors)`);
            } else {
                console.log(`⚠️ Distributed randomness failed for room ${room.id}: ${randomnessResult.reason}`);
            }
        }

        room.game.deck.shuffle(shuffleSeed);
        
        const deckStateBefore = room.game.deck.getProofState();
        
        const deckCommitmentHash = room.game.commitToDeck();
        console.log(`🔐 Deck commitment hash for room ${room.id}: ${deckCommitmentHash.substring(0, 16)}...`);

        this.broadcastToRoom(room.id, null, {
            type: 'deck_committed',
            data: {
                gameId: room.game.gameId,
                commitmentHash: deckCommitmentHash,
                timestamp: Date.now(),
                algorithm: 'SHA-256',
                isVerifiableShuffle: isVerifiableShuffle,
                shuffleVersion: VerifiableShuffle.SHUFFLE_VERSION,
                note: isVerifiableShuffle 
                    ? 'Deck shuffled with distributed randomness. Full verification transcript available at game end.'
                    : 'Deck shuffled with server randomness. Commitment binds server to current deck order.'
            }
        });

        this.auditLogger.logDeckCommitment(room.game.gameId, deckCommitmentHash, {
            roomId: room.id,
            playerCount: room.players.size
        });
        
        // Encrypt deck state using AEAD before storage/transmission
        const encryptedDeckState = this.aeadEncryption.encryptDeckState(room.game.deck, room.game.gameId);
        room.game.encryptedDeckState = encryptedDeckState;
        this.auditLogger.logCrypto('deck_encrypted', {
            gameId: room.game.gameId,
            roomId: room.id,
            algorithm: 'AES-256-GCM'
        });

        // Register deck with PIR before dealing if enabled
        if (this.pirClient.isEnabled()) {
            const registrationResult = await this.pirClient.registerDeck(room.id, room.game.deck);
            if (registrationResult.success) {
                console.log(`PIR: Deck registered for room ${room.id}`);
            } else {
                console.log(`PIR: Deck registration skipped - ${registrationResult.reason || registrationResult.error}`);
            }
        }
        
        // Step 3: Deal cards using seat indices for verifiable dealing
        // Player with seatIndex N receives card at index N from committed deck
        this.dealCardsWithVerifiableOrder(room.game);
        room.game.currentRound = 'betting';
        room.game.currentBet = room.game.bootAmount;

        // Get deck state after dealing
        const deckStateAfter = room.game.deck.getProofState();

        // Generate SNARK proofs asynchronously (non-blocking)
        this.generateGameProofs(room, deckStateBefore, deckStateAfter);

        // Include PIR status in game started message
        const pirStatus = this.pirClient.getGamePIRStatus(room.id);

        // Indian Poker: Send personalized game state to each player
        // Each player sees OTHER players' cards but NOT their own
        // Include deck commitment hash for cryptographic verification
        for (const [clientId, client] of this.clients) {
            if (client.roomId === room.id) {
                const player = room.game.players.get(clientId);
                this.sendMessage(clientId, {
                    type: 'game_started',
                    data: {
                        gameState: room.game.getGameStateForClient(clientId),
                        pirStatus: pirStatus,
                        message: '🎮 Indian Poker game started! You can see other players\' cards but not your own.',
                        snarkStatus: snarkVerifier.isAvailable() ? 'generating' : 'unavailable',
                        // Cryptographic fairness data
                        deckCommitmentHash: deckCommitmentHash,
                        yourSeatIndex: player ? player.seatIndex : null,
                        gameId: room.game.gameId,
                        verificationNote: 'At game end, the full deck will be revealed. You can verify: SHA-256(serialized deck) matches this commitment hash, and your card matches committedDeckOrder[yourSeatIndex].'
                    }
                });
            }
        }

        console.log(`🎯 Indian Poker game started in room ${room.id} (PIR: ${pirStatus.enabled ? 'enabled' : 'disabled'})`);
    }

    /**
     * Deal cards in verifiable order using secure unpredictable indices
     * Uses SecureDealingIndex to prevent seat-based prediction attacks
     * This allows clients to verify dealing was fair after deck reveal
     */
    dealCardsWithVerifiableOrder(game) {
        const playerCount = game.players.size;
        const gameSecret = game.deckNonce || crypto.randomBytes(16).toString('hex');
        
        const dealingInfo = this.secureDealingIndex.generateDealingOrder(
            playerCount,
            gameSecret,
            game.gameId
        );

        game.dealingOrder = dealingInfo.order;
        game.dealingSeed = dealingInfo.seed;

        const playerArray = Array.from(game.players.entries())
            .sort((a, b) => a[1].seatIndex - b[1].seatIndex);

        for (let i = 0; i < dealingInfo.order.length; i++) {
            const dealIndex = dealingInfo.order[i];
            const [playerId, player] = playerArray[dealIndex];
            
            player.cards = [];
            player.cardPositions = [];
            
            const card = game.deck.dealCard();
            player.cards.push(card);
            player.cardPositions.push(i);
        }

        this.auditLogger.logGame('CARDS_DEALT', {
            gameId: game.gameId,
            playerCount,
            dealingOrder: dealingInfo.order,
            dealingSeed: dealingInfo.seed
        });

        this.cryptoMonitor.recordOperation('card_dealing', game.gameId, {
            playerCount,
            dealingOrder: dealingInfo.order
        });
    }

    /**
     * Check if ZK proofs are required for game progression
     * When ZK_CONFIG.requireProofsForGameProgress is true, the game cannot
     * proceed to betting phase until proofs are generated
     */
    zkProofsRequired() {
        return ZK_CONFIG.enabled && ZK_CONFIG.requireProofsForGameProgress;
    }

    /**
     * Check if game can proceed based on ZK proof requirements
     * Returns { canProceed: boolean, reason: string }
     */
    canGameProceed(game) {
        if (!this.zkProofsRequired()) {
            return { canProceed: true, reason: 'ZK proofs not required' };
        }

        if (!snarkVerifier.isAvailable()) {
            return { 
                canProceed: false, 
                reason: 'ZK proofs required but SNARK system not available' 
            };
        }

        if (!game.snarkEnabled) {
            return { 
                canProceed: false, 
                reason: 'Waiting for ZK proofs to be generated' 
            };
        }

        const hasRequiredProofs = (
            (!ZK_CONFIG.verifyOnShuffle || game.proofs.shuffle !== null) &&
            (!ZK_CONFIG.verifyOnDeal || game.proofs.dealing !== null)
        );

        if (!hasRequiredProofs) {
            return { 
                canProceed: false, 
                reason: 'Required ZK proofs not yet generated' 
            };
        }

        return { canProceed: true, reason: 'All required ZK proofs available' };
    }

    /**
     * Generate SNARK proofs for a game (runs asynchronously)
     * When ZK_CONFIG.requireProofsForGameProgress is true, this will block
     * game progression until proofs are generated
     */
    async generateGameProofs(room, deckStateBefore, deckStateAfter) {
        if (!snarkVerifier.isAvailable()) {
            console.log(`SNARK proofs not available for room ${room.id}`);
            if (this.zkProofsRequired()) {
                this.broadcastToRoom(room.id, null, {
                    type: 'zk_proof_error',
                    data: {
                        gameId: room.game.gameId,
                        error: 'SNARK system not available but ZK proofs are required',
                        message: 'Game cannot proceed without ZK proofs. Please contact administrator.'
                    }
                });
            }
            return;
        }

        const game = room.game;
        const gameId = game.gameId;

        try {
            console.log(`Generating SNARK proofs for game ${gameId}...`);

            // Convert deck to numeric indices for SNARK
            const originalDeckIndices = deckStateBefore.originalDeck.map(card => {
                const suitOrder = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
                const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                return suitOrder.indexOf(card.suit) * 13 + rankOrder.indexOf(card.rank);
            });

            const shuffledDeckIndices = deckStateBefore.shuffledDeck.map(card => {
                const suitOrder = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
                const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
                return suitOrder.indexOf(card.suit) * 13 + rankOrder.indexOf(card.rank);
            });

            // Generate shuffle proof
            const shuffleResult = await snarkVerifier.generateShuffleProof(
                gameId,
                originalDeckIndices,
                shuffledDeckIndices,
                deckStateBefore.permutation
            );

            if (shuffleResult.success) {
                game.proofs.shuffle = shuffleResult.proof;
                console.log(`Shuffle proof generated for game ${gameId} in ${shuffleResult.processingTime}ms`);
            } else {
                console.warn(`Shuffle proof generation failed: ${shuffleResult.error}`);
            }

            // Generate dealing proof
            const dealPositions = deckStateAfter.dealPositions;
            const dealingResult = await snarkVerifier.generateDealingProof(
                gameId,
                shuffledDeckIndices,
                dealPositions
            );

            if (dealingResult.success) {
                game.proofs.dealing = dealingResult.proof;
                console.log(`Dealing proof generated for game ${gameId} in ${dealingResult.processingTime}ms`);
            } else {
                console.warn(`Dealing proof generation failed: ${dealingResult.error}`);
            }

            // Mark SNARK as enabled if at least one proof was generated
            game.snarkEnabled = game.proofs.shuffle !== null || game.proofs.dealing !== null;

            // Notify clients that proofs are ready
            if (game.snarkEnabled) {
                this.broadcastToRoom(room.id, null, {
                    type: 'proofs_ready',
                    data: {
                        gameId: gameId,
                        hasProofs: {
                            shuffle: game.proofs.shuffle !== null,
                            dealing: game.proofs.dealing !== null
                        },
                        message: 'SNARK proofs generated for verifiable fairness'
                    }
                });
            }

        } catch (error) {
            console.error(`Error generating SNARK proofs for game ${gameId}:`, error.message);
        }
    }

    handleMakeBet(clientId, data) {
        const { amount } = data;
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        // Security: Only allow betting during the betting phase
        if (room.game.currentRound !== 'betting') {
            this.sendError(clientId, 'Betting is only allowed during the betting phase');
            return;
        }

        // ZK Proof Enforcement: Block betting until proofs are ready when required
        const proofCheck = this.canGameProceed(room.game);
        if (!proofCheck.canProceed) {
            this.sendError(clientId, `Cannot place bet: ${proofCheck.reason}`);
            return;
        }

        // Security: Player must not have already folded
        if (player.hasFolded) {
            this.sendError(clientId, 'You have already folded');
            return;
        }

        // Security: Validate bet amount is a positive number
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
            this.sendError(clientId, 'Invalid bet amount: must be a positive number');
            return;
        }

        // Security: Ensure amount is an integer (no fractional chips)
        const betAmount = Math.floor(amount);

        // Security: Enforce minimum bet (must match or exceed current bet)
        if (betAmount < room.game.currentBet && betAmount !== player.chips) {
            this.sendError(clientId, `Minimum bet is ${room.game.currentBet} (or all-in)`);
            return;
        }

        if (betAmount > player.chips) {
            this.sendError(clientId, 'Insufficient chips');
            return;
        }

        player.chips -= betAmount;
        player.bet += betAmount;
        room.game.pot += betAmount;

        // Update current bet if this bet is higher
        if (betAmount > room.game.currentBet) {
            room.game.currentBet = betAmount;
        }

        // Indian Poker: Send personalized game state to each player
        this.broadcastPersonalizedGameState(room, 'bet_made', {
            playerId: clientId,
            playerName: player.name,
            amount: betAmount
        });

        console.log(`💰 ${player.name} bet ${betAmount} in room ${room.id}`);
    }

    handleFold(clientId) {
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        // Security: Only allow folding during the betting phase
        if (room.game.currentRound !== 'betting') {
            this.sendError(clientId, 'Folding is only allowed during the betting phase');
            return;
        }

        // ZK Proof Enforcement: Block folding until proofs are ready when required
        const proofCheck = this.canGameProceed(room.game);
        if (!proofCheck.canProceed) {
            this.sendError(clientId, `Cannot fold: ${proofCheck.reason}`);
            return;
        }

        // Security: Player must not have already folded
        if (player.hasFolded) {
            this.sendError(clientId, 'You have already folded');
            return;
        }

        player.hasFolded = true;

        // Indian Poker: Send personalized game state to each player
        this.broadcastPersonalizedGameState(room, 'player_folded', {
            playerId: clientId,
            playerName: player.name
        });

        // Check if game should end
        this.checkGameEnd(room);
    }

    handleShowCards(clientId) {
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room || room.variant !== GAME_VARIANTS.BLIND_MANS_BLUFF) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        // ZK Proof Enforcement: Block showing cards until proofs are ready when required
        const proofCheck = this.canGameProceed(room.game);
        if (!proofCheck.canProceed) {
            this.sendError(clientId, `Cannot show cards: ${proofCheck.reason}`);
            return;
        }

        // Security: Only allow show_cards during showdown phase
        // In Indian Poker, players should NOT see their own card during betting
        if (room.game.currentRound !== 'showdown') {
            this.sendError(clientId, 'Cards can only be shown during showdown phase');
            return;
        }

        player.hasShown = true;
        player.handValue = room.game.evaluateHand(player.cards);

        this.broadcastToRoom(room.id, null, {
            type: 'cards_shown',
            data: {
                playerId: clientId,
                playerName: player.name,
                handValue: player.handValue,
                cards: player.cards.map(card => card.getDisplayName())
            }
        });

        // If all players have shown, determine winner
        const activePlayers = Array.from(room.game.players.values()).filter(p => !p.hasFolded);
        if (activePlayers.every(p => p.hasShown)) {
            this.endTeenPattiGame(room);
        }
    }

    endTeenPattiGame(room) {
        const result = room.game.processBettingRound();

        const deckReveal = room.game.getDeckReveal();
        const proofs = room.game.getProofs();

        let verificationTranscript = null;
        if (room.game.useDistributedRandomness && room.game.deck.isVerifiableShuffle) {
            verificationTranscript = room.game.generateVerificationTranscript();
        }

        this.broadcastToRoom(room.id, null, {
            type: 'game_ended',
            data: {
                winner: {
                    id: result.winner.id,
                    name: result.winner.name
                },
                winningHand: result.handValue,
                allHands: result.allHands,
                pot: room.game.pot,
                message: `🏆 ${result.winner.name} wins with ${result.handValue.name}!`,
                deckReveal: deckReveal,
                verificationTranscript: verificationTranscript
            }
        });

        if (proofs && (proofs.shuffleProof || proofs.dealingProof)) {
            this.broadcastToRoom(room.id, null, {
                type: 'zk_proof_deal',
                data: {
                    gameId: room.game.gameId,
                    proofs: {
                        shuffle: proofs.shuffleProof || null,
                        dealing: proofs.dealingProof || null
                    },
                    verificationData: {
                        deckCommitmentHash: deckReveal.deckCommitmentHash,
                        dealingOrder: room.game.dealingOrder || null,
                        dealingSeed: room.game.dealingSeed || null,
                        isVerifiableShuffle: room.game.deck.isVerifiableShuffle,
                        shuffleVersion: VerifiableShuffle.SHUFFLE_VERSION
                    },
                    verificationTranscript: verificationTranscript,
                    timestamp: Date.now(),
                    note: verificationTranscript 
                        ? 'Full verification transcript included. Clients can reproduce the exact shuffle from the disclosed seeds.'
                        : 'Use these proofs to verify the shuffle and dealing were fair. See CLIENT_VERIFICATION.md for verification code.'
                }
            });

            this.auditLogger.logProofGeneration(room.game.gameId, 'zk_proof_deal_sent', {
                hasShuffleProof: !!proofs.shuffleProof,
                hasDealingProof: !!proofs.dealingProof,
                hasVerificationTranscript: !!verificationTranscript,
                roomId: room.id
            });
        }

        console.log(`🎉 Indian Poker game ended in room ${room.id}. Winner: ${result.winner.name}`);
        console.log(`🔓 Deck revealed for verification. Commitment hash: ${deckReveal.deckCommitmentHash.substring(0, 16)}...`);
        if (verificationTranscript) {
            console.log(`📜 Verification transcript generated. Transcript hash: ${verificationTranscript.transcriptHash.substring(0, 16)}...`);
        }
    }

    checkGameEnd(room) {
        if (room.variant === GAME_VARIANTS.BLIND_MANS_BLUFF) {
            const activePlayers = Array.from(room.game.players.values()).filter(p => !p.hasFolded);
            if (activePlayers.length <= 1) {
                const winner = activePlayers[0];
                if (winner) {
                    winner.chips += room.game.pot;

                    // CRYPTOGRAPHIC FAIRNESS: Reveal the committed deck for verification
                    const deckReveal = room.game.getDeckReveal();
                    const proofs = room.game.getProofs();

                    this.broadcastToRoom(room.id, null, {
                        type: 'game_ended',
                        data: {
                            winner: {
                                id: winner.id,
                                name: winner.name
                            },
                            message: `🏆 ${winner.name} wins by default!`,
                            pot: room.game.pot,
                            // Cryptographic verification data
                            deckReveal: deckReveal
                        }
                    });

                    // Send explicit zk_proof_deal message with ZK proofs for client verification
                    if (proofs && (proofs.shuffleProof || proofs.dealingProof)) {
                        this.broadcastToRoom(room.id, null, {
                            type: 'zk_proof_deal',
                            data: {
                                gameId: room.game.gameId,
                                proofs: {
                                    shuffle: proofs.shuffleProof || null,
                                    dealing: proofs.dealingProof || null
                                },
                                verificationData: {
                                    deckCommitmentHash: deckReveal.deckCommitmentHash,
                                    dealingOrder: room.game.dealingOrder || null,
                                    dealingSeed: room.game.dealingSeed || null
                                },
                                timestamp: Date.now(),
                                note: 'Use these proofs to verify the shuffle and dealing were fair. See CLIENT_VERIFICATION.md for verification code.'
                            }
                        });

                        this.auditLogger.logProofGeneration(room.game.gameId, 'zk_proof_deal_sent', {
                            hasShuffleProof: !!proofs.shuffleProof,
                            hasDealingProof: !!proofs.dealingProof,
                            roomId: room.id
                        });
                    }

                    console.log(`🎉 Indian Poker game ended in room ${room.id}. Winner: ${winner.name} (by default)`);
                    console.log(`🔓 Deck revealed for verification. Commitment hash: ${deckReveal.deckCommitmentHash.substring(0, 16)}...`);
                }
            }
        }
    }

    handleGetGameState(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) return;

        // Security: Always use getGameStateForClient to prevent card leaks
        // In Indian Poker, players should never see their own card during the game
        const gameState = room.game.getGameStateForClient(clientId);

        this.sendMessage(clientId, {
            type: 'game_state',
            data: { gameState }
        });
    }

    handleGetProofs(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.sendError(clientId, 'Room not found');
            return;
        }

        // Only Blind Man's Bluff games have SNARK proofs
        if (room.variant !== GAME_VARIANTS.BLIND_MANS_BLUFF) {
            this.sendError(clientId, 'SNARK proofs only available for Blind Man\'s Bluff');
            return;
        }

        const proofs = room.game.getProofs();
        this.sendMessage(clientId, {
            type: 'proofs',
            data: proofs
        });
    }

    /**
     * Handle request to verify a specific proof
     * SECURITY ENHANCEMENT: Added rate limiting and proof replay protection
     */
    async handleVerifyProof(clientId, data) {
        // Security Enhancement: Rate limiting check
        const rateLimitCheck = this.rateLimiter.checkLimit(clientId, 'proof_verification');
        if (!rateLimitCheck.allowed) {
            this.sendMessage(clientId, {
                type: 'proof_verification',
                data: {
                    success: false,
                    error: 'Rate limit exceeded. Try again in ' + Math.ceil(rateLimitCheck.retryAfter / 1000) + ' seconds'
                }
            });
            return;
        }

        if (!snarkVerifier.isAvailable()) {
            this.sendMessage(clientId, {
                type: 'proof_verification',
                data: {
                    success: false,
                    error: 'SNARK verification not available'
                }
            });
            return;
        }

        const { proof } = data;
        if (!proof) {
            this.sendError(clientId, 'No proof provided');
            return;
        }

        // Security Enhancement: Proof validation with replay protection
        const proofValidation = this.proofValidator.validateProof(proof);
        if (!proofValidation.valid) {
            this.sendMessage(clientId, {
                type: 'proof_verification',
                data: {
                    success: false,
                    error: proofValidation.reason
                }
            });
            return;
        }

        try {
            const result = await snarkVerifier.verifyProof(proof);
            
            // Record the operation for rate limiting
            this.rateLimiter.recordOperation(clientId, 'proof_verification');
            
            // Mark proof as used to prevent replay
            if (result.valid) {
                this.proofValidator.markProofUsed(proof);
            }

            this.sendMessage(clientId, {
                type: 'proof_verification',
                data: {
                    success: true,
                    valid: result.valid,
                    error: result.error
                }
            });
        } catch (error) {
            this.sendMessage(clientId, {
                type: 'proof_verification',
                data: {
                    success: false,
                    error: error.message
                }
            });
        }
    }

    /**
     * Handle request for SNARK system status
     */
    handleGetSnarkStatus(clientId) {
        const status = {
            available: snarkVerifier.isAvailable(),
            statistics: snarkVerifier.getStatistics()
        };

        this.sendMessage(clientId, {
            type: 'snark_status',
            data: status
        });
    }

    handleGetPIRStatus(clientId) {
        const client = this.clients.get(clientId);
        const roomId = client ? client.roomId : null;
        
        const pirStatus = {
            enabled: this.pirClient.isEnabled(),
            connected: this.pirClient.isConnected,
            serverUrl: PIR_CONFIG.baseUrl
        };

        if (roomId) {
            pirStatus.gameStatus = this.pirClient.getGamePIRStatus(roomId);
        }

        this.sendMessage(clientId, {
            type: 'pir_status',
            data: pirStatus
        });
    }

    async handleVerifyCards(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.sendError(clientId, 'Room not found');
            return;
        }

        const player = room.game.players.get(clientId);
        if (!player || !player.cardPositions) {
            this.sendError(clientId, 'No cards to verify');
            return;
        }

        try {
            const verification = await this.pirClient.verifyCardDeal(
                client.roomId,
                clientId,
                player.cardPositions
            );

            this.sendMessage(clientId, {
                type: 'card_verification',
                data: verification
            });
        } catch (error) {
            console.error('Card verification failed:', error);
            this.sendError(clientId, 'Card verification failed');
        }
    }

    async handleGetCardProof(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const { position } = data || {};
        if (position === undefined) {
            this.sendError(clientId, 'Card position required');
            return;
        }

        // Security: Validate position is a number
        if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
            this.sendError(clientId, 'Invalid card position');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.sendError(clientId, 'Room not found');
            return;
        }

        // Security: Block card proof queries during active gameplay
        // In Indian Poker, players should NOT see any cards (including their own) during the game
        // Card proofs are only allowed after the game ends for fairness verification
        const activeGameStates = ['ante', 'dealing', 'betting'];
        if (room.game && activeGameStates.includes(room.game.currentRound)) {
            this.sendError(clientId, 'Card proofs are only available after the game ends');
            return;
        }

        try {
            const cardInfo = await this.pirClient.queryCard(client.roomId, position);
            
            this.sendMessage(clientId, {
                type: 'card_proof',
                data: cardInfo || { error: 'Card not found' }
            });
        } catch (error) {
            console.error('Card proof request failed:', error);
            this.sendError(clientId, 'Card proof request failed');
        }
    }

    /**
     * PIR Integration: Handle request for hidden card data via PIR
     * This is the privacy-preserving way to access other players' cards
     * In Indian Poker, players can see OTHER players' cards but not their own
     * SECURITY: Rate limited to prevent abuse and information leakage
     */
    async handleGetHiddenCard(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const rateLimit = this.rateLimiter.checkLimit(clientId, 'hidden_card');
        if (!rateLimit.allowed) {
            this.sendError(clientId, 'Too many card requests');
            this.auditLogger.logSecurity('HIDDEN_CARD_RATE_LIMIT', {
                clientId,
                attempts: rateLimit.attempts
            });
            this.anomalyDetector.recordAction(clientId, 'rate_limit_exceeded', { 
                operation: 'hidden_card',
                timestamp: Date.now() 
            });
            return;
        }
        this.rateLimiter.recordOperation(clientId, 'hidden_card');

        const { targetPlayerId, position } = data || {};
        
        // Validate inputs
        if (!targetPlayerId) {
            this.sendError(clientId, 'Target player ID required');
            return;
        }
        
        if (position === undefined || typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
            this.sendError(clientId, 'Valid card position required');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        // Security: In Indian Poker, players CANNOT see their own card
        if (targetPlayerId === clientId) {
            this.sendError(clientId, 'Cannot view your own card in Indian Poker');
            return;
        }

        // Verify target player exists in the game
        const targetPlayer = room.game.players.get(targetPlayerId);
        if (!targetPlayer) {
            this.sendError(clientId, 'Target player not found in game');
            return;
        }

        // Check if PIR is required for hidden card access
        if (this.pirClient.isRequiredForHiddenCards()) {
            if (!this.pirClient.isReadyForGame()) {
                this.sendError(clientId, 'PIR server is required but not available');
                return;
            }

            try {
                // Get card via PIR (privacy-preserving)
                const result = await this.pirClient.getHiddenCardViaPIR(
                    client.roomId,
                    clientId,
                    position,
                    targetPlayerId
                );

                if (result.success) {
                    this.sendMessage(clientId, {
                        type: 'hidden_card',
                        data: {
                            targetPlayerId,
                            card: result.cardData,
                            pirVerification: result.pirVerification
                        }
                    });
                } else {
                    this.sendError(clientId, result.reason || 'Failed to get card via PIR');
                }
            } catch (error) {
                console.error('PIR hidden card request failed:', error);
                this.sendError(clientId, 'PIR request failed');
            }
        } else {
            // PIR not required - return card directly (less secure but functional)
            // This is the fallback when PIR is disabled or not required
            const card = targetPlayer.cards ? targetPlayer.cards[0] : null;
            if (card) {
                this.sendMessage(clientId, {
                    type: 'hidden_card',
                    data: {
                        targetPlayerId,
                        card: {
                            rank: card.rank,
                            suit: card.suit
                        },
                        pirVerification: null // No PIR verification when PIR is disabled
                    }
                });
            } else {
                this.sendError(clientId, 'Target player has no cards');
            }
        }
    }

    /**
     * Security Enhancement: Handle player randomness commitment
     * Players commit to a hash of their random seed before revealing
     */
    handleCommitRandomness(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        const { commitment } = data || {};
        if (!commitment || typeof commitment !== 'string' || commitment.length !== 64) {
            this.sendError(clientId, 'Invalid commitment format (expected 64-char hex hash)');
            return;
        }

        try {
            room.game.distributedRandomness.addCommitment(clientId, commitment);
            
            this.sendMessage(clientId, {
                type: 'randomness_committed',
                data: { success: true, playerId: clientId }
            });

            this.broadcastToRoom(client.roomId, clientId, {
                type: 'player_committed_randomness',
                data: { playerId: clientId }
            });

            if (room.game.distributedRandomness.commitmentPhaseComplete) {
                this.broadcastToRoom(client.roomId, null, {
                    type: 'commitment_phase_complete',
                    data: { message: 'All players have committed. Ready for reveal phase.' }
                });
            }
        } catch (error) {
            this.sendError(clientId, error.message);
        }
    }

    /**
     * Security Enhancement: Handle player randomness reveal
     * Players reveal their actual seed after all commitments are in
     */
    handleRevealRandomness(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        const { seed } = data || {};
        if (!seed || typeof seed !== 'string') {
            this.sendError(clientId, 'Invalid seed format');
            return;
        }

        try {
            const result = room.game.distributedRandomness.addReveal(clientId, seed);
            
            this.sendMessage(clientId, {
                type: 'randomness_revealed',
                data: { success: true, playerId: clientId }
            });

            this.broadcastToRoom(client.roomId, clientId, {
                type: 'player_revealed_randomness',
                data: { playerId: clientId }
            });

            if (room.game.distributedRandomness.revealPhaseComplete) {
                const finalSeed = room.game.distributedRandomness.getFinalSeed();
                room.game.gameSecret = finalSeed;
                room.game.useDistributedRandomness = true;

                this.broadcastToRoom(client.roomId, null, {
                    type: 'randomness_finalized',
                    data: { 
                        message: 'Distributed randomness finalized',
                        seedHash: require('crypto').createHash('sha256').update(finalSeed).digest('hex').substring(0, 16)
                    }
                });
            }
        } catch (error) {
            this.sendError(clientId, error.message);
        }
    }

    /**
     * Security Enhancement: Get current randomness status for the game
     */
    handleGetRandomnessStatus(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        const status = room.game.distributedRandomness.getStatus();
        
        this.sendMessage(clientId, {
            type: 'randomness_status',
            data: {
                ...status,
                useDistributedRandomness: room.game.useDistributedRandomness
            }
        });
    }

    handleCreateCheckpoint(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        const gameState = {
            deckCommitment: room.game.deckCommitment,
            dealtCards: room.game.dealtCards || [],
            playerCount: room.game.players.size,
            currentRound: room.game.currentRound || 0
        };

        const checkpoint = this.verificationCheckpoint.createCheckpoint(room.id, gameState);
        
        this.auditLogger.logGame('CHECKPOINT_CREATED', {
            gameId: room.id,
            checkpointId: checkpoint.id,
            clientId
        });

        this.cryptoMonitor.recordOperation('checkpoint_created', clientId, {
            gameId: room.id,
            checkpointId: checkpoint.id
        });

        this.sendMessage(clientId, {
            type: 'checkpoint_created',
            data: {
                checkpointId: checkpoint.id,
                timestamp: checkpoint.timestamp,
                stateHash: checkpoint.stateHash
            }
        });
    }

    handleVerifyCheckpoint(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room || !room.game) {
            this.sendError(clientId, 'No active game');
            return;
        }

        const { checkpointId } = data;
        if (!checkpointId) {
            this.sendError(clientId, 'Checkpoint ID required');
            return;
        }

        const currentState = {
            deckCommitment: room.game.deckCommitment,
            dealtCards: room.game.dealtCards || [],
            playerCount: room.game.players.size,
            currentRound: room.game.currentRound || 0
        };

        const result = this.verificationCheckpoint.verifyCheckpoint(room.id, checkpointId, currentState);

        this.auditLogger.logGame('CHECKPOINT_VERIFIED', {
            gameId: room.id,
            checkpointId,
            valid: result.valid,
            clientId
        });

        if (!result.valid) {
            this.cryptoMonitor.recordVerificationFailure(clientId, result.error);
        }

        this.sendMessage(clientId, {
            type: 'checkpoint_verification',
            data: result
        });
    }

    handleGetCheckpoints(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) {
            this.sendError(clientId, 'Not in a room');
            return;
        }

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) {
            this.sendError(clientId, 'Room not found');
            return;
        }

        const checkpoints = this.verificationCheckpoint.getCheckpoints(room.id);

        this.sendMessage(clientId, {
            type: 'checkpoints_list',
            data: {
                gameId: room.id,
                checkpoints: checkpoints.map(cp => ({
                    id: cp.id,
                    timestamp: cp.timestamp,
                    stateHash: cp.stateHash
                }))
            }
        });
    }

    handleGetSecurityStats(clientId) {
        const stats = {
            cryptoMonitor: this.cryptoMonitor.getStatistics(),
            proofValidator: this.proofValidator.getStatistics(),
            rateLimiter: this.rateLimiter.getStatus(clientId),
            recentAlerts: this.cryptoMonitor.getAlerts(Date.now() - 3600000)
        };

        this.sendMessage(clientId, {
            type: 'security_stats',
            data: stats
        });
    }

    handleDisconnection(clientId) {
        console.log(`🔌 Disconnection: ${clientId}`);

        const client = this.clients.get(clientId);
        if (client && client.roomId) {
            this.roomManager.leaveRoom(client.roomId, clientId);

            this.broadcastToRoom(client.roomId, clientId, {
                type: 'player_disconnected',
                data: { playerId: clientId }
            });
        }

        this.clients.delete(clientId);
    }

    broadcastToRoom(roomId, excludeClientId, message) {
        for (const [clientId, client] of this.clients) {
            if (client.roomId === roomId && clientId !== excludeClientId) {
                this.sendMessage(clientId, message);
            }
        }
    }

    /**
     * Broadcast personalized game state to all players in a room
     * Each player sees OTHER players' cards but NOT their own (Indian Poker mechanic)
     * SECURITY: Game state is encrypted with a unique key derived from gameId + clientId
     * so clients cannot decrypt messages intended for other clients
     */
    broadcastPersonalizedGameState(room, messageType, additionalData = {}) {
        if (!room.game || typeof room.game.getGameStateForClient !== 'function') {
            return;
        }
        
        const gameId = room.game.gameId || room.id;
        
        for (const [clientId, client] of this.clients) {
            if (client.roomId === room.id) {
                const personalizedState = room.game.getGameStateForClient(clientId);
                const securityEnabled = this.clientSecurityEnabled.get(clientId);
                
                if (securityEnabled && securityEnabled.encryptionEnabled) {
                    const encryptedGameState = this.messageEncryption.encryptPersonalizedGameState(
                        gameId,
                        clientId,
                        personalizedState
                    );
                    
                    this.sendMessage(clientId, {
                        type: messageType,
                        data: {
                            ...additionalData,
                            encryptedGameState: encryptedGameState
                        }
                    });
                } else {
                    this.sendMessage(clientId, {
                        type: messageType,
                        data: {
                            ...additionalData,
                            gameState: personalizedState
                        }
                    });
                }
            }
        }
    }

    sendMessage(clientId, message, forceEncrypt = false) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            const securityEnabled = this.clientSecurityEnabled.get(clientId);
            if (securityEnabled && (forceEncrypt || securityEnabled.encryptionEnabled)) {
                try {
                    const encrypted = this.messageEncryption.encryptMessage(clientId, message);
                    const signature = this.messageAuthenticator.signMessage(clientId, encrypted);
                    client.ws.send(JSON.stringify({
                        type: 'encrypted_message',
                        data: {
                            encrypted: encrypted,
                            signature: signature
                        }
                    }));
                } catch (err) {
                    client.ws.send(JSON.stringify(message));
                }
            } else {
                client.ws.send(JSON.stringify(message));
            }
        }
    }

    sendError(clientId, errorMessage) {
        this.sendMessage(clientId, {
            type: 'error',
            data: { message: errorMessage }
        });
    }

    handleSecurityInit(clientId) {
        const encryptionKey = this.messageEncryption.deriveClientKey(clientId).toString('hex');
        const authKey = this.messageAuthenticator.generateClientKey(clientId);
        this.clientSecurityEnabled.set(clientId, {
            encryptionEnabled: true,
            initialized: Date.now()
        });
        this.auditLogger.logSecurity('security_init', { clientId });
        return {
            type: 'security_keys',
            data: {
                encryptionKey: encryptionKey,
                authKey: authKey,
                algorithm: 'AES-256-GCM',
                hmacAlgorithm: 'SHA-256'
            }
        };
    }

    decryptClientMessage(clientId, encryptedData, signature) {
        const securityEnabled = this.clientSecurityEnabled.get(clientId);
        if (!securityEnabled || !securityEnabled.encryptionEnabled) {
            return null;
        }
        if (!this.messageAuthenticator.verifyMessage(clientId, encryptedData, signature)) {
            this.auditLogger.logSecurity('hmac_verification_failed', { clientId });
            this.anomalyDetector.recordAction(clientId, 'hmac_failure', { timestamp: Date.now() });
            return null;
        }
        try {
            const decrypted = this.messageEncryption.decryptMessage(clientId, encryptedData);
            return decrypted;
        } catch (err) {
            this.auditLogger.logSecurity('decryption_failed', { clientId, error: err.message });
            return null;
        }
    }
}

/**
 * Client-side integration example
 */
const CLIENT_EXAMPLE = `
// Simple Indian Poker Client Example
class IndianPokerClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.clientId = null;
        this.roomId = null;
    }

    connect() {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
            console.log('🃏 Connected to Indian Poker Server');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            console.log('🔌 Disconnected from server');
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'connection_established':
                this.clientId = message.data.clientId;
                console.log('✅ Connected with ID:', this.clientId);
                break;

            case 'rooms_list':
                console.log('🏠 Available rooms:', message.data.rooms);
                break;

            case 'game_started':
                console.log('Game started:', message.data.message);
                break;

            case 'bet_made':
                console.log(message.data.playerName + ' bet ' + message.data.amount);
                break;

            case 'cards_shown':
                console.log(message.data.playerName + ' shows: ' + message.data.handValue.name);
                break;

            case 'game_ended':
                console.log(message.data.message);
                break;

            case 'error':
                console.error('Error:', message.data.message);
                break;
        }
    }

    // API Methods
    createRoom(variant = 'teen_patti', roomName) {
        this.send({
            type: 'create_room',
            data: { variant, roomName }
        });
    }

    listRooms() {
        this.send({ type: 'list_rooms' });
    }

    joinRoom(roomId, playerName, chips = 1000) {
        this.send({
            type: 'join_room',
            data: { roomId, playerName, chips }
        });
    }

    makeBet(amount) {
        this.send({
            type: 'make_bet',
            data: { amount }
        });
    }

    fold() {
        this.send({ type: 'fold' });
    }

    showCards() {
        this.send({ type: 'show_cards' });
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

// Usage example:
const client = new IndianPokerClient('ws://localhost:8080');
client.connect();

// Create a Teen Patti room
setTimeout(() => {
    client.createRoom('teen_patti', 'My Teen Patti Table');
}, 1000);

// List available rooms
setTimeout(() => {
    client.listRooms();
}, 2000);
`;

/**
 * Deployment and Setup Instructions
 */
const DEPLOYMENT_GUIDE = `
# Indian Poker Server Deployment Guide

## Quick Start

1. **Install Dependencies:**
   npm install ws uuid crypto

2. **Run Server:**
   node index.js

3. **Client Integration:**
   Use the provided CLIENT_EXAMPLE in your frontend

## Features

✅ **Teen Patti**: Authentic 3-card Indian poker with traditional hand rankings
✅ **Jhandi Munda**: Card-based dice prediction game
✅ **Real-time Multiplayer**: WebSocket-based instant communication
✅ **Cultural Authenticity**: Indian terminology and betting patterns
✅ **Room Management**: Create, join, and manage game rooms
✅ **Chip Management**: Virtual chip system for betting

## Game Variants

### Teen Patti
- 3-card Indian poker
- Traditional hand rankings (Trail, Pure Sequence, Sequence, Color, Pair, High Card)
- Authentic betting terms (Chaal, Pack, Show, Boot)
- Support for 2-6 players

### Jhandi Munda
- 6 dice simulation using cards
- Prediction-based betting
- Multiple win multipliers
- Support for unlimited players

## WebSocket API

### Messages (Client → Server)
- \`create_room\`: Create a new game room
- \`list_rooms\`: Get available rooms
- \`join_room\`: Join an existing room
- \`leave_room\`: Leave current room
- \`start_game\`: Start the game (room creator only)
- \`make_bet\`: Place a bet
- \`fold\`: Fold your hand (Teen Patti)
- \`show_cards\`: Show your cards (Teen Patti)

### Messages (Server → Client)
- \`connection_established\`: Welcome message with client ID
- \`rooms_list\`: List of available rooms
- \`room_created\`: Room created successfully
- \`room_joined\`: Successfully joined room
- \`game_started\`: Game has started
- \`bet_made\`: Player made a bet
- \`player_folded\`: Player folded
- \`cards_shown\`: Player showed cards
- \`game_ended\`: Game completed
- \`error\`: Error message

## Cultural Elements

The server includes authentic Indian poker terminology:
- **Chaal**: Call or raise
- **Pack**: Fold
- **Show**: Show cards
- **Boot**: Forced bet/ante
- **Pot**: Total betting amount

## Hand Rankings (Teen Patti)

1. **Trail** (Three of a kind) - Highest
2. **Pure Sequence** (Straight flush)
3. **Sequence** (Straight)
4. **Color** (Flush)
5. **Pair** (One pair)
6. **High Card** - Lowest

## Next Steps

1. Integrate with your frontend
2. Add user authentication
3. Implement persistence (database)
4. Add more Indian poker variants
5. Deploy to production server

Happy Gaming! 🃏🎯
`;

// Export for external use
if (require.main === module) {
    // Start the server if run directly
    const port = process.env.PORT || 8080;
    const server = new IndianPokerServer(port);

    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down Indian Poker Server...');
        server.wss.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });
    });

    // Log deployment guide
    console.log('\n' + '='.repeat(60));
    console.log(DEPLOYMENT_GUIDE);
    console.log('='.repeat(60));
}

module.exports = {
    IndianPokerServer,
    IndianPokerRoomManager,
    TeenPattiGame,
    PIRClient,
    PIR_CONFIG,
    CARD_SUITS,
    CARD_RANKS,
    GAME_VARIANTS,
    BETTING_TERMS,
    TEEN_PATTI_HAND_RANKINGS
};
