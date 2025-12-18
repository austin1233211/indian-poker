"use strict";
/**
 * Poker Circuit Definitions for Groth16 SNARK
 *
 * This module defines the specific circuits needed to verify fair poker
 * card dealing using zero-knowledge proofs.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerCircuitBuilder = void 0;
const circomlibjs_1 = require("circomlibjs");
const crypto = __importStar(require("crypto"));
/**
 * Poker Circuit Builder
 */
class PokerCircuitBuilder {
    constructor() {
        this.circuits = new Map();
        this.poseidon = (0, circomlibjs_1.buildPoseidon)();
        this.initializeCircuits();
    }
    /**
     * Initialize all poker circuits
     */
    initializeCircuits() {
        this.registerCircuit(this.createDeckGenerationCircuit());
        this.registerCircuit(this.createCardShuffleCircuit());
        this.registerCircuit(this.createCardDealingCircuit());
        this.registerCircuit(this.createCardCommitmentCircuit());
        this.registerCircuit(this.createPlayerDealCircuit());
        this.registerCircuit(this.createRoundDealingCircuit());
        this.registerCircuit(this.createHandVerificationCircuit());
    }
    /**
     * Register a circuit configuration
     */
    registerCircuit(circuit) {
        this.circuits.set(circuit.name, circuit);
    }
    /**
     * Deck Generation Circuit
     *
     * Verifies that a fresh 52-card deck was generated correctly
     */
    createDeckGenerationCircuit() {
        return {
            name: 'deckGeneration',
            description: 'Verify proper generation of a 52-card deck',
            nInputs: 0,
            nOutputs: 52,
            constraints: [
                {
                    type: 'range',
                    description: 'All suits are valid (0-3)',
                    validate: (witness) => {
                        for (const signal of Object.keys(witness.signals)) {
                            if (signal.startsWith('suit_')) {
                                const suit = witness.signals[signal];
                                if (suit < 0 || suit > 3)
                                    return false;
                            }
                        }
                        return true;
                    }
                },
                {
                    type: 'range',
                    description: 'All ranks are valid (2-14)',
                    validate: (witness) => {
                        for (const signal of Object.keys(witness.signals)) {
                            if (signal.startsWith('rank_')) {
                                const rank = witness.signals[signal];
                                if (rank < 2 || rank > 14)
                                    return false;
                            }
                        }
                        return true;
                    }
                },
                {
                    type: 'permutation',
                    description: 'No duplicate cards in deck',
                    validate: (witness) => {
                        return this.validateDeckUniqueness(witness.signals);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateDeckGenerationWitness(inputs);
                }
            }
        };
    }
    /**
     * Card Shuffle Circuit
     *
     * Verifies that a deck was properly shuffled using a valid permutation
     */
    createCardShuffleCircuit() {
        return {
            name: 'cardShuffle',
            description: 'Verify fair shuffling of card deck',
            nInputs: 52,
            nOutputs: 52,
            constraints: [
                {
                    type: 'permutation',
                    description: 'Shuffle is a valid permutation',
                    validate: (witness) => {
                        return this.validatePermutation(witness.signals.permutation);
                    }
                },
                {
                    type: 'commitment',
                    description: 'Shuffle commitments are valid',
                    validate: (witness) => {
                        return this.validateShuffleCommitments(witness);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateShuffleWitness(inputs);
                }
            }
        };
    }
    /**
     * Card Dealing Circuit
     *
     * Verifies that cards were dealt from the correct positions
     * in the shuffled deck following poker rules
     */
    createCardDealingCircuit() {
        return {
            name: 'cardDealing',
            description: 'Verify proper dealing of cards to players',
            nInputs: 52,
            nOutputs: 7,
            constraints: [
                {
                    type: 'range',
                    description: 'Dealing positions are within deck bounds',
                    validate: (witness) => {
                        const positions = witness.signals.dealPositions || [];
                        return positions.every((pos) => pos >= 0 && pos < 52);
                    }
                },
                {
                    type: 'equality',
                    description: 'Dealt cards match deck positions',
                    validate: (witness) => {
                        return this.validateDealtCards(witness);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateDealingWitness(inputs);
                }
            }
        };
    }
    /**
     * Card Commitment Circuit
     *
     * Creates commitments to cards without revealing their values
     */
    createCardCommitmentCircuit() {
        return {
            name: 'cardCommitment',
            description: 'Create commitment to card without revealing it',
            nInputs: 1,
            nOutputs: 1,
            constraints: [
                {
                    type: 'commitment',
                    description: 'Commitment is properly computed',
                    validate: (witness) => {
                        return this.validateCardCommitment(witness);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateCardCommitmentWitness(inputs);
                }
            }
        };
    }
    /**
     * Player Deal Circuit
     *
     * Verifies that specific cards were dealt to specific players
     */
    createPlayerDealCircuit() {
        return {
            name: 'playerDeal',
            description: 'Verify cards dealt to specific players',
            nInputs: 2, // Two hole cards per player
            nOutputs: 2,
            constraints: [
                {
                    type: 'equality',
                    description: 'Player receives correct cards',
                    validate: (witness) => {
                        return this.validatePlayerDealing(witness);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generatePlayerDealWitness(inputs);
                }
            }
        };
    }
    /**
     * Round Dealing Circuit
     *
     * Verifies dealing for an entire round (flop, turn, river)
     */
    createRoundDealingCircuit() {
        return {
            name: 'roundDealing',
            description: 'Verify dealing for betting rounds',
            nInputs: 5, // 5 community cards
            nOutputs: 5,
            constraints: [
                {
                    type: 'permutation',
                    description: 'Community cards are from correct deck positions',
                    validate: (witness) => {
                        return this.validateCommunityCards(witness);
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateRoundDealingWitness(inputs);
                }
            }
        };
    }
    /**
     * Hand Verification Circuit
     *
     * Verifies hand strength calculation without revealing cards
     */
    createHandVerificationCircuit() {
        return {
            name: 'handVerification',
            description: 'Verify hand strength calculation',
            nInputs: 7, // 2 hole cards + 5 community cards
            nOutputs: 1, // Hand strength score
            constraints: [
                {
                    type: 'range',
                    description: 'Hand strength is valid (0-7462 for 7-card combinations)',
                    validate: (witness) => {
                        const strength = witness.signals.handStrength;
                        return strength >= 0 && strength <= 7462;
                    }
                }
            ],
            witnessGenerator: {
                generate: async (inputs) => {
                    return this.generateHandVerificationWitness(inputs);
                }
            }
        };
    }
    /**
     * Generate witness for deck generation
     */
    async generateDeckGenerationWitness(inputs) {
        const { publicInputs, privateInputs, metadata } = inputs;
        const seed = metadata?.seed || this.generateRandomSeed();
        // Generate fresh deck
        const deck = this.generateFreshDeck(seed);
        const signals = {};
        const commitments = {};
        // Create signals for each card
        for (let i = 0; i < 52; i++) {
            const suit = Math.floor(deck[i] / 13);
            const rank = (deck[i] % 13) + 2;
            signals[`suit_${i}`] = suit;
            signals[`rank_${i}`] = rank;
            // Create commitment for each card
            commitments[`card_${i}`] = this.poseidon([suit, rank, seed, i]);
        }
        return {
            signals,
            commitments,
            proofs: {
                deckHash: this.poseidon([seed, ...Object.values(signals)]),
                seedCommitment: this.poseidon([seed])
            }
        };
    }
    /**
     * Generate witness for card shuffling
     */
    async generateShuffleWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { originalDeck, shuffledDeck, permutation } = privateInputs;
        const signals = {
            permutation,
            intermediateStates: this.calculateIntermediateStates(originalDeck, permutation)
        };
        const commitments = {};
        for (let i = 0; i < 52; i++) {
            commitments[`shuffled_${i}`] = this.poseidon([
                shuffledDeck[i],
                permutation[i],
                i
            ]);
        }
        return {
            signals,
            commitments
        };
    }
    /**
     * Generate witness for card dealing
     */
    async generateDealingWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { shuffledDeck, dealPositions, players } = privateInputs;
        const signals = {
            dealPositions,
            players
        };
        const commitments = {};
        dealPositions.forEach((pos, index) => {
            const card = shuffledDeck[pos];
            commitments[`dealt_${index}`] = this.poseidon([card, pos, index]);
        });
        return {
            signals,
            commitments
        };
    }
    /**
     * Generate witness for card commitment
     */
    async generateCardCommitmentWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { card, nonce } = privateInputs;
        const signals = {
            card,
            nonce,
            commitment: this.poseidon([card, nonce])
        };
        return {
            signals,
            commitments: {
                cardCommitment: signals.commitment
            }
        };
    }
    /**
     * Generate witness for player deal verification
     */
    async generatePlayerDealWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { playerCards, expectedCards } = privateInputs;
        const signals = {
            playerCards,
            expectedCards
        };
        return {
            signals,
            commitments: {
                dealProof: this.poseidon([...playerCards, ...expectedCards])
            }
        };
    }
    /**
     * Generate witness for round dealing verification
     */
    async generateRoundDealingWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { communityCards, dealOrder } = privateInputs;
        const signals = {
            communityCards,
            dealOrder
        };
        const commitments = {};
        communityCards.forEach((card, index) => {
            commitments[`community_${index}`] = this.poseidon([card, index]);
        });
        return {
            signals,
            commitments
        };
    }
    /**
     * Generate witness for hand verification
     */
    async generateHandVerificationWitness(inputs) {
        const { publicInputs, privateInputs } = inputs;
        const { holeCards, communityCards } = privateInputs;
        const allCards = [...holeCards, ...communityCards];
        const handStrength = this.calculateHandStrength(allCards);
        const signals = {
            handStrength,
            holeCards,
            communityCards
        };
        return {
            signals,
            commitments: {
                handHash: this.poseidon([handStrength, ...allCards])
            }
        };
    }
    // Helper methods
    /**
     * Validate deck uniqueness
     */
    validateDeckUniqueness(signals) {
        const cards = new Set();
        for (let i = 0; i < 52; i++) {
            const suit = signals[`suit_${i}`];
            const rank = signals[`rank_${i}`];
            const card = suit * 13 + (rank - 2);
            if (cards.has(card))
                return false;
            cards.add(card);
        }
        return cards.size === 52;
    }
    /**
     * Validate permutation
     */
    validatePermutation(permutation) {
        if (permutation.length !== 52)
            return false;
        const seen = new Set();
        for (const p of permutation) {
            if (p < 0 || p >= 52 || seen.has(p))
                return false;
            seen.add(p);
        }
        return seen.size === 52;
    }
    /**
     * Validate shuffle commitments
     */
    validateShuffleCommitments(witness) {
        // Verify that shuffle commitments are properly computed
        return true; // Simplified for demo
    }
    /**
     * Validate dealt cards
     */
    validateDealtCards(witness) {
        // Verify that dealt cards match deck positions
        return true; // Simplified for demo
    }
    /**
     * Validate card commitment
     */
    validateCardCommitment(witness) {
        const { signals } = witness;
        const expectedCommitment = this.poseidon([signals.card, signals.nonce]);
        return signals.commitment === expectedCommitment;
    }
    /**
     * Validate player dealing
     */
    validatePlayerDealing(witness) {
        // Verify that player receives correct cards
        return true; // Simplified for demo
    }
    /**
     * Validate community cards
     */
    validateCommunityCards(witness) {
        // Verify community cards are from correct positions
        return true; // Simplified for demo
    }
    /**
     * Calculate intermediate states during shuffle
     */
    calculateIntermediateStates(deck, permutation) {
        const states = [];
        // Simplified: just return original deck
        return [deck];
    }
    /**
     * Generate fresh deck
     */
    generateFreshDeck(seed) {
        const deck = Array.from({ length: 52 }, (_, i) => i);
        return this.shuffleArray(deck, seed);
    }
    /**
     * Shuffle array with seed
     */
    shuffleArray(array, seed) {
        const result = [...array];
        const random = this.seededRandom(seed);
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    /**
     * Generate seeded random number
     */
    seededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return () => {
            hash = (hash * 1664525 + 1013904223) % 4294967296;
            return hash / 4294967296;
        };
    }
    /**
     * Generate random seed
     */
    generateRandomSeed() {
        const randomBytes = crypto.randomBytes(16);
        return `seed-${Date.now()}-${randomBytes.toString('hex')}`;
    }
    /**
     * Calculate hand strength (simplified)
     */
    calculateHandStrength(cards) {
        // Simplified hand strength calculation based on card values
        // In reality, this would evaluate poker hands properly
        // Using deterministic calculation based on cards instead of random
        let strength = 0;
        for (const card of cards) {
            strength = (strength * 31 + card) % 7463;
        }
        return strength;
    }
    /**
     * Get all registered circuits
     */
    getCircuits() {
        return this.circuits;
    }
    /**
     * Get specific circuit
     */
    getCircuit(name) {
        return this.circuits.get(name);
    }
}
exports.PokerCircuitBuilder = PokerCircuitBuilder;
exports.default = PokerCircuitBuilder;
//# sourceMappingURL=pokerCircuits.js.map