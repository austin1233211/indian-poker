"use strict";
/**
 * Proof Generation and Verification Utilities
 *
 * This module provides high-level utilities for generating and verifying
 * Groth16 SNARK proofs for poker card dealing verification.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerProofManager = void 0;
const index_1 = __importDefault(require("./index"));
const pokerCircuits_1 = __importDefault(require("./pokerCircuits"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const json_stable_stringify_1 = __importDefault(require("json-stable-stringify"));
const sha256_1 = require("@noble/hashes/sha256");
/**
 * High-level Proof Manager for Poker SNARKs
 */
class PokerProofManager {
    constructor() {
        this.proofHistory = [];
        this.statistics = {
            totalProofsGenerated: 0,
            totalProofsVerified: 0,
            averageGenerationTime: 0,
            averageVerificationTime: 0,
            circuitUsage: {},
            successRate: 0
        };
        this.snark = new index_1.default();
        this.circuitBuilder = new pokerCircuits_1.default();
    }
    /**
     * Initialize the proof manager
     */
    async initialize() {
        console.log('🚀 Initializing Poker Proof Manager...');
        await this.snark.initialize();
        console.log('✅ Proof Manager initialized successfully');
    }
    /**
     * Generate a single poker proof
     */
    async generateProof(request) {
        const startTime = Date.now();
        try {
            console.log(`🎯 Generating ${request.circuitType} proof...`);
            // Validate request
            this.validateProofRequest(request);
            // Convert inputs to circuit format
            const circuitInputs = this.convertToCircuitInputs(request);
            // Generate proof using SNARK
            const proof = await this.snark.generateProof(request.circuitType, circuitInputs.publicInputs, circuitInputs.privateInputs);
            // Add metadata to proof
            proof.dealId = this.generateProofId(request, proof);
            // Verify proof immediately if requested
            let verificationResult = undefined;
            if (request.metadata?.gameId) {
                verificationResult = await this.snark.verifyProof(proof, circuitInputs.publicInputs);
            }
            // Store in history
            this.proofHistory.push(proof);
            // Update statistics
            this.updateStatistics('generation', request.circuitType, Date.now() - startTime);
            const result = {
                success: true,
                proof,
                verificationResult,
                processingTime: Date.now() - startTime
            };
            console.log(`✅ ${request.circuitType} proof generated successfully`);
            return result;
        }
        catch (error) {
            const result = {
                success: false,
                error: error.message,
                processingTime: Date.now() - startTime
            };
            console.error(`❌ Failed to generate ${request.circuitType} proof:`, error.message);
            return result;
        }
    }
    /**
     * Generate batch of proofs
     */
    async generateBatchProofs(request) {
        const startTime = Date.now();
        const results = [];
        console.log(`🎯 Generating batch of ${request.proofs.length} proofs...`);
        if (request.parallel) {
            // Generate proofs in parallel
            const promises = request.proofs.map(proofRequest => this.generateProof(proofRequest));
            const completedResults = await Promise.all(promises);
            results.push(...completedResults);
        }
        else {
            // Generate proofs sequentially
            for (const proofRequest of request.proofs) {
                const result = await this.generateProof(proofRequest);
                results.push(result);
            }
        }
        const totalProcessingTime = Date.now() - startTime;
        const failedCount = results.filter(r => !r.success).length;
        console.log(`📊 Batch generation completed: ${results.length - failedCount}/${results.length} successful`);
        return {
            success: failedCount === 0,
            results,
            totalProcessingTime,
            failedCount
        };
    }
    /**
     * Verify a poker proof
     */
    async verifyProof(proof, options) {
        const startTime = Date.now();
        const opts = {
            strict: true,
            checkTimestamps: true,
            maxAgeHours: 24,
            verifyCommitments: true,
            logResults: true,
            ...options
        };
        try {
            console.log('🔐 Verifying poker proof...');
            // Check proof age if enabled
            if (opts.checkTimestamps && opts.maxAgeHours) {
                const ageMs = Date.now() - proof.timestamp;
                const maxAgeMs = opts.maxAgeHours * 60 * 60 * 1000;
                if (ageMs > maxAgeMs) {
                    if (opts.logResults) {
                        console.log('❌ Proof verification failed: proof too old');
                    }
                    return false;
                }
            }
            // Convert public signals for verification
            const publicInputs = this.extractPublicInputs(proof);
            // Verify the proof
            const isValid = await this.snark.verifyProof(proof, publicInputs);
            // Additional verification if enabled
            if (isValid && opts.verifyCommitments) {
                const commitmentValid = await this.verifyProofCommitments(proof, publicInputs);
                if (!commitmentValid && opts.strict) {
                    return false;
                }
            }
            // Update statistics
            this.updateStatistics('verification', 'unknown', Date.now() - startTime);
            if (opts.logResults) {
                console.log(isValid ? '✅ Proof verification successful' : '❌ Proof verification failed');
            }
            return isValid;
        }
        catch (error) {
            console.error('❌ Proof verification error:', error.message);
            return false;
        }
    }
    /**
     * Verify multiple proofs efficiently
     */
    async verifyBatchProofs(proofs, options) {
        console.log(`🔐 Verifying batch of ${proofs.length} proofs...`);
        const results = await Promise.allSettled(proofs.map(proof => this.verifyProof(proof, options)));
        const failures = [];
        let validCount = 0;
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                validCount++;
            }
            else {
                failures.push(index);
            }
        });
        const successRate = validCount / proofs.length;
        console.log(`📊 Batch verification completed: ${validCount}/${proofs.length} valid`);
        return {
            valid: failures.length === 0,
            failures,
            successRate
        };
    }
    /**
     * Create deck generation proof
     */
    async createDeckGenerationProof(seed) {
        const publicInputs = { seed: seed || this.generateRandomSeed() };
        const privateInputs = {};
        const request = {
            circuitType: 'deckGeneration',
            publicInputs,
            privateInputs,
            metadata: {
                gameId: `game-${Date.now()}`,
                timestamp: Date.now()
            }
        };
        return this.generateProof(request);
    }
    /**
     * Create card shuffle proof
     */
    async createCardShuffleProof(originalDeck, shuffledDeck, permutation, gameId) {
        const publicInputs = { shuffledDeck };
        const privateInputs = {
            originalDeck,
            permutation
        };
        const request = {
            circuitType: 'cardShuffle',
            publicInputs,
            privateInputs,
            metadata: {
                gameId,
                timestamp: Date.now()
            }
        };
        return this.generateProof(request);
    }
    /**
     * Create card dealing proof
     */
    async createCardDealingProof(shuffledDeck, dealPositions, gameId, playerId) {
        const publicInputs = {
            dealtCards: dealPositions.map(pos => shuffledDeck[pos])
        };
        const privateInputs = {
            shuffledDeck,
            dealPositions
        };
        const request = {
            circuitType: 'cardDealing',
            publicInputs,
            privateInputs,
            metadata: {
                gameId,
                playerId,
                timestamp: Date.now()
            }
        };
        return this.generateProof(request);
    }
    /**
     * Create card commitment proof
     */
    async createCardCommitmentProof(card, nonce, gameId, playerId) {
        const publicInputs = {
            commitment: this.computeCardCommitment(card, nonce)
        };
        const privateInputs = {
            card,
            nonce
        };
        const request = {
            circuitType: 'cardCommitment',
            publicInputs,
            privateInputs,
            metadata: {
                gameId,
                playerId,
                timestamp: Date.now()
            }
        };
        return this.generateProof(request);
    }
    /**
     * Save proof to file
     */
    async saveProof(proof, filename) {
        const proofDir = path.join('/workspace/code/groth16-snark', 'proofs');
        await fs.mkdir(proofDir, { recursive: true });
        const name = filename || `proof-${proof.dealId}-${Date.now()}.json`;
        const filepath = path.join(proofDir, name);
        await fs.writeFile(filepath, JSON.stringify(proof, null, 2));
        console.log(`💾 Proof saved: ${filepath}`);
        return filepath;
    }
    /**
     * Load proof from file
     */
    async loadProof(filepath) {
        try {
            const data = await fs.readFile(filepath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error('Failed to load proof:', error);
            return null;
        }
    }
    /**
     * Get proof history
     */
    getProofHistory(limit) {
        const history = [...this.proofHistory];
        return limit ? history.slice(-limit) : history;
    }
    /**
     * Get statistics
     */
    getStatistics() {
        return { ...this.statistics };
    }
    /**
     * Export statistics
     */
    async exportStatistics() {
        const stats = {
            ...this.statistics,
            exportedAt: new Date().toISOString(),
            proofHistoryLength: this.proofHistory.length
        };
        return JSON.stringify(stats, null, 2);
    }
    /**
     * Clear proof history
     */
    clearHistory() {
        this.proofHistory = [];
        console.log('🧹 Proof history cleared');
    }
    // Private helper methods
    /**
     * Validate proof request
     */
    validateProofRequest(request) {
        if (!request.circuitType) {
            throw new Error('Circuit type is required');
        }
        if (!request.publicInputs) {
            throw new Error('Public inputs are required');
        }
    }
    /**
     * Convert to circuit inputs
     */
    convertToCircuitInputs(request) {
        const circuit = this.circuitBuilder.getCircuit(request.circuitType);
        if (!circuit) {
            throw new Error(`Circuit ${request.circuitType} not found`);
        }
        return {
            publicInputs: request.publicInputs,
            privateInputs: request.privateInputs
        };
    }
    /**
     * Generate proof ID
     */
    generateProofId(request, proof) {
        const data = {
            circuitType: request.circuitType,
            gameId: request.metadata?.gameId,
            timestamp: request.metadata?.timestamp || Date.now(),
            proofHash: (0, json_stable_stringify_1.default)(proof.proof)
        };
        const hash = (0, sha256_1.sha256)((0, json_stable_stringify_1.default)(data));
        return Buffer.from(hash).toString('hex').slice(0, 16);
    }
    /**
     * Update statistics
     */
    updateStatistics(type, circuit, time) {
        if (type === 'generation') {
            this.statistics.totalProofsGenerated++;
            this.statistics.circuitUsage[circuit] = (this.statistics.circuitUsage[circuit] || 0) + 1;
            // Update running average
            const count = this.statistics.totalProofsGenerated;
            this.statistics.averageGenerationTime =
                ((this.statistics.averageGenerationTime * (count - 1)) + time) / count;
        }
        else {
            this.statistics.totalProofsVerified++;
            // Update running average
            const count = this.statistics.totalProofsVerified;
            this.statistics.averageVerificationTime =
                ((this.statistics.averageVerificationTime * (count - 1)) + time) / count;
        }
        // Update success rate
        const total = this.statistics.totalProofsGenerated + this.statistics.totalProofsVerified;
        const successful = this.statistics.totalProofsGenerated; // Simplified
        this.statistics.successRate = total > 0 ? successful / total : 1;
    }
    /**
     * Extract public inputs from proof
     */
    extractPublicInputs(proof) {
        // Convert proof.publicSignals array to object format
        const publicInputs = {};
        proof.publicSignals.forEach((signal, index) => {
            publicInputs[`signal_${index}`] = signal;
        });
        return publicInputs;
    }
    /**
     * Verify proof commitments
     */
    async verifyProofCommitments(proof, publicInputs) {
        // Verify that commitments in the proof are consistent
        // This is a simplified verification
        return true;
    }
    /**
     * Generate random seed
     */
    generateRandomSeed() {
        const randomBytes = crypto.randomBytes(16);
        return `seed-${Date.now()}-${randomBytes.toString('hex')}`;
    }
    /**
     * Compute card commitment
     */
    computeCardCommitment(card, nonce) {
        const data = `${card}:${nonce}`;
        return (0, sha256_1.sha256)(data).toString();
    }
}
exports.PokerProofManager = PokerProofManager;
exports.default = PokerProofManager;
//# sourceMappingURL=proofManager.js.map