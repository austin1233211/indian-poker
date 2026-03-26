/**
 * GamerStake SDK + Indian Poker Security Integration - Proof of Concept
 * 
 * This server demonstrates how to integrate the GamerStake wagering platform SDK
 * with the cryptographic security features from the indian-poker project.
 * 
 * Features demonstrated:
 * - GamerStake SDK for player authentication and match lifecycle
 * - Distributed randomness (commit-reveal) for fair card dealing
 * - Verifiable shuffle for provably fair gameplay
 * - Rate limiting and anomaly detection
 * - Audit logging for security events
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
require('dotenv').config();

// Import GamerStake SDK
const { GameSDK } = require('@gamerstake/game-platform-sdk');

// Import security utilities from indian-poker
const {
    DistributedRandomness,
    CryptoRateLimiter,
    EnhancedCardHasher,
    CryptoMonitor,
    AuditLogger,
    VerifiableShuffle,
    NonceGenerator
} = require('./security-utils');

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const GAMERSTAKE_API_KEY = process.env.GAMERSTAKE_API_KEY || 'test-api-key-for-poc';
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';

// ============================================================================
// Initialize GamerStake SDK
// ============================================================================

const gameSDK = new GameSDK({
    apiKey: GAMERSTAKE_API_KEY,
    environment: ENVIRONMENT,
    debug: ENVIRONMENT === 'development',
});

console.log(`GamerStake SDK initialized: ${gameSDK.isInitialized()}`);

// ============================================================================
// Initialize Security Components (from indian-poker)
// ============================================================================

const rateLimiter = new CryptoRateLimiter({
    maxProofsPerHour: 10,
    maxCommitmentsPerHour: 20,
    maxHiddenCardPerMinute: 10
});

const cardHasher = new EnhancedCardHasher();
const cryptoMonitor = new CryptoMonitor();
const auditLogger = new AuditLogger({ enableConsole: true });

// ============================================================================
// Game Constants
// ============================================================================

const CARD_SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ============================================================================
// Card and Deck Classes
// ============================================================================

class Card {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }

    getNumericValue() {
        const values = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11 };
        return values[this.rank] || parseInt(this.rank);
    }

    toString() {
        return `${this.rank} of ${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.initializeDeck();
    }

    initializeDeck() {
        this.cards = [];
        for (const suit of CARD_SUITS) {
            for (const rank of CARD_RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
    }

    /**
     * Verifiable shuffle using distributed randomness seed
     * This ensures the shuffle is deterministic and can be verified by all players
     */
    shuffleWithSeed(seed) {
        const shuffler = new VerifiableShuffle();
        const indices = shuffler.shuffle(this.cards.length, seed);
        
        // Reorder cards based on shuffled indices
        const shuffledCards = indices.map(i => this.cards[i]);
        this.cards = shuffledCards;
        
        return {
            seed,
            permutation: indices,
            verifiable: true
        };
    }

    dealCard() {
        return this.cards.shift();
    }
}

// ============================================================================
// Game State Management
// ============================================================================

/**
 * SecureMatch - A match that uses both GamerStake SDK and indian-poker security
 */
class SecureMatch {
    constructor(matchId) {
        this.id = matchId;
        this.players = new Map(); // playerId -> { socket, username, card, score }
        this.deck = new Deck();
        this.started = false;
        this.finished = false;
        
        // Security components
        this.distributedRandomness = new DistributedRandomness();
        this.gameSecret = null;
        this.shuffleProof = null;
        this.deckCommitment = null;
        
        // Audit trail
        this.auditTrail = [];
    }

    addPlayer(playerId, username, socket) {
        this.players.set(playerId, {
            socket,
            username,
            card: null,
            score: 0,
            randomnessCommitment: null,
            randomnessSeed: null
        });
        
        this.logAudit('PLAYER_JOINED', { playerId, username });
    }

    /**
     * Phase 1: Collect randomness commitments from all players
     * Each player commits to a random seed without revealing it
     */
    collectRandomnessCommitment(playerId, commitment) {
        const result = this.distributedRandomness.commitPlayerSeed(playerId, commitment);
        if (result.success) {
            const player = this.players.get(playerId);
            if (player) {
                player.randomnessCommitment = commitment;
            }
            this.logAudit('RANDOMNESS_COMMITMENT', { playerId, commitment: commitment.substring(0, 16) + '...' });
        }
        return result;
    }

    /**
     * Phase 2: Reveal randomness seeds after all commitments collected
     */
    revealRandomnessSeed(playerId, seed) {
        const result = this.distributedRandomness.revealPlayerSeed(playerId, seed);
        if (result.success) {
            const player = this.players.get(playerId);
            if (player) {
                player.randomnessSeed = seed;
            }
            this.logAudit('RANDOMNESS_REVEAL', { playerId });
        }
        return result;
    }

    /**
     * Phase 3: Generate final shuffle seed and shuffle deck
     */
    finalizeRandomnessAndShuffle() {
        // Complete commitment phase if not already done
        if (!this.distributedRandomness.commitmentPhaseComplete) {
            this.distributedRandomness.completeCommitmentPhase();
        }

        // Generate final seed from all player contributions
        const seedResult = this.distributedRandomness.generateShuffleSeed();
        if (!seedResult.success) {
            return { success: false, error: seedResult.error };
        }

        // Derive game secret for card hashing
        const playerSeeds = Array.from(this.players.values())
            .map(p => p.randomnessSeed)
            .filter(s => s);
        this.gameSecret = cardHasher.deriveGameSecret(this.id, playerSeeds);

        // Perform verifiable shuffle
        this.shuffleProof = this.deck.shuffleWithSeed(seedResult.finalSeed);

        // Create deck commitment
        this.deckCommitment = this.createDeckCommitment();

        this.logAudit('DECK_SHUFFLED', {
            seed: seedResult.finalSeed.substring(0, 16) + '...',
            commitment: this.deckCommitment.substring(0, 16) + '...'
        });

        return {
            success: true,
            shuffleProof: this.shuffleProof,
            deckCommitment: this.deckCommitment,
            timestamp: seedResult.timestamp
        };
    }

    /**
     * Create cryptographic commitment to deck order
     */
    createDeckCommitment() {
        const nonce = NonceGenerator.generate();
        const deckData = this.deck.cards.map((card, i) => 
            `${i}:${card.rank}:${card.suit}`
        ).join('|');
        
        const commitment = crypto.createHash('sha256')
            .update(`${this.id}:${nonce}:${deckData}`)
            .digest('hex');
        
        this.deckNonce = nonce;
        return commitment;
    }

    /**
     * Deal cards to players with hash verification
     */
    dealCards() {
        let position = 0;
        for (const [playerId, player] of this.players) {
            const card = this.deck.dealCard();
            player.card = card;
            player.cardPosition = position;
            player.cardHash = cardHasher.hashCard(card, this.id, position);
            
            this.logAudit('CARD_DEALT', {
                playerId,
                position,
                cardHash: player.cardHash.substring(0, 16) + '...'
            });
            
            position++;
        }
    }

    /**
     * Determine winner based on card values
     * In this simple game, highest card wins
     */
    determineWinner() {
        let highestValue = -1;
        let winners = [];

        for (const [playerId, player] of this.players) {
            const value = player.card.getNumericValue();
            if (value > highestValue) {
                highestValue = value;
                winners = [playerId];
            } else if (value === highestValue) {
                winners.push(playerId);
            }
        }

        // Set scores
        for (const [playerId, player] of this.players) {
            player.score = winners.includes(playerId) ? 1 : 0;
        }

        this.logAudit('WINNER_DETERMINED', { winners, highestValue });

        return winners;
    }

    /**
     * Get verification data for players to verify fairness
     */
    getVerificationData() {
        return {
            matchId: this.id,
            shuffleProof: this.shuffleProof,
            deckCommitment: this.deckCommitment,
            deckNonce: this.deckNonce,
            randomnessTranscript: this.distributedRandomness.getTranscriptData(),
            cards: Array.from(this.players.entries()).map(([playerId, player]) => ({
                playerId,
                card: player.card.toString(),
                position: player.cardPosition,
                hash: player.cardHash
            }))
        };
    }

    logAudit(event, details) {
        const entry = {
            timestamp: new Date().toISOString(),
            matchId: this.id,
            event,
            details
        };
        this.auditTrail.push(entry);
        auditLogger.logGame(event, { matchId: this.id, ...details });
    }
}

// Active matches storage
const activeMatches = new Map();

// ============================================================================
// Express & Socket.IO Setup
// ============================================================================

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' },
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        sdk: gameSDK.isInitialized(),
        activeMatches: activeMatches.size,
        security: {
            rateLimiter: 'active',
            cryptoMonitor: 'active',
            auditLogger: 'active'
        }
    });
});

// Security stats endpoint
app.get('/security/stats', (req, res) => {
    res.json({
        cryptoMonitor: cryptoMonitor.getStatistics(),
        rateLimiter: 'operational'
    });
});

// ============================================================================
// Socket Event Handlers
// ============================================================================

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    auditLogger.logConnection('SOCKET_CONNECTED', { socketId: socket.id });

    let currentPlayer = null;
    let currentMatchId = null;

    // -------------------------------------------------------------------------
    // Event: authenticate
    // Player sends their JWT token and match ID
    // -------------------------------------------------------------------------
    socket.on('authenticate', async (data) => {
        try {
            const { token, matchId } = data;

            console.log(`Authenticating player for match ${matchId}...`);

            // In production, validate with GamerStake platform
            // For POC, we'll simulate authentication
            let playerIdentity;
            
            if (ENVIRONMENT === 'development' && !GAMERSTAKE_API_KEY.startsWith('gs_')) {
                // Simulate authentication for development
                playerIdentity = {
                    id: `player_${uuidv4().substring(0, 8)}`,
                    username: `Player_${Math.floor(Math.random() * 1000)}`
                };
                console.log(`[DEV] Simulated auth: ${playerIdentity.username}`);
            } else {
                // Real authentication with GamerStake
                playerIdentity = await gameSDK.validatePlayerToken(token);
            }

            console.log(`Player authenticated: ${playerIdentity.username} (${playerIdentity.id})`);

            // Check rate limits
            const rateCheck = rateLimiter.checkLimit(playerIdentity.id, 'proofGeneration');
            if (!rateCheck.allowed) {
                socket.emit('auth_error', { message: 'Rate limit exceeded. Please try again later.' });
                auditLogger.logRateLimitExceeded(playerIdentity.id, 'authentication');
                return;
            }

            // Get or create match
            let match = activeMatches.get(matchId);
            if (!match) {
                match = new SecureMatch(matchId);
                activeMatches.set(matchId, match);
            }

            // Add player to match
            match.addPlayer(playerIdentity.id, playerIdentity.username, socket);
            currentPlayer = { id: playerIdentity.id, username: playerIdentity.username };
            currentMatchId = matchId;

            // Notify player of successful authentication
            socket.emit('authenticated', {
                playerId: playerIdentity.id,
                username: playerIdentity.username,
                matchId: matchId,
                securityFeatures: [
                    'distributed_randomness',
                    'verifiable_shuffle',
                    'card_commitment',
                    'audit_logging'
                ]
            });

            // Report player join to GamerStake platform (in production)
            if (ENVIRONMENT !== 'development' || GAMERSTAKE_API_KEY.startsWith('gs_')) {
                await gameSDK.reportPlayerJoin(matchId, playerIdentity.id);
            }

            // Check if we can start the match (need 2 players for this game)
            if (match.players.size === 2 && !match.started) {
                await startSecureMatch(match);
            }

        } catch (error) {
            console.error('Authentication failed:', error.message);
            socket.emit('auth_error', { message: error.message });
            socket.disconnect();
        }
    });

    // -------------------------------------------------------------------------
    // Event: commit_randomness
    // Player commits to their random seed (Phase 1 of distributed randomness)
    // -------------------------------------------------------------------------
    socket.on('commit_randomness', (data) => {
        try {
            if (!currentPlayer || !currentMatchId) {
                throw new Error('Not authenticated');
            }

            const match = activeMatches.get(currentMatchId);
            if (!match) {
                throw new Error('Match not found');
            }

            const result = match.collectRandomnessCommitment(currentPlayer.id, data.commitment);
            
            if (result.success) {
                socket.emit('commitment_accepted', { playerId: currentPlayer.id });
                
                // Notify other players
                match.players.forEach((player, playerId) => {
                    if (playerId !== currentPlayer.id) {
                        player.socket.emit('player_committed', { playerId: currentPlayer.id });
                    }
                });

                // Check if all players have committed
                if (match.distributedRandomness.playerCommitments.size === match.players.size) {
                    // Move to reveal phase
                    match.distributedRandomness.completeCommitmentPhase();
                    io.to(currentMatchId).emit('reveal_phase', {
                        message: 'All players committed. Please reveal your seeds.',
                        timestampCommitment: match.distributedRandomness.getTimestampCommitment()
                    });
                }
            } else {
                socket.emit('commitment_error', { error: result.error });
            }

        } catch (error) {
            console.error('Commitment error:', error.message);
            socket.emit('game_error', { message: error.message });
        }
    });

    // -------------------------------------------------------------------------
    // Event: reveal_randomness
    // Player reveals their random seed (Phase 2 of distributed randomness)
    // -------------------------------------------------------------------------
    socket.on('reveal_randomness', (data) => {
        try {
            if (!currentPlayer || !currentMatchId) {
                throw new Error('Not authenticated');
            }

            const match = activeMatches.get(currentMatchId);
            if (!match) {
                throw new Error('Match not found');
            }

            const result = match.revealRandomnessSeed(currentPlayer.id, data.seed);
            
            if (result.success) {
                socket.emit('reveal_accepted', { playerId: currentPlayer.id });
                
                // Check if all players have revealed
                if (match.distributedRandomness.playerReveals.size === match.players.size) {
                    // Finalize randomness and shuffle deck
                    const shuffleResult = match.finalizeRandomnessAndShuffle();
                    
                    if (shuffleResult.success) {
                        // Deal cards and determine winner
                        match.dealCards();
                        const winners = match.determineWinner();
                        
                        // Send results to all players
                        finishSecureMatch(match, winners);
                    } else {
                        io.to(currentMatchId).emit('game_error', { 
                            message: 'Failed to finalize randomness',
                            error: shuffleResult.error 
                        });
                    }
                }
            } else {
                socket.emit('reveal_error', { error: result.error });
            }

        } catch (error) {
            console.error('Reveal error:', error.message);
            socket.emit('game_error', { message: error.message });
        }
    });

    // -------------------------------------------------------------------------
    // Event: get_verification
    // Player requests verification data to verify fairness
    // -------------------------------------------------------------------------
    socket.on('get_verification', () => {
        try {
            if (!currentMatchId) {
                throw new Error('Not in a match');
            }

            const match = activeMatches.get(currentMatchId);
            if (!match || !match.finished) {
                throw new Error('Match not finished');
            }

            socket.emit('verification_data', match.getVerificationData());

        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    // -------------------------------------------------------------------------
    // Event: disconnect
    // -------------------------------------------------------------------------
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        auditLogger.logConnection('SOCKET_DISCONNECTED', { socketId: socket.id });

        if (currentMatchId && currentPlayer) {
            const match = activeMatches.get(currentMatchId);
            if (match && !match.finished) {
                handleMatchError(currentMatchId, `Player ${currentPlayer.username} disconnected`);
            }
        }
    });
});

