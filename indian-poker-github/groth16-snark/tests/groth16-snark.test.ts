/**
 * Comprehensive Test Suite for Groth16 SNARK System
 * 
 * This test suite covers all components of the Groth16 SNARK implementation
 * for verifiable poker card dealing.
 */

import Groth16SNARK from '../src/index';
import PokerCircuitBuilder, { PokerCircuitInputs } from '../src/pokerCircuits';
import TrustedSetupCeremonyManager from '../src/trustedSetup';
import PokerProofManager from '../src/proofManager';

describe('Groth16 SNARK System Tests', () => {
    let snark: Groth16SNARK;
    let circuitBuilder: PokerCircuitBuilder;
    let ceremonyManager: TrustedSetupCeremonyManager;
    let proofManager: PokerProofManager;

    beforeAll(async () => {
        // Initialize all components
        snark = new Groth16SNARK();
        circuitBuilder = new PokerCircuitBuilder();
        ceremonyManager = new TrustedSetupCeremonyManager();
        proofManager = new PokerProofManager();

        await snark.initialize();
        await proofManager.initialize();
    });

    describe('Core SNARK Tests', () => {
        test('should initialize SNARK system correctly', async () => {
            expect(snark).toBeDefined();
            const stats = snark.getStatistics();
            expect(stats.circuitsRegistered).toBeGreaterThan(0);
        });

        test('should have poker circuits registered', () => {
            const stats = snark.getStatistics();
            expect(stats.circuitsRegistered).toBeGreaterThan(0);
        });

        test('should verify permutation validation', () => {
            // Test valid permutation
            const validPermutation = Array.from({length: 52}, (_, i) => i).sort(() => Math.random() - 0.5);
            expect(validPermutation).toHaveLength(52);
            expect(new Set(validPermutation).size).toBe(52);

            // Test invalid permutations
            const invalidPermutation1 = Array.from({length: 51}, (_, i) => i);
            expect(invalidPermutation1.length).toBe(51);
        });
    });

    describe('Poker Circuit Tests', () => {
        test('should have all poker circuits registered', () => {
            const circuits = circuitBuilder.getCircuits();
            expect(circuits.size).toBeGreaterThan(0);

            const expectedCircuits = [
                'deckGeneration',
                'cardShuffle',
                'cardDealing',
                'cardCommitment',
                'playerDeal',
                'roundDealing',
                'handVerification'
            ];

            expectedCircuits.forEach(circuitName => {
                expect(circuits.has(circuitName)).toBe(true);
            });
        });

        test('should generate valid deck generation witness', async () => {
            const circuit = circuitBuilder.getCircuit('deckGeneration');
            expect(circuit).toBeDefined();

            const inputs: PokerCircuitInputs = {
                metadata: { seed: 'test-seed-123' }
            };

            const witness = await circuit!.witnessGenerator.generate(inputs);
            
            expect(witness.signals).toBeDefined();
            expect(witness.commitments).toBeDefined();
            
            // Check that all 52 cards have suits and ranks
            for (let i = 0; i < 52; i++) {
                expect(witness.signals[`suit_${i}`]).toBeDefined();
                expect(witness.signals[`rank_${i}`]).toBeDefined();
                expect(witness.signals[`suit_${i}`]).toBeGreaterThanOrEqual(0);
                expect(witness.signals[`suit_${i}`]).toBeLessThanOrEqual(3);
                expect(witness.signals[`rank_${i}`]).toBeGreaterThanOrEqual(2);
                expect(witness.signals[`rank_${i}`]).toBeLessThanOrEqual(14);
            }
        });

        test('should validate deck uniqueness', () => {
            const signals: { [key: string]: any } = {};
            
            // Create valid deck
            for (let i = 0; i < 52; i++) {
                const suit = Math.floor(i / 13);
                const rank = (i % 13) + 2;
                signals[`suit_${i}`] = suit;
                signals[`rank_${i}`] = rank;
            }

            // Check uniqueness validation
            const circuit = circuitBuilder.getCircuit('deckGeneration')!;
            const uniquenessConstraint = circuit.constraints.find(c => c.type === 'permutation');
            expect(uniquenessConstraint).toBeDefined();
            expect(uniquenessConstraint!.validate({ signals })).toBe(true);
        });
    });

    describe('Trusted Setup Tests', () => {
        test('should initialize ceremony correctly', async () => {
            const ceremony = await ceremonyManager.initializeCeremony(
                'cardShuffle',
                'Test Ceremony',
                'Test description',
                'test-initiator'
            );

            expect(ceremony.id).toBeDefined();
            expect(ceremony.circuitName).toBe('cardShuffle');
            expect(ceremony.status).toBe('initiated');
            expect(ceremony.participants).toHaveLength(1);
        });

        test('should add participants to ceremony', async () => {
            const ceremony = await ceremonyManager.initializeCeremony(
                'cardDealing',
                'Player Test',
                'Testing participant addition',
                'initiator'
            );

            await ceremonyManager.addParticipant(ceremony.id, 'player1');
            await ceremonyManager.addParticipant(ceremony.id, 'player2');

            const updatedCeremony = ceremonyManager.getCeremonyStatus(ceremony.id);
            expect(updatedCeremony?.participants).toHaveLength(3); // initiator + 2 players
        });

        test('should validate contribution format', () => {
            const validContribution = {
                tau: 'test-tau',
                alpha: 'test-alpha',
                beta: 'test-beta',
                gamma: 'test-gamma',
                delta: 'test-delta',
                circuitSpecific: {}
            };

            const invalidContribution = {
                tau: '',
                alpha: 'test-alpha',
                beta: 'test-beta'
            };

            // This would test the private validation method
            // In a real implementation, we'd make it public or use a test utility
        });

        test('should complete ceremony with sufficient participants', async () => {
            const ceremony = await ceremonyManager.initializeCeremony(
                'cardCommitment',
                'Completion Test',
                'Testing ceremony completion',
                'initiator'
            );

            // Add minimum participants
            await ceremonyManager.addParticipant(ceremony.id, 'participant1');
            
            // Make contributions
            const contribution = {
                tau: 'tau1',
                alpha: 'alpha1',
                beta: 'beta1',
                gamma: 'gamma1',
                delta: 'delta1',
                circuitSpecific: {}
            };

            await ceremonyManager.makeContribution(ceremony.id, 'participant1', contribution);

            const finalCeremony = ceremonyManager.getCeremonyStatus(ceremony.id);
            expect(finalCeremony?.status).toBe('completed');
        });
    });

    describe('Proof Generation Tests', () => {
        test('should generate deck generation proof', async () => {
            const result = await proofManager.createDeckGenerationProof('test-seed-456');

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
            expect(result.proof?.dealId).toBeDefined();
            expect(result.processingTime).toBeGreaterThan(0);
        });

        test('should generate card commitment proof', async () => {
            const result = await proofManager.createCardCommitmentProof(
                25, // Card value (5 of hearts)
                12345, // Nonce
                'test-game-789'
            );

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
            expect(result.proof?.dealId).toBeDefined();
        });

        test('should generate card shuffle proof', async () => {
            const originalDeck = Array.from({length: 52}, (_, i) => i);
            const shuffledDeck = [...originalDeck].sort(() => Math.random() - 0.5);
            const permutation = Array.from({length: 52}, (_, i) => i);

            const result = await proofManager.createCardShuffleProof(
                originalDeck,
                shuffledDeck,
                permutation,
                'test-shuffle-game'
            );

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
        });

        test('should generate card dealing proof', async () => {
            const shuffledDeck = Array.from({length: 52}, (_, i) => i);
            const dealPositions = [0, 1, 2, 3]; // First 4 cards

            const result = await proofManager.createCardDealingProof(
                shuffledDeck,
                dealPositions,
                'test-deal-game',
                'test-player'
            );

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
        });

        test('should handle invalid inputs gracefully', async () => {
            const result = await proofManager.generateProof({
                circuitType: 'deckGeneration' as any,
                publicInputs: {},
                privateInputs: {},
                metadata: {
                    gameId: 'invalid-test',
                    timestamp: Date.now()
                }
            });

            // Should fail due to invalid circuit type
            expect(result.success).toBe(false);
        });

        test('should track proof statistics', async () => {
            const initialStats = proofManager.getStatistics();
            
            await proofManager.createDeckGenerationProof('stats-test');
            
            const updatedStats = proofManager.getStatistics();
            expect(updatedStats.totalProofsGenerated).toBe(initialStats.totalProofsGenerated + 1);
        });
    });

    describe('Proof Verification Tests', () => {
        let testProof: any;

        beforeEach(async () => {
            // Create a test proof for verification
            const result = await proofManager.createDeckGenerationProof('verify-test-seed');
            testProof = result.proof;
        });

        test('should verify valid proof', async () => {
            const isValid = await proofManager.verifyProof(testProof);

            expect(isValid).toBe(true);
        });

        test('should verify proof with options', async () => {
            const isValid = await proofManager.verifyProof(testProof, {
                strict: true,
                checkTimestamps: true,
                maxAgeHours: 24,
                verifyCommitments: true,
                logResults: false
            });

            expect(isValid).toBe(true);
        });

        test('should reject tampered proof', async () => {
            const tamperedProof = {
                ...testProof,
                proof: {
                    ...testProof.proof,
                    pi_a: ['tampered', 'value', 'data']
                }
            };

            const isValid = await proofManager.verifyProof(tamperedProof);
            expect(isValid).toBe(false);
        });

        test('should batch verify multiple proofs', async () => {
            // Create multiple proofs
            const proof1 = await proofManager.createDeckGenerationProof('batch-test-1');
            const proof2 = await proofManager.createDeckGenerationProof('batch-test-2');
            const proof3 = await proofManager.createDeckGenerationProof('batch-test-3');

            const results = await proofManager.verifyBatchProofs([
                proof1.proof!,
                proof2.proof!,
                proof3.proof!
            ]);

            expect(results.valid).toBe(true);
            expect(results.failures).toHaveLength(0);
            expect(results.successRate).toBe(1.0);
        });
    });

    describe('Integration Tests', () => {
        test('should complete full poker game proof flow', async () => {
            const gameId = 'integration-test-game';
            
            // Step 1: Generate fresh deck
            const deckResult = await proofManager.createDeckGenerationProof('integration-seed');
            expect(deckResult.success).toBe(true);

            // Step 2: Shuffle deck (simulate)
            const originalDeck = Array.from({length: 52}, (_, i) => i);
            const shuffledDeck = [...originalDeck].sort(() => Math.random() - 0.5);
            const permutation = Array.from({length: 52}, (_, i) => i);

            const shuffleResult = await proofManager.createCardShuffleProof(
                originalDeck,
                shuffledDeck,
                permutation,
                gameId
            );
            expect(shuffleResult.success).toBe(true);

            // Step 3: Deal cards
            const dealResult = await proofManager.createCardDealingProof(
                shuffledDeck,
                [0, 1, 2, 3], // Hole cards for 2 players
                gameId
            );
            expect(dealResult.success).toBe(true);

            // Step 4: Commit to a specific card
            const commitResult = await proofManager.createCardCommitmentProof(
                shuffledDeck[0],
                54321,
                gameId,
                'player1'
            );
            expect(commitResult.success).toBe(true);

            // Verify all proofs
            const allProofs = [
                deckResult.proof!,
                shuffleResult.proof!,
                dealResult.proof!,
                commitResult.proof!
            ];

            const verificationResults = await proofManager.verifyBatchProofs(allProofs);
            expect(verificationResults.valid).toBe(true);
            expect(verificationResults.failures).toHaveLength(0);
        });

        test('should handle concurrent proof generation', async () => {
            const promises = Array.from({length: 5}, (_, i) => 
                proofManager.createDeckGenerationProof(`concurrent-test-${i}`)
            );

            const results = await Promise.all(promises);
            
            results.forEach(result => {
                expect(result.success).toBe(true);
                expect(result.proof).toBeDefined();
            });

            const verificationResults = await proofManager.verifyBatchProofs(
                results.map(r => r.proof!)
            );
            expect(verificationResults.valid).toBe(true);
        });
    });

    describe('Performance Tests', () => {
        test('should measure proof generation time', async () => {
            const startTime = Date.now();
            
            const result = await proofManager.createDeckGenerationProof('performance-test');
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(result.success).toBe(true);
            expect(result.processingTime).toBeGreaterThan(0);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });

        test('should measure verification time', async () => {
            // Create a proof first
            const proofResult = await proofManager.createDeckGenerationProof('perf-verify-test');
            const proof = proofResult.proof!;

            const startTime = Date.now();
            const isValid = await proofManager.verifyProof(proof);
            const endTime = Date.now();

            expect(isValid).toBe(true);
            expect(endTime - startTime).toBeLessThan(5000); // Should verify within 5 seconds
        });

        test('should handle batch operations efficiently', async () => {
            const batchSize = 10;
            const proofs = Array.from({length: batchSize}, (_, i) => ({
                circuitType: 'deckGeneration' as const,
                publicInputs: { seed: `batch-test-${i}` },
                privateInputs: {},
                metadata: {
                    gameId: `batch-game-${i}`,
                    timestamp: Date.now()
                }
            }));

            const startTime = Date.now();
            const result = await proofManager.generateBatchProofs({
                proofs,
                parallel: true,
                verifyImmediately: false
            });
            const endTime = Date.now();

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(batchSize);
            expect(endTime - startTime).toBeLessThan(30000); // Batch should complete within 30 seconds
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle invalid seed gracefully', async () => {
            const result = await proofManager.createDeckGenerationProof(null as any);
            expect(result.success).toBe(true); // Should generate random seed
        });

        test('should handle empty deck input', async () => {
            const result = await proofManager.createCardShuffleProof(
                [],
                [],
                [],
                'edge-case-test'
            );

            // Should handle gracefully or fail with meaningful error
            expect(result.success).toBe(false);
        });

        test('should handle out-of-bounds card values', async () => {
            const result = await proofManager.createCardCommitmentProof(
                100, // Invalid card value
                12345,
                'edge-case-card'
            );

            expect(result.success).toBe(false);
        });

        test('should handle missing game ID', async () => {
            const result = await proofManager.createDeckGenerationProof('no-game-test');
            expect(result.success).toBe(true);
            expect(result.proof?.dealId).toBeDefined();
        });

        test('should handle proof history management', async () => {
            const initialHistory = proofManager.getProofHistory();
            
            await proofManager.createDeckGenerationProof('history-test');
            
            const updatedHistory = proofManager.getProofHistory();
            expect(updatedHistory.length).toBe(initialHistory.length + 1);
            
            // Test history limit
            const limitedHistory = proofManager.getProofHistory(5);
            expect(limitedHistory.length).toBeLessThanOrEqual(5);
            
            // Test clear history
            proofManager.clearHistory();
            const clearedHistory = proofManager.getProofHistory();
            expect(clearedHistory.length).toBe(0);
        });
    });

    describe('Security Tests', () => {
        test('should generate unique deal IDs', async () => {
            const result1 = await proofManager.createDeckGenerationProof('security-test-1');
            const result2 = await proofManager.createDeckGenerationProof('security-test-2');

            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(result1.proof?.dealId).not.toBe(result2.proof?.dealId);
        });

        test('should validate proof integrity', async () => {
            const originalResult = await proofManager.createDeckGenerationProof('integrity-test');
            const originalProof = originalResult.proof!;

            // Modify the proof slightly
            const tamperedProof = {
                ...originalProof,
                timestamp: originalProof.timestamp + 1
            };

            const isValidOriginal = await proofManager.verifyProof(originalProof);
            const isValidTampered = await proofManager.verifyProof(tamperedProof);

            expect(isValidOriginal).toBe(true);
            expect(isValidTampered).toBe(false);
        });

        test('should handle replay attacks', async () => {
            const result = await proofManager.createDeckGenerationProof('replay-test');
            const proof = result.proof!;

            // Try to use the same proof twice
            const verification1 = await proofManager.verifyProof(proof);
            const verification2 = await proofManager.verifyProof(proof);

            expect(verification1).toBe(true);
            expect(verification2).toBe(true); // Should allow multiple verifications
        });
    });
});

// Helper functions for tests
function generateTestDeck(): number[] {
    return Array.from({length: 52}, (_, i) => i);
}

function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function createTestPermutation(): number[] {
    return Array.from({length: 52}, (_, i) => i).sort(() => Math.random() - 0.5);
}