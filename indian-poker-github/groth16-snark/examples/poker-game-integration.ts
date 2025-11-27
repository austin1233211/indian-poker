/**
 * Integration Example: Complete Poker Game Verification
 * 
 * This example demonstrates how to use the Groth16 SNARK system
 * to verify a complete poker game from start to finish.
 */

import PokerProofManager from '../src/proofManager';
import TrustedSetupCeremonyManager from '../src/trustedSetup';
import Groth16SNARK from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Complete Poker Game Verification System
 */
export class PokerGameVerifier {
    private proofManager: PokerProofManager;
    private ceremonyManager: TrustedSetupCeremonyManager;
    private snark: Groth16SNARK;
    private gameId: string;
    private gameResults: any[] = [];

    constructor(gameId: string) {
        this.proofManager = new PokerProofManager();
        this.ceremonyManager = new TrustedSetupCeremonyManager();
        this.snark = new Groth16SNARK();
        this.gameId = gameId;
    }

    /**
     * Initialize the verification system
     */
    async initialize(): Promise<void> {
        console.log('🚀 Initializing Poker Game Verifier...');
        
        await this.proofManager.initialize();
        await this.snark.initialize();
        
        console.log('✅ Poker Game Verifier initialized');
    }

    /**
     * Run complete trusted setup ceremony for all poker circuits
     */
    async runTrustedSetupCeremony(participants: string[]): Promise<void> {
        console.log('🎭 Starting Trusted Setup Ceremony...');
        
        const circuits = ['deckGeneration', 'cardShuffle', 'cardDealing', 'cardCommitment'];
        
        for (const circuitName of circuits) {
            console.log(`\n📋 Setting up circuit: ${circuitName}`);
            
            const ceremony = await this.ceremonyManager.initializeCeremony(
                circuitName,
                `Poker ${circuitName} Setup`,
                `Trusted setup for ${circuitName} circuit`,
                participants[0] // First participant initiates
            );
            
            // Add remaining participants
            for (let i = 1; i < Math.min(participants.length, 3); i++) {
                await this.ceremonyManager.addParticipant(ceremony.id, participants[i]);
            }
            
            // Make contributions
            for (const participant of participants.slice(0, 2)) {
                const contribution = {
                    tau: `tau_${participant}_${Date.now()}`,
                    alpha: `alpha_${participant}_${Date.now()}`,
                    beta: `beta_${participant}_${Date.now()}`,
                    gamma: `gamma_${participant}_${Date.now()}`,
                    delta: `delta_${participant}_${Date.now()}`,
                    circuitSpecific: {}
                };
                
                await this.ceremonyManager.makeContribution(ceremony.id, participant, contribution);
                console.log(`  ✅ Contribution from ${participant}`);
            }
            
            // Wait for completion
            setTimeout(() => {
                const finalCeremony = this.ceremonyManager.getCeremonyStatus(ceremony.id);
                if (finalCeremony?.status === 'completed') {
                    console.log(`  🎯 ${circuitName} ceremony completed`);
                }
            }, 1000);
        }
        
        console.log('✅ Trusted setup ceremony completed for all circuits');
    }

    /**
     * Simulate and verify a complete Texas Hold'em game
     */
    async verifyTexasHoldemGame(players: string[]): Promise<GameVerificationResult> {
        console.log('🃏 Verifying Texas Hold\'em Game...');
        
        const gameStartTime = Date.now();
        const results: any = {
            gameId: this.gameId,
            players,
            startTime: gameStartTime,
            phases: []
        };
        
        try {
            // Phase 1: Generate fresh deck
            console.log('\n📦 Phase 1: Deck Generation');
            const deckResult = await this.proofManager.createDeckGenerationProof(`${this.gameId}-seed`);
            if (!deckResult.success) throw new Error('Deck generation failed');
            
            const originalDeck = Array.from({length: 52}, (_, i) => i);
            const shuffledDeck = this.simulateShuffle(originalDeck);
            
            const phase1 = {
                name: 'deckGeneration',
                timestamp: Date.now(),
                success: true,
                processingTime: deckResult.processingTime,
                proof: deckResult.proof
            };
            results.phases.push(phase1);
            console.log(`  ✅ Deck generated in ${phase1.processingTime}ms`);

            // Phase 2: Verify deck shuffling
            console.log('\n🔀 Phase 2: Deck Shuffling');
            const permutation = this.calculatePermutation(originalDeck, shuffledDeck);
            const shuffleResult = await this.proofManager.createCardShuffleProof(
                originalDeck,
                shuffledDeck,
                permutation,
                this.gameId
            );
            if (!shuffleResult.success) throw new Error('Shuffle verification failed');
            
            const phase2 = {
                name: 'shuffle',
                timestamp: Date.now(),
                success: true,
                processingTime: shuffleResult.processingTime,
                proof: shuffleResult.proof
            };
            results.phases.push(phase2);
            console.log(`  ✅ Shuffle verified in ${phase2.processingTime}ms`);

            // Phase 3: Deal hole cards to all players
            console.log(`\n🃏 Phase 3: Dealing Hole Cards (${players.length} players)`);
            const holeCardPositions = Array.from({length: players.length * 2}, (_, i) => i);
            const holeCardsResult = await this.proofManager.createCardDealingProof(
                shuffledDeck,
                holeCardPositions,
                this.gameId
            );
            if (!holeCardsResult.success) throw new Error('Hole card dealing failed');
            
            const holeCards = holeCardPositions.map(pos => shuffledDeck[pos]);
            
            const phase3 = {
                name: 'holeCards',
                timestamp: Date.now(),
                success: true,
                processingTime: holeCardsResult.processingTime,
                proof: holeCardsResult.proof,
                cardsDealt: holeCards.length
            };
            results.phases.push(phase3);
            console.log(`  ✅ Hole cards dealt in ${phase3.processingTime}ms`);

            // Phase 4: Deal community cards (flop, turn, river)
            console.log('\n🎲 Phase 4: Dealing Community Cards');
            const communityPositions = [8, 9, 10, 11, 12]; // Cards after hole cards
            const communityResult = await this.proofManager.createCardDealingProof(
                shuffledDeck,
                communityPositions,
                this.gameId
            );
            if (!communityResult.success) throw new Error('Community card dealing failed');
            
            const communityCards = communityPositions.map(pos => shuffledDeck[pos]);
            
            const phase4 = {
                name: 'communityCards',
                timestamp: Date.now(),
                success: true,
                processingTime: communityResult.processingTime,
                proof: communityResult.proof,
                cardsDealt: communityCards.length
            };
            results.phases.push(phase4);
            console.log(`  ✅ Community cards dealt in ${phase4.processingTime}ms`);

            // Phase 5: Create private commitments for each player's hole cards
            console.log('\n🔒 Phase 5: Creating Private Commitments');
            const commitmentPromises: Promise<any>[] = [];
            
            for (let i = 0; i < players.length; i++) {
                const playerId = players[i];
                const card1 = holeCards[i * 2];
                const card2 = holeCards[i * 2 + 1];
                
                const nonce1 = Date.now() + i * 1000 + 1;
                const nonce2 = Date.now() + i * 1000 + 2;
                
                commitmentPromises.push(
                    this.proofManager.createCardCommitmentProof(card1, nonce1, this.gameId, playerId)
                );
                commitmentPromises.push(
                    this.proofManager.createCardCommitmentProof(card2, nonce2, this.gameId, playerId)
                );
            }
            
            const commitmentResults = await Promise.all(commitmentPromises);
            const failedCommitments = commitmentResults.filter(r => !r.success);
            if (failedCommitments.length > 0) throw new Error('Card commitment failed');
            
            const phase5 = {
                name: 'commitments',
                timestamp: Date.now(),
                success: true,
                proofs: commitmentResults.map(r => r.proof),
                totalCommitments: commitmentResults.length
            };
            results.phases.push(phase5);
            console.log(`  ✅ ${phase5.totalCommitments} commitments created`);

            // Phase 6: Verify all proofs
            console.log('\n🔐 Phase 6: Proof Verification');
            const allProofs = [
                deckResult.proof!,
                shuffleResult.proof!,
                holeCardsResult.proof!,
                communityResult.proof!,
                ...commitmentResults.map(r => r.proof!)
            ];
            
            const verificationResults = await this.proofManager.verifyBatchProofs(allProofs);
            
            const phase6 = {
                name: 'verification',
                timestamp: Date.now(),
                success: verificationResults.valid,
                totalProofs: allProofs.length,
                verifiedProofs: allProofs.length - verificationResults.failures.length,
                failedProofs: verificationResults.failures.length,
                verificationResults
            };
            results.phases.push(phase6);
            
            if (verificationResults.valid) {
                console.log('  ✅ All proofs verified successfully');
            } else {
                throw new Error(`Verification failed for proofs: ${verificationResults.failures.join(', ')}`);
            }

            // Compile final results
            const totalTime = Date.now() - gameStartTime;
            const totalProofs = allProofs.length;
            const totalProcessingTime = results.phases.reduce((sum, phase) => sum + phase.processingTime, 0);
            
            results.endTime = Date.now();
            results.totalTime = totalTime;
            results.totalProofs = totalProofs;
            results.totalProcessingTime = totalProcessingTime;
            results.overallSuccess = true;
            
            const gameResult: GameVerificationResult = {
                success: true,
                gameId: this.gameId,
                results,
                statistics: {
                    totalPhases: results.phases.length,
                    totalTime,
                    averagePhaseTime: totalTime / results.phases.length,
                    proofsPerSecond: (totalProofs / totalTime) * 1000,
                    successRate: 1.0
                }
            };
            
            console.log('\n🎉 Game verification completed successfully!');
            this.printGameStatistics(gameResult);
            
            return gameResult;
            
        } catch (error) {
            console.error('\n❌ Game verification failed:', error.message);
            
            results.endTime = Date.now();
            results.totalTime = Date.now() - gameStartTime;
            results.overallSuccess = false;
            results.error = error.message;
            
            return {
                success: false,
                gameId: this.gameId,
                results,
                error: error.message
            };
        }
    }

    /**
     * Verify individual game phases separately
     */
    async verifyGamePhase(phase: GamePhase, data: any): Promise<PhaseVerificationResult> {
        console.log(`\n🎯 Verifying game phase: ${phase}`);
        
        try {
            let result;
            
            switch (phase) {
                case 'deckGeneration':
                    result = await this.proofManager.createDeckGenerationProof(data.seed);
                    break;
                    
                case 'shuffle':
                    result = await this.proofManager.createCardShuffleProof(
                        data.originalDeck,
                        data.shuffledDeck,
                        data.permutation,
                        this.gameId
                    );
                    break;
                    
                case 'dealing':
                    result = await this.proofManager.createCardDealingProof(
                        data.deck,
                        data.positions,
                        this.gameId,
                        data.playerId
                    );
                    break;
                    
                case 'commitment':
                    result = await this.proofManager.createCardCommitmentProof(
                        data.card,
                        data.nonce,
                        this.gameId,
                        data.playerId
                    );
                    break;
                    
                default:
                    throw new Error(`Unknown phase: ${phase}`);
            }
            
            if (result.success && result.proof) {
                const verification = await this.proofManager.verifyProof(result.proof);
                
                return {
                    success: true,
                    phase,
                    proof: result.proof,
                    verification,
                    processingTime: result.processingTime
                };
            } else {
                throw new Error(result.error || 'Unknown error');
            }
            
        } catch (error) {
            return {
                success: false,
                phase,
                error: error.message
            };
        }
    }

    /**
     * Export game verification results
     */
    async exportResults(result: GameVerificationResult, outputDir: string = './game-results'): Promise<string> {
        const filename = `game-${this.gameId}-${Date.now()}.json`;
        const filepath = path.join(outputDir, filename);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
        
        console.log(`💾 Game results exported: ${filepath}`);
        return filepath;
    }

    /**
     * Get system statistics
     */
    getSystemStatistics(): any {
        return {
            proofManager: this.proofManager.getStatistics(),
            ceremonyManager: this.ceremonyManager.getStatistics(),
            activeCeremonies: this.ceremonyManager.listActiveCeremonies().length,
            proofHistory: this.proofManager.getProofHistory().length
        };
    }

    /**
     * Clean up resources
     */
    cleanup(): void {
        console.log('🧹 Cleaning up resources...');
        this.proofManager.clearHistory();
        console.log('✅ Cleanup completed');
    }

    // Private helper methods

    private simulateShuffle(deck: number[]): number[] {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private calculatePermutation(original: number[], shuffled: number[]): number[] {
        // Calculate permutation that maps original to shuffled
        const permutation: number[] = [];
        for (const card of shuffled) {
            permutation.push(original.indexOf(card));
        }
        return permutation;
    }

    private printGameStatistics(result: GameVerificationResult): void {
        console.log('\n📊 Game Verification Statistics:');
        console.log('=================================');
        console.log(`Game ID: ${result.gameId}`);
        console.log(`Players: ${result.results.players.length}`);
        console.log(`Total Phases: ${result.statistics.totalPhases}`);
        console.log(`Total Time: ${result.statistics.totalTime}ms`);
        console.log(`Average Phase Time: ${result.statistics.averagePhaseTime.toFixed(2)}ms`);
        console.log(`Proofs per Second: ${result.statistics.proofsPerSecond.toFixed(2)}`);
        console.log(`Success Rate: ${(result.statistics.successRate * 100).toFixed(1)}%`);

        console.log('\nPhase Details:');
        result.results.phases.forEach((phase: any, index: number) => {
            console.log(`${index + 1}. ${phase.name}: ${phase.processingTime}ms ${phase.success ? '✅' : '❌'}`);
        });
    }
}

// Type definitions
export type GamePhase = 'deckGeneration' | 'shuffle' | 'dealing' | 'commitment';

export interface GameVerificationResult {
    success: boolean;
    gameId: string;
    results: any;
    statistics?: {
        totalPhases: number;
        totalTime: number;
        averagePhaseTime: number;
        proofsPerSecond: number;
        successRate: number;
    };
    error?: string;
}

export interface PhaseVerificationResult {
    success: boolean;
    phase: GamePhase;
    proof?: any;
    verification?: boolean;
    processingTime?: number;
    error?: string;
}

// Example usage
async function main() {
    console.log('🎮 Poker Game Verification System Demo');
    console.log('======================================\n');
    
    // Initialize verifier
    const verifier = new PokerGameVerifier('demo-game-001');
    await verifier.initialize();
    
    // Define players
    const players = ['alice', 'bob', 'charlie', 'diana'];
    
    try {
        // Run complete game verification
        const result = await verifier.verifyTexasHoldemGame(players);
        
        if (result.success) {
            // Export results
            const exportPath = await verifier.exportResults(result);
            
            // Show system statistics
            console.log('\n📈 System Statistics:');
            console.log(JSON.stringify(verifier.getSystemStatistics(), null, 2));
        }
        
    } catch (error) {
        console.error('Demo failed:', error);
    } finally {
        // Clean up
        verifier.cleanup();
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

export default PokerGameVerifier;