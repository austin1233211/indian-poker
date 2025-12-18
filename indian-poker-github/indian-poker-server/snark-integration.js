/**
 * SNARK Integration Module for Indian Poker Server
 * 
 * This module integrates the Groth16 SNARK proof system with the game server
 * to provide verifiable fairness for card shuffling and dealing.
 * 
 * PR 2: Real Groth16 Proofs
 * - Added support for real circuit artifacts (.wasm, .zkey files)
 * - CircuitLoader automatically loads compiled circuits from build/
 * - Real proof generation and verification using snarkjs
 */

const path = require('path');

// Import the compiled SNARK modules
let PokerProofManager;
let Groth16SNARK;
let CircuitLoader;

try {
    const proofManagerModule = require('../groth16-snark/dist/proofManager');
    const snarkModule = require('../groth16-snark/dist/index');
    const circuitLoaderModule = require('../groth16-snark/dist/circuitLoader');
    PokerProofManager = proofManagerModule.PokerProofManager || proofManagerModule.default;
    Groth16SNARK = snarkModule.Groth16SNARK || snarkModule.default;
    CircuitLoader = circuitLoaderModule.CircuitLoader || circuitLoaderModule.default;
} catch (error) {
    console.warn('SNARK modules not available:', error.message);
    console.warn('Running without SNARK proof generation');
}

/**
 * SNARK-enabled game verifier for Indian Poker
 */
class SNARKGameVerifier {
    constructor() {
        this.proofManager = null;
        this.snark = null;
        this.circuitLoader = null;
        this.initialized = false;
        this.realCircuitsReady = false;
        this.proofHistory = new Map(); // gameId -> proofs
    }

    /**
     * Initialize the SNARK system
     */
    async initialize() {
        if (!PokerProofManager || !Groth16SNARK) {
            console.log('SNARK modules not available - running in non-verified mode');
            return false;
        }

        try {
            console.log('Initializing SNARK verification system...');
            this.proofManager = new PokerProofManager();
            
            // Initialize with real circuits enabled
            const buildDir = path.join(__dirname, '..', 'groth16-snark', 'build');
            this.snark = new Groth16SNARK({ useRealCircuits: true, buildDir });
            
            await this.proofManager.initialize();
            await this.snark.initialize();
            
            // Check if real circuits are ready
            this.realCircuitsReady = this.snark.isRealCircuitsReady();
            
            this.initialized = true;
            console.log('SNARK verification system initialized successfully');
            console.log(`Real circuits: ${this.realCircuitsReady ? 'READY' : 'NOT AVAILABLE (using simulated proofs)'}`);
            return true;
        } catch (error) {
            console.error('Failed to initialize SNARK system:', error.message);
            this.initialized = false;
            return false;
        }
    }

    /**
     * Check if real circuits are available for cryptographic proofs
     */
    isRealCircuitsReady() {
        return this.realCircuitsReady;
    }

    /**
     * Check if SNARK verification is available
     */
    isAvailable() {
        return this.initialized && this.proofManager !== null;
    }

