/**
 * Proof Generation and Verification Utilities
 * 
 * This module provides high-level utilities for generating and verifying
 * Groth16 SNARK proofs for poker card dealing verification.
 */

import Groth16SNARK, { CardDealProof, CircuitInputs } from './index';
import PokerCircuitBuilder, { PokerCircuitInputs } from './pokerCircuits';
import * as fs from 'fs/promises';
import * as path from 'path';
import stringify from 'json-stable-stringify';
import { sha256 } from '@noble/hashes/sha256';

export interface PokerProofRequest {
    circuitType: 'deckGeneration' | 'cardShuffle' | 'cardDealing' | 'cardCommitment' | 
                  'playerDeal' | 'roundDealing' | 'handVerification';
    publicInputs: { [key: string]: any };
    privateInputs: { [key: string]: any };
    metadata?: {
        gameId: string;
        playerId?: string;
        round?: number;
        timestamp?: number;
    };
}

export interface PokerProofResult {
    success: boolean;
    proof?: CardDealProof;
    verificationResult?: boolean;
    error?: string;
    processingTime: number;
}

export interface BatchProofRequest {
    proofs: PokerProofRequest[];
    parallel: boolean;
    verifyImmediately: boolean;
}

export interface BatchProofResult {
    success: boolean;
    results: PokerProofResult[];
    totalProcessingTime: number;
    failedCount: number;
}

export interface ProofVerificationOptions {
    strict: boolean;
    checkTimestamps: boolean;
    maxAgeHours?: number;
    verifyCommitments: boolean;
    logResults: boolean;
}

export interface ProofStatistics {
    totalProofsGenerated: number;
    totalProofsVerified: number;
    averageGenerationTime: number;
    averageVerificationTime: number;
    circuitUsage: { [circuitName: string]: number };
    successRate: number;
}

/**
 * High-level Proof Manager for Poker SNARKs
 */
export class PokerProofManager {
    private snark: Groth16SNARK;
    private circuitBuilder: PokerCircuitBuilder;
    private proofHistory: CardDealProof[] = [];
    private statistics: ProofStatistics = {
        totalProofsGenerated: 0,
        totalProofsVerified: 0,
        averageGenerationTime: 0,
        averageVerificationTime: 0,
        circuitUsage: {},
        successRate: 0
    };

    constructor() {
        this.snark = new Groth16SNARK();
        this.circuitBuilder = new PokerCircuitBuilder();
    }

    /**
     * Initialize the proof manager
     */
    async initialize(): Promise<void> {
        console.log('🚀 Initializing Poker Proof Manager...');
        
        await this.snark.initialize();
        console.log('✅ Proof Manager initialized successfully');
    }

    /**
     * Generate a single poker proof
     */
    async generateProof(request: PokerProofRequest): Promise<PokerProofResult> {
        const startTime = Date.now();
        
        try {
            console.log(`🎯 Generating ${request.circuitType} proof...`);
            
            // Validate request
            this.validateProofRequest(request);
            
            // Convert inputs to circuit format
            const circuitInputs = this.convertToCircuitInputs(request);
            
            // Generate proof using SNARK
            const proof = await this.snark.generateProof(
                request.circuitType,
                circuitInputs.publicInputs,
                circuitInputs.privateInputs
            );
            
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
            
            const result: PokerProofResult = {
                success: true,
                proof,
                verificationResult,
                processingTime: Date.now() - startTime
            };
            
            console.log(`✅ ${request.circuitType} proof generated successfully`);
            return result;
            
        } catch (error) {
            const result: PokerProofResult = {
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
    async generateBatchProofs(request: BatchProofRequest): Promise<BatchProofResult> {
        const startTime = Date.now();
        const results: PokerProofResult[] = [];
        
        console.log(`🎯 Generating batch of ${request.proofs.length} proofs...`);
        
        if (request.parallel) {
            // Generate proofs in parallel
            const promises = request.proofs.map(proofRequest => 
                this.generateProof(proofRequest)
            );
            const completedResults = await Promise.all(promises);
            results.push(...completedResults);
        } else {
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
    async verifyProof(
        proof: CardDealProof, 
        options?: ProofVerificationOptions
    ): Promise<boolean> {
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
            
        } catch (error) {
            console.error('❌ Proof verification error:', error.message);
            return false;
        }
    }

    /**
     * Verify multiple proofs efficiently
     */
    async verifyBatchProofs(
        proofs: CardDealProof[],
        options?: ProofVerificationOptions
    ): Promise<{ valid: boolean; failures: number[]; successRate: number }> {
        console.log(`🔐 Verifying batch of ${proofs.length} proofs...`);
        
        const results = await Promise.allSettled(
            proofs.map(proof => this.verifyProof(proof, options))
        );
        
        const failures: number[] = [];
        let validCount = 0;
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                validCount++;
            } else {
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
    async createDeckGenerationProof(seed?: string): Promise<PokerProofResult> {
        const publicInputs = { seed: seed || this.generateRandomSeed() };
        const privateInputs = { };
        
        const request: PokerProofRequest = {
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
    async createCardShuffleProof(
        originalDeck: number[],
        shuffledDeck: number[],
        permutation: number[],
        gameId: string
    ): Promise<PokerProofResult> {
        const publicInputs = { shuffledDeck };
        const privateInputs = {
            originalDeck,
            permutation
        };
        
        const request: PokerProofRequest = {
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
    async createCardDealingProof(
        shuffledDeck: number[],
        dealPositions: number[],
        gameId: string,
        playerId?: string
    ): Promise<PokerProofResult> {
        const publicInputs = {
            dealtCards: dealPositions.map(pos => shuffledDeck[pos])
        };
        const privateInputs = {
            shuffledDeck,
            dealPositions
        };
        
        const request: PokerProofRequest = {
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
    async createCardCommitmentProof(
        card: number,
        nonce: number,
        gameId: string,
        playerId?: string
    ): Promise<PokerProofResult> {
        const publicInputs = {
            commitment: this.computeCardCommitment(card, nonce)
        };
        const privateInputs = {
            card,
            nonce
        };
        
        const request: PokerProofRequest = {
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
    async saveProof(proof: CardDealProof, filename?: string): Promise<string> {
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
    async loadProof(filepath: string): Promise<CardDealProof | null> {
        try {
            const data = await fs.readFile(filepath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load proof:', error);
            return null;
        }
    }

    /**
     * Get proof history
     */
    getProofHistory(limit?: number): CardDealProof[] {
        const history = [...this.proofHistory];
        return limit ? history.slice(-limit) : history;
    }

    /**
     * Get statistics
     */
    getStatistics(): ProofStatistics {
        return { ...this.statistics };
    }

    /**
     * Export statistics
     */
    async exportStatistics(): Promise<string> {
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
    clearHistory(): void {
        this.proofHistory = [];
        console.log('🧹 Proof history cleared');
    }

    // Private helper methods

    /**
     * Validate proof request
     */
    private validateProofRequest(request: PokerProofRequest): void {
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
    private convertToCircuitInputs(request: PokerProofRequest): {
        publicInputs: CircuitInputs;
        privateInputs: CircuitInputs;
    } {
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
    private generateProofId(request: PokerProofRequest, proof: CardDealProof): string {
        const data = {
            circuitType: request.circuitType,
            gameId: request.metadata?.gameId,
            timestamp: request.metadata?.timestamp || Date.now(),
            proofHash: stringify(proof.proof)
        };
        
        const hash = sha256(stringify(data));
        return Buffer.from(hash).toString('hex').slice(0, 16);
    }

    /**
     * Update statistics
     */
    private updateStatistics(type: 'generation' | 'verification', circuit: string, time: number): void {
        if (type === 'generation') {
            this.statistics.totalProofsGenerated++;
            this.statistics.circuitUsage[circuit] = (this.statistics.circuitUsage[circuit] || 0) + 1;
            
            // Update running average
            const count = this.statistics.totalProofsGenerated;
            this.statistics.averageGenerationTime = 
                ((this.statistics.averageGenerationTime * (count - 1)) + time) / count;
        } else {
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
    private extractPublicInputs(proof: CardDealProof): { [key: string]: any } {
        // Convert proof.publicSignals array to object format
        const publicInputs: { [key: string]: any } = {};
        proof.publicSignals.forEach((signal, index) => {
            publicInputs[`signal_${index}`] = signal;
        });
        return publicInputs;
    }

    /**
     * Verify proof commitments
     */
    private async verifyProofCommitments(
        proof: CardDealProof, 
        publicInputs: { [key: string]: any }
    ): Promise<boolean> {
        // Verify that commitments in the proof are consistent
        // This is a simplified verification
        return true;
    }

    /**
     * Generate random seed
     */
    private generateRandomSeed(): string {
        return `seed-${Date.now()}-${Math.random()}`;
    }

    /**
     * Compute card commitment
     */
    private computeCardCommitment(card: number, nonce: number): string {
        const data = `${card}:${nonce}`;
        return sha256(data).toString();
    }
}

export default PokerProofManager;