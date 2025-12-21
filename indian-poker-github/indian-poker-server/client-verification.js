/**
 * Client-Side Verification Library for Indian Poker
 * 
 * This module provides cryptographic verification utilities that allow clients
 * to independently verify game fairness without trusting the server.
 * 
 * SECURITY FEATURES:
 * - Deck commitment verification (verify server committed to deck before dealing)
 * - Distributed randomness verification (verify final seed from player contributions)
 * - Timestamp commitment verification (verify server committed timestamp before reveals)
 * - Shuffle verification (verify deterministic shuffle from seed)
 * - SNARK proof verification (verify zero-knowledge proofs of shuffle/dealing)
 * - Checkpoint verification (verify game state integrity)
 * 
 * USAGE:
 * This file can be used in both Node.js and browser environments.
 * For browsers, use a bundler like webpack or include crypto-js for SHA-256.
 */

'use strict';

// Detect environment and use appropriate crypto
const isNode = typeof window === 'undefined' && typeof process !== 'undefined';

let cryptoModule;
if (isNode) {
    cryptoModule = require('crypto');
}

/**
 * SHA-256 hash function that works in both Node.js and browser
 * @param {string} data - Data to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
async function sha256(data) {
    if (isNode) {
        return cryptoModule.createHash('sha256').update(data).digest('hex');
    } else {
        // Browser environment using Web Crypto API
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}

/**
 * Synchronous SHA-256 for Node.js (for deterministic shuffle verification)
 * @param {string} data - Data to hash
 * @returns {string} Hex-encoded hash
 */
function sha256Sync(data) {
    if (isNode) {
        return cryptoModule.createHash('sha256').update(data).digest('hex');
    } else {
        throw new Error('Synchronous SHA-256 not available in browser. Use async version.');
    }
}

/**
 * Client-side verification class for Indian Poker games
 */
class IndianPokerVerifier {
    constructor() {
        this.deckCommitment = null;
        this.timestampCommitment = null;
        this.playerCommitments = new Map();
        this.playerReveals = new Map();
        this.checkpoints = [];
        this.gameId = null;
        this.verificationResults = [];
    }

    /**
     * Store deck commitment received at game start
     * @param {string} commitment - The deck commitment hash
     * @param {string} gameId - The game ID
     */
    setDeckCommitment(commitment, gameId) {
        this.deckCommitment = commitment;
        this.gameId = gameId;
        this.verificationResults.push({
            type: 'deck_commitment_received',
            timestamp: Date.now(),
            commitment: commitment,
            gameId: gameId
        });
    }

    /**
     * Store timestamp commitment received before reveal phase
     * SECURITY: This prevents server timestamp grinding attacks
     * @param {string} timestampCommitment - Hash of the timestamp
     */
    setTimestampCommitment(timestampCommitment) {
        this.timestampCommitment = timestampCommitment;
        this.verificationResults.push({
            type: 'timestamp_commitment_received',
            timestamp: Date.now(),
            timestampCommitment: timestampCommitment
        });
    }

    /**
     * Store a player's randomness commitment
     * @param {string} playerId - Player ID
     * @param {string} commitment - Hash of player's seed
     */
    addPlayerCommitment(playerId, commitment) {
        this.playerCommitments.set(playerId, commitment);
        this.verificationResults.push({
            type: 'player_commitment_received',
            timestamp: Date.now(),
            playerId: playerId,
            commitment: commitment
        });
    }

    /**
     * Store a player's revealed seed
     * @param {string} playerId - Player ID
     * @param {string} reveal - The revealed seed
     */
    addPlayerReveal(playerId, reveal) {
        this.playerReveals.set(playerId, reveal);
        this.verificationResults.push({
            type: 'player_reveal_received',
            timestamp: Date.now(),
            playerId: playerId
        });
    }