    /**
     * Generate proof for deck generation
     * @param {string} gameId - Unique game identifier
     * @param {string} seed - Optional seed for deck generation
     */
    async generateDeckProof(gameId, seed = null) {
        if (!this.isAvailable()) {
            return { success: false, reason: 'SNARK not initialized' };
        }

        try {
            const effectiveSeed = seed || `game-${gameId}-${Date.now()}`;
            const result = await this.proofManager.createDeckGenerationProof(effectiveSeed);
            
            if (result.success) {
                this.storeProof(gameId, 'deckGeneration', result.proof);
            }
            
            return {
                success: result.success,
                proof: result.proof,
                processingTime: result.processingTime,
                error: result.error
            };
        } catch (error) {
            console.error('Deck proof generation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate proof for card shuffling
     * @param {string} gameId - Unique game identifier
     * @param {number[]} originalDeck - Original deck as array of card indices (0-51)
     * @param {number[]} shuffledDeck - Shuffled deck as array of card indices
     * @param {number[]} permutation - Permutation array mapping original to shuffled positions
     */
    async generateShuffleProof(gameId, originalDeck, shuffledDeck, permutation) {
        if (!this.isAvailable()) {
            return { success: false, reason: 'SNARK not initialized' };
        }

        try {
            const result = await this.proofManager.createCardShuffleProof(
                originalDeck,
                shuffledDeck,
                permutation,
                gameId
            );
            
            if (result.success) {
                this.storeProof(gameId, 'cardShuffle', result.proof);
            }
            
            return {
                success: result.success,
                proof: result.proof,
                processingTime: result.processingTime,
                error: result.error
            };
        } catch (error) {
            console.error('Shuffle proof generation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate proof for card dealing
     * @param {string} gameId - Unique game identifier
     * @param {number[]} shuffledDeck - Shuffled deck as array of card indices
     * @param {number[]} dealPositions - Positions in deck from which cards are dealt
     * @param {string} playerId - Optional player ID for player-specific deals
     */
    async generateDealingProof(gameId, shuffledDeck, dealPositions, playerId = null) {
        if (!this.isAvailable()) {
            return { success: false, reason: 'SNARK not initialized' };
        }

        try {
            const result = await this.proofManager.createCardDealingProof(
                shuffledDeck,
                dealPositions,
                gameId,
                playerId
            );
            
            if (result.success) {
                const proofType = playerId ? `cardDealing-${playerId}` : 'cardDealing';
                this.storeProof(gameId, proofType, result.proof);
            }
            
            return {
                success: result.success,
                proof: result.proof,
                processingTime: result.processingTime,
                error: result.error
            };
        } catch (error) {
            console.error('Dealing proof generation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate proof for card commitment (privacy-preserving)
     * @param {string} gameId - Unique game identifier
     * @param {number} cardIndex - Card index (0-51)
     * @param {number} nonce - Random nonce for commitment
     * @param {string} playerId - Player ID
     */
    async generateCommitmentProof(gameId, cardIndex, nonce, playerId) {
        if (!this.isAvailable()) {
            return { success: false, reason: 'SNARK not initialized' };
        }

        try {
            const result = await this.proofManager.createCardCommitmentProof(
                cardIndex,
                nonce,
                gameId,
                playerId
            );
            
            if (result.success) {
                this.storeProof(gameId, `commitment-${playerId}`, result.proof);
            }
            
            return {
                success: result.success,
                proof: result.proof,
                processingTime: result.processingTime,
                error: result.error
            };
        } catch (error) {
            console.error('Commitment proof generation failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify a proof
     * @param {object} proof - The proof to verify
     */
    async verifyProof(proof) {
        if (!this.isAvailable()) {
            return { success: false, reason: 'SNARK not initialized' };
        }

        try {
            const isValid = await this.proofManager.verifyProof(proof);
            return { success: true, valid: isValid };
        } catch (error) {
            console.error('Proof verification failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all proofs for a game
     * @param {string} gameId - Game identifier
     */
    getGameProofs(gameId) {
        return this.proofHistory.get(gameId) || {};
    }

    /**
     * Store a proof in history
     */
    storeProof(gameId, proofType, proof) {
        if (!this.proofHistory.has(gameId)) {
            this.proofHistory.set(gameId, {});
        }
        this.proofHistory.get(gameId)[proofType] = {
            proof,
            timestamp: Date.now()
        };
    }

    /**
     * Clear proofs for a game
     * @param {string} gameId - Game identifier
     */
    clearGameProofs(gameId) {
        this.proofHistory.delete(gameId);
    }

    /**
     * Get statistics
     */
    getStatistics() {
        if (!this.isAvailable()) {
            return { available: false };
        }
        
        return {
            available: true,
            realCircuitsReady: this.realCircuitsReady,
            proofManagerStats: this.proofManager.getStatistics(),
            snarkStats: this.snark ? this.snark.getStatistics() : null,
            gamesWithProofs: this.proofHistory.size
        };
    }
}

/**
 * Convert Card objects to numeric indices (0-51)
 * Card index = suit_index * 13 + rank_index
 * Suits: Hearts=0, Diamonds=1, Clubs=2, Spades=3
 * Ranks: A=0, 2=1, 3=2, ..., 10=9, J=10, Q=11, K=12
 */
function cardToIndex(card) {
    const suitOrder = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    const suitIndex = suitOrder.indexOf(card.suit);
    const rankIndex = rankOrder.indexOf(card.rank);
    
    if (suitIndex === -1 || rankIndex === -1) {
        throw new Error(`Invalid card: ${card.rank} of ${card.suit}`);
    }
    
    return suitIndex * 13 + rankIndex;
}

/**
 * Convert numeric index (0-51) back to card representation
 */
function indexToCard(index) {
    const suitOrder = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    const suitIndex = Math.floor(index / 13);
    const rankIndex = index % 13;
    
    return {
        suit: suitOrder[suitIndex],
        rank: rankOrder[rankIndex]
    };
}

/**
 * Calculate permutation array from original and shuffled decks
 * permutation[i] = position in original deck of card now at position i in shuffled deck
 */
function calculatePermutation(originalDeck, shuffledDeck) {
    const permutation = [];
    for (const card of shuffledDeck) {
        const originalIndex = originalDeck.findIndex(c => 
            c.rank === card.rank && c.suit === card.suit
        );
        permutation.push(originalIndex);
    }
    return permutation;
}

/**
 * Convert deck of Card objects to array of indices
 */
function deckToIndices(deck) {
    return deck.map(card => cardToIndex(card));
}

// Create singleton instance
const snarkVerifier = new SNARKGameVerifier();

module.exports = {
    SNARKGameVerifier,
    snarkVerifier,
    cardToIndex,
    indexToCard,
    calculatePermutation,
    deckToIndices
};