// ============================================================================
// Game Logic Functions
// ============================================================================

async function startSecureMatch(match) {
    try {
        console.log(`Starting secure match ${match.id}...`);

        // Report match start to GamerStake platform (in production)
        if (ENVIRONMENT !== 'development' || GAMERSTAKE_API_KEY.startsWith('gs_')) {
            await gameSDK.reportMatchStart(match.id);
        }

        match.started = true;

        // Notify all players to start randomness commitment phase
        match.players.forEach((player) => {
            player.socket.emit('match_started', {
                matchId: match.id,
                players: Array.from(match.players.entries()).map(([id, p]) => ({
                    id,
                    username: p.username
                })),
                phase: 'commitment',
                instructions: 'Generate a random seed and send its SHA-256 hash as commitment'
            });
        });

        console.log(`Match ${match.id} started with ${match.players.size} players`);
        
    } catch (error) {
        console.error('Failed to start match:', error.message);
        await handleMatchError(match.id, `Failed to start: ${error.message}`);
    }
}

async function finishSecureMatch(match, winners) {
    try {
        console.log(`Finishing match ${match.id}...`);

        match.finished = true;

        // Prepare scores for GamerStake
        const scores = {};
        match.players.forEach((player, playerId) => {
            scores[playerId] = player.score;
        });

        // Report result to GamerStake platform (in production)
        if (ENVIRONMENT !== 'development' || GAMERSTAKE_API_KEY.startsWith('gs_')) {
            await gameSDK.reportMatchResult(match.id, {
                players: Array.from(match.players.entries()).map(([id, player]) => ({
                    id: parseInt(id) || id,
                    score: player.score,
                    isWinner: winners.includes(id)
                }))
            });
        }

        // Notify all players of the result
        match.players.forEach((player, playerId) => {
            player.socket.emit('match_ended', {
                matchId: match.id,
                yourCard: player.card.toString(),
                yourCardHash: player.cardHash,
                winners: winners,
                won: winners.includes(playerId),
                allCards: Array.from(match.players.entries()).map(([id, p]) => ({
                    playerId: id,
                    username: p.username,
                    card: p.card.toString(),
                    value: p.card.getNumericValue()
                })),
                verificationAvailable: true,
                securityProof: {
                    shuffleSeed: match.shuffleProof?.seed?.substring(0, 16) + '...',
                    deckCommitment: match.deckCommitment?.substring(0, 16) + '...',
                    message: 'Request verification data to verify fairness'
                }
            });
        });

        console.log(`Match ${match.id} completed. Winners: ${winners.join(', ')}`);

        // Clean up after delay
        setTimeout(() => {
            activeMatches.delete(match.id);
            cardHasher.cleanupGame(match.id);
        }, 60000); // Keep for 1 minute for verification requests

    } catch (error) {
        console.error('Failed to finish match:', error.message);
    }
}