    /**
     * Verify deck commitment matches revealed deck
     * @param {Array} revealedDeck - Array of card objects {suit, rank}
     * @param {string} nonce - Cryptographic nonce used in commitment
     * @param {string} [commitment] - Optional commitment to verify against (uses stored if not provided)
     * @returns {Promise<object>} Verification result
     */
    async verifyDeckCommitment(revealedDeck, nonce, commitment = null) {
        const targetCommitment = commitment || this.deckCommitment;
        
        if (!targetCommitment) {
            return { 
                valid: false, 
                error: 'No deck commitment stored or provided',
                critical: true
            };
        }

        // Serialize deck in canonical format (must match server's format)
        const serializedDeck = revealedDeck.map(card => 
            `${card.suit}:${card.rank}`
        ).join('|');
        
        const dataToHash = serializedDeck + ':' + nonce;
        const computedHash = await sha256(dataToHash);
        
        const result = {
            valid: computedHash === targetCommitment,
            computedHash: computedHash,
            expectedHash: targetCommitment,
            deckSize: revealedDeck.length
        };

        this.verificationResults.push({
            type: 'deck_commitment_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Verify that each player's reveal matches their commitment
     * @returns {Promise<object>} Verification result with details for each player
     */
    async verifyPlayerCommitments() {
        const results = {
            valid: true,
            playerResults: {},
            errors: []
        };

        for (const [playerId, commitment] of this.playerCommitments) {
            const reveal = this.playerReveals.get(playerId);
            
            if (!reveal) {
                results.valid = false;
                results.playerResults[playerId] = { 
                    valid: false, 
                    error: 'No reveal received' 
                };
                results.errors.push(`Player ${playerId}: No reveal received`);
                continue;
            }

            const computedCommitment = await sha256(reveal);
            const isValid = computedCommitment === commitment;
            
            results.playerResults[playerId] = {
                valid: isValid,
                computedCommitment: computedCommitment,
                expectedCommitment: commitment
            };

            if (!isValid) {
                results.valid = false;
                results.errors.push(`Player ${playerId}: Commitment mismatch`);
            }
        }

        this.verificationResults.push({
            type: 'player_commitments_verification',
            timestamp: Date.now(),
            result: results
        });

        return results;
    }

    /**
     * Verify the timestamp commitment (prevents server grinding)
     * @param {string} revealedTimestamp - The revealed timestamp
     * @param {string} [commitment] - Optional commitment to verify against
     * @returns {Promise<object>} Verification result
     */
    async verifyTimestampCommitment(revealedTimestamp, commitment = null) {
        const targetCommitment = commitment || this.timestampCommitment;
        
        if (!targetCommitment) {
            return {
                valid: false,
                error: 'No timestamp commitment stored or provided',
                securityNote: 'Timestamp commitment is required to prevent server grinding attacks'
            };
        }

        const computedCommitment = await sha256(revealedTimestamp);
        const isValid = computedCommitment === targetCommitment;

        const result = {
            valid: isValid,
            computedCommitment: computedCommitment,
            expectedCommitment: targetCommitment,
            timestamp: revealedTimestamp,
            securityNote: isValid 
                ? 'Timestamp was committed before reveals - server could not grind timestamps'
                : 'SECURITY ALERT: Timestamp commitment mismatch - possible manipulation'
        };

        this.verificationResults.push({
            type: 'timestamp_commitment_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Verify the final shuffle seed was correctly derived from player contributions
     * @param {string} finalSeed - The final seed used for shuffling
     * @param {string} timestamp - The timestamp included in seed generation
     * @returns {Promise<object>} Verification result
     */
    async verifyFinalSeed(finalSeed, timestamp) {
        // First verify all player commitments
        const commitmentResult = await this.verifyPlayerCommitments();
        if (!commitmentResult.valid) {
            return {
                valid: false,
                error: 'Player commitment verification failed',
                commitmentResult: commitmentResult
            };
        }

        // Sort reveals by player ID for deterministic ordering (must match server)
        const sortedReveals = Array.from(this.playerReveals.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => entry[1]);

        // Compute expected final seed: H(seed_1 || seed_2 || ... || seed_n || timestamp)
        const combined = sortedReveals.join('||') + '||' + timestamp;
        const computedSeed = await sha256(combined);

        const result = {
            valid: computedSeed === finalSeed,
            computedSeed: computedSeed,
            expectedSeed: finalSeed,
            contributorCount: sortedReveals.length,
            timestamp: timestamp
        };

        this.verificationResults.push({
            type: 'final_seed_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Verify deterministic shuffle using Fisher-Yates with rejection sampling
     * @param {Array} originalDeck - Original deck before shuffle
     * @param {Array} shuffledDeck - Deck after shuffle
     * @param {string} seed - Seed used for shuffle
     * @returns {object} Verification result
     */
    verifyShuffle(originalDeck, shuffledDeck, seed) {
        if (!isNode) {
            return {
                valid: null,
                error: 'Shuffle verification requires Node.js environment for synchronous crypto',
                suggestion: 'Use verifyShuffleAsync for browser environments'
            };
        }

        const deck = [...originalDeck];
        const n = deck.length;

        // Fisher-Yates shuffle with rejection sampling (must match server implementation)
        for (let i = n - 1; i > 0; i--) {
            const j = this._rejectionSampleIndex(seed, i, n);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        // Compare shuffled decks
        const isValid = this._compareDeck(deck, shuffledDeck);

        const result = {
            valid: isValid,
            originalSize: originalDeck.length,
            shuffledSize: shuffledDeck.length
        };

        this.verificationResults.push({
            type: 'shuffle_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Rejection sampling for unbiased index selection
     * @private
     */
    _rejectionSampleIndex(seed, i, n) {
        let attempt = 0;
        const maxAttempts = 100;

        while (attempt < maxAttempts) {
            const extendedSeed = sha256Sync(seed + ':' + i + ':' + attempt);
            const value = parseInt(extendedSeed.substring(0, 8), 16);
            const maxUnbiased = Math.floor(0xFFFFFFFF / (i + 1)) * (i + 1);
            
            if (value < maxUnbiased) {
                return value % (i + 1);
            }
            attempt++;
        }
        
        // Fallback (should rarely happen)
        return parseInt(sha256Sync(seed + ':' + i).substring(0, 8), 16) % (i + 1);
    }

    /**
     * Compare two decks for equality
     * @private
     */
    _compareDeck(deck1, deck2) {
        if (deck1.length !== deck2.length) return false;
        
        for (let i = 0; i < deck1.length; i++) {
            const card1 = deck1[i];
            const card2 = deck2[i];
            
            // Handle both object and string representations
            const suit1 = typeof card1 === 'object' ? card1.suit : card1.split(':')[0];
            const rank1 = typeof card1 === 'object' ? card1.rank : card1.split(':')[1];
            const suit2 = typeof card2 === 'object' ? card2.suit : card2.split(':')[0];
            const rank2 = typeof card2 === 'object' ? card2.rank : card2.split(':')[1];
            
            if (suit1 !== suit2 || rank1 !== rank2) return false;
        }
        
        return true;
    }

    /**
     * Verify card position matches committed deck order
     * @param {Array} revealedDeck - The revealed deck
     * @param {number} seatIndex - Player's seat index
     * @param {object} receivedCard - Card received by player {suit, rank}
     * @returns {object} Verification result
     */
    verifyCardPosition(revealedDeck, seatIndex, receivedCard) {
        if (seatIndex < 0 || seatIndex >= revealedDeck.length) {
            return {
                valid: false,
                error: `Invalid seat index: ${seatIndex}`,
                deckSize: revealedDeck.length
            };
        }

        const expectedCard = revealedDeck[seatIndex];
        const isValid = expectedCard.suit === receivedCard.suit && 
                       expectedCard.rank === receivedCard.rank;

        const result = {
            valid: isValid,
            expectedCard: expectedCard,
            receivedCard: receivedCard,
            seatIndex: seatIndex
        };

        this.verificationResults.push({
            type: 'card_position_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Verify dealing order was generated correctly from seed
     * @param {Array} dealingOrder - The dealing order used
     * @param {string} dealingSeed - Seed used to generate dealing order
     * @param {number} playerCount - Number of players
     * @returns {object} Verification result
     */
    verifyDealingOrder(dealingOrder, dealingSeed, playerCount) {
        const indices = Array.from({ length: playerCount }, (_, i) => i);
        
        // Reconstruct dealing order using same algorithm as server
        for (let i = indices.length - 1; i > 0; i--) {
            const seedPart = dealingSeed.substring((i * 4) % 60, (i * 4) % 60 + 4);
            const j = parseInt(seedPart, 16) % (i + 1);
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const isValid = JSON.stringify(indices) === JSON.stringify(dealingOrder);

        const result = {
            valid: isValid,
            computedOrder: indices,
            receivedOrder: dealingOrder,
            playerCount: playerCount
        };

        this.verificationResults.push({
            type: 'dealing_order_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Verify a SNARK proof (requires snarkjs library)
     * @param {object} proof - The SNARK proof
     * @param {Array} publicInputs - Public inputs to the circuit
     * @param {object} verificationKey - The verification key
     * @returns {Promise<object>} Verification result
     */
    async verifySNARKProof(proof, publicInputs, verificationKey) {
        // Check if snarkjs is available
        let snarkjs;
        if (isNode) {
            try {
                snarkjs = require('snarkjs');
            } catch (e) {
                return {
                    valid: null,
                    error: 'snarkjs not available. Install with: npm install snarkjs',
                    suggestion: 'SNARK verification requires the snarkjs library'
                };
            }
        } else if (typeof window !== 'undefined' && window.snarkjs) {
            snarkjs = window.snarkjs;
        } else {
            return {
                valid: null,
                error: 'snarkjs not available in browser',
                suggestion: 'Include snarkjs library in your HTML'
            };
        }

        try {
            const isValid = await snarkjs.groth16.verify(verificationKey, publicInputs, proof);
            
            const result = {
                valid: isValid,
                proofType: 'groth16',
                publicInputCount: publicInputs.length
            };

            this.verificationResults.push({
                type: 'snark_proof_verification',
                timestamp: Date.now(),
                result: result
            });

            return result;
        } catch (error) {
            return {
                valid: false,
                error: `SNARK verification failed: ${error.message}`
            };
        }
    }

    /**
     * Verify a checkpoint for game state integrity
     * @param {object} checkpoint - The checkpoint to verify
     * @param {object} currentState - Current game state
     * @returns {Promise<object>} Verification result
     */
    async verifyCheckpoint(checkpoint, currentState) {
        const stateToHash = {
            deckCommitment: currentState.deckCommitment,
            dealtCards: currentState.dealtCards,
            playerCount: currentState.playerCount,
            currentRound: currentState.currentRound
        };

        const computedHash = await sha256(JSON.stringify(stateToHash));
        
        const result = {
            valid: currentState.deckCommitment === checkpoint.state.deckCommitment,
            stateHashMatch: computedHash === checkpoint.stateHash,
            tampering: currentState.deckCommitment !== checkpoint.state.deckCommitment,
            checkpointId: checkpoint.id,
            checkpointTimestamp: checkpoint.timestamp
        };

        if (result.tampering) {
            result.securityAlert = 'CRITICAL: Deck commitment changed since checkpoint - possible tampering detected';
        }

        this.verificationResults.push({
            type: 'checkpoint_verification',
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    /**
     * Perform complete game verification
     * @param {object} gameEndData - Data received at game end
     * @returns {Promise<object>} Complete verification results
     */
    async verifyGame(gameEndData) {
        const results = {
            deckCommitment: { valid: false, checked: false },
            playerCommitments: { valid: false, checked: false },
            timestampCommitment: { valid: false, checked: false },
            finalSeed: { valid: false, checked: false },
            cardPosition: { valid: false, checked: false },
            dealingOrder: { valid: false, checked: false },
            snarkProofs: { valid: null, checked: false },
            overall: false,
            securityAlerts: []
        };

        // 1. Verify deck commitment
        if (gameEndData.deckReveal) {
            results.deckCommitment = await this.verifyDeckCommitment(
                gameEndData.deckReveal.deck,
                gameEndData.deckReveal.nonce
            );
            results.deckCommitment.checked = true;
        }

        // 2. Verify player commitments
        if (this.playerCommitments.size > 0) {
            results.playerCommitments = await this.verifyPlayerCommitments();
            results.playerCommitments.checked = true;
        }

        // 3. Verify timestamp commitment (prevents grinding)
        if (gameEndData.timestamp && this.timestampCommitment) {
            results.timestampCommitment = await this.verifyTimestampCommitment(
                gameEndData.timestamp
            );
            results.timestampCommitment.checked = true;
            
            if (!results.timestampCommitment.valid) {
                results.securityAlerts.push('Timestamp commitment verification failed - possible grinding attack');
            }
        }

        // 4. Verify final seed derivation
        if (gameEndData.finalSeed && gameEndData.timestamp && this.playerReveals.size > 0) {
            results.finalSeed = await this.verifyFinalSeed(
                gameEndData.finalSeed,
                gameEndData.timestamp
            );
            results.finalSeed.checked = true;
        }

        // 5. Verify card position
        if (gameEndData.yourCard && gameEndData.deckReveal && gameEndData.yourSeatIndex !== undefined) {
            results.cardPosition = this.verifyCardPosition(
                gameEndData.deckReveal.deck,
                gameEndData.yourSeatIndex,
                gameEndData.yourCard
            );
            results.cardPosition.checked = true;
        }

        // 6. Verify dealing order
        if (gameEndData.dealingOrder && gameEndData.dealingSeed && gameEndData.playerCount) {
            results.dealingOrder = this.verifyDealingOrder(
                gameEndData.dealingOrder,
                gameEndData.dealingSeed,
                gameEndData.playerCount
            );
            results.dealingOrder.checked = true;
        }

        // 7. Verify SNARK proofs if available
        if (gameEndData.proofs && gameEndData.verificationKey) {
            if (gameEndData.proofs.shuffle) {
                results.snarkProofs = await this.verifySNARKProof(
                    gameEndData.proofs.shuffle.proof,
                    gameEndData.proofs.shuffle.publicInputs,
                    gameEndData.verificationKey
                );
                results.snarkProofs.checked = true;
            }
        }

        // Calculate overall result
        const checkedResults = [
            results.deckCommitment,
            results.playerCommitments,
            results.timestampCommitment,
            results.finalSeed,
            results.cardPosition,
            results.dealingOrder
        ].filter(r => r.checked);

        results.overall = checkedResults.length > 0 && 
                         checkedResults.every(r => r.valid);

        // Add security alerts for any failures
        if (results.deckCommitment.checked && !results.deckCommitment.valid) {
            results.securityAlerts.push('Deck commitment verification failed');
        }
        if (results.playerCommitments.checked && !results.playerCommitments.valid) {
            results.securityAlerts.push('Player commitment verification failed');
        }
        if (results.finalSeed.checked && !results.finalSeed.valid) {
            results.securityAlerts.push('Final seed verification failed');
        }

        return results;
    }

    /**
     * Get all verification results for audit purposes
     * @returns {Array} All verification results
     */
    getVerificationLog() {
        return [...this.verificationResults];
    }

    /**
     * Export verification results as JSON for external audit
     * @returns {string} JSON string of verification results
     */
    exportVerificationLog() {
        return JSON.stringify({
            gameId: this.gameId,
            verificationResults: this.verificationResults,
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Reset verifier for new game
     */
    reset() {
        this.deckCommitment = null;
        this.timestampCommitment = null;
        this.playerCommitments = new Map();
        this.playerReveals = new Map();
        this.checkpoints = [];
        this.gameId = null;
        this.verificationResults = [];
    }
}

/**
 * Utility function to create a commitment for client-side randomness contribution
 * @param {string} seed - Random seed (should be cryptographically random)
 * @returns {Promise<object>} Object containing seed and commitment
 */
async function createRandomnessCommitment(seed) {
    if (!seed) {
        // Generate random seed if not provided
        if (isNode) {
            seed = cryptoModule.randomBytes(32).toString('hex');
        } else {
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            seed = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
        }
    }

    const commitment = await sha256(seed);
    
    return {
        seed: seed,
        commitment: commitment,
        warning: 'Keep seed secret until reveal phase. Only share commitment initially.'
    };
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        IndianPokerVerifier,
        createRandomnessCommitment,
        sha256
    };
}

if (typeof window !== 'undefined') {
    window.IndianPokerVerifier = IndianPokerVerifier;
    window.createRandomnessCommitment = createRandomnessCommitment;
    window.sha256 = sha256;
}