async function handleMatchError(matchId, reason) {
    try {
        console.log(`Match ${matchId} error: ${reason}`);

        // Report error to GamerStake platform (will refund all wagers)
        if (ENVIRONMENT !== 'development' || GAMERSTAKE_API_KEY.startsWith('gs_')) {
            await gameSDK.reportMatchError(matchId, reason);
        }

        const match = activeMatches.get(matchId);
        if (match) {
            match.finished = true;

            // Notify all players
            match.players.forEach((player) => {
                player.socket.emit('match_error', {
                    message: reason,
                    refunded: true
                });
            });

            // Clean up
            activeMatches.delete(matchId);
            cardHasher.cleanupGame(matchId);
        }

    } catch (error) {
        console.error('Failed to report match error:', error.message);
    }
}

// ============================================================================
// Start Server
// ============================================================================

httpServer.listen(PORT, () => {
    console.log(`
====================================================
  GamerStake + Indian Poker Security POC Server
====================================================
  Port: ${PORT}
  Environment: ${ENVIRONMENT}
  GamerStake SDK: ${gameSDK.isInitialized() ? 'Initialized' : 'Not initialized'}
  
  Security Features:
  - Distributed Randomness (commit-reveal)
  - Verifiable Shuffle
  - Card Commitment & Hashing
  - Rate Limiting
  - Crypto Monitoring
  - Audit Logging
  
  Endpoints:
  - GET /health - Health check
  - GET /security/stats - Security statistics
  - WebSocket - Game connections
====================================================
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, io, SecureMatch };
