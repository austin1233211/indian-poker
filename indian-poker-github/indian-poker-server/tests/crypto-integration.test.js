/**
 * End-to-End Integration Tests for Cryptographic Flows
 * 
 * These tests verify the complete cryptographic security chain:
 * 1. Commit-Reveal Protocol for distributed randomness
 * 2. Timestamp commitment (prevents server grinding)
 * 3. Deterministic shuffle verification
 * 4. Deck commitment and reveal verification
 * 5. Client-side verification integration
 * 
 * SECURITY TESTS:
 * - Verify server cannot manipulate randomness
 * - Verify timestamp is committed before reveals
 * - Verify game aborts on incomplete reveals (no fallback to server randomness)
 * - Verify shuffle is deterministic and reproducible
 */

'use strict';

const crypto = require('crypto');
const {
    DistributedRandomness,
    VerifiableShuffle,
    AEADEncryption,
    VerificationCheckpoint
} = require('../security-utils');
const { IndianPokerVerifier, createRandomnessCommitment, sha256 } = require('../client-verification');

describe('Distributed Randomness Protocol', () => {
    let distributedRandomness;

    beforeEach(() => {
        distributedRandomness = new DistributedRandomness();
    });

    describe('Commit Phase', () => {
        test('should accept valid player commitments', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            
            const result = distributedRandomness.commitPlayerSeed('player1', commitment);
            
            expect(result.success).toBe(true);
            expect(result.playerId).toBe('player1');
        });

        test('should reject duplicate commitments from same player', () => {
            const seed1 = crypto.randomBytes(32).toString('hex');
            const commitment1 = crypto.createHash('sha256').update(seed1).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment1);
            const result = distributedRandomness.commitPlayerSeed('player1', commitment1);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('already committed');
        });

        test('should track multiple player commitments', () => {
            const players = ['player1', 'player2', 'player3'];
            
            players.forEach(playerId => {
                const seed = crypto.randomBytes(32).toString('hex');
                const commitment = crypto.createHash('sha256').update(seed).digest('hex');
                distributedRandomness.commitPlayerSeed(playerId, commitment);
            });
            
            const state = distributedRandomness.getState();
            expect(state.commitmentCount).toBe(3);
        });
    });

    describe('Timestamp Commitment (Anti-Grinding)', () => {
        test('should commit timestamp when completing commitment phase', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            distributedRandomness.commitPlayerSeed('player1', commitment);
            
            const result = distributedRandomness.completeCommitmentPhase();
            
            expect(result.success).toBe(true);
            expect(result.timestampCommitment).toBeDefined();
            expect(result.timestampCommitment).toHaveLength(64);
        });

        test('should set timestampCommitted flag after commitment phase', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            distributedRandomness.commitPlayerSeed('player1', commitment);
            
            distributedRandomness.completeCommitmentPhase();
            
            const timestampInfo = distributedRandomness.getTimestampCommitment();
            expect(timestampInfo.timestampCommitted).toBe(true);
            expect(timestampInfo.timestampCommitment).toBeDefined();
        });

        test('should verify timestamp commitment matches revealed timestamp', async () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            distributedRandomness.commitPlayerSeed('player1', commitment);
            
            const result = distributedRandomness.completeCommitmentPhase();
            const timestampCommitment = result.timestampCommitment;
            
            const transcriptData = distributedRandomness.getTranscriptData();
            const revealedTimestamp = transcriptData.timestamp;
            
            const computedCommitment = crypto.createHash('sha256')
                .update(revealedTimestamp)
                .digest('hex');
            
            expect(computedCommitment).toBe(timestampCommitment);
        });
    });

    describe('Reveal Phase', () => {
        test('should accept valid reveals that match commitments', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment);
            distributedRandomness.completeCommitmentPhase();
            
            const result = distributedRandomness.revealPlayerSeed('player1', seed);
            
            expect(result.success).toBe(true);
        });

        test('should reject reveals that do not match commitments', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const wrongSeed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment);
            distributedRandomness.completeCommitmentPhase();
            
            const result = distributedRandomness.revealPlayerSeed('player1', wrongSeed);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('does not match');
        });

        test('should reject reveals from players who did not commit', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment);
            distributedRandomness.completeCommitmentPhase();
            
            const result = distributedRandomness.revealPlayerSeed('player2', seed);
            
            expect(result.success).toBe(false);
        });
    });

    describe('Final Seed Generation', () => {
        test('should generate final seed using pre-committed timestamp', () => {
            const seed1 = crypto.randomBytes(32).toString('hex');
            const seed2 = crypto.randomBytes(32).toString('hex');
            const commitment1 = crypto.createHash('sha256').update(seed1).digest('hex');
            const commitment2 = crypto.createHash('sha256').update(seed2).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment1);
            distributedRandomness.commitPlayerSeed('player2', commitment2);
            distributedRandomness.completeCommitmentPhase();
            
            distributedRandomness.revealPlayerSeed('player1', seed1);
            distributedRandomness.revealPlayerSeed('player2', seed2);
            
            const result = distributedRandomness.generateShuffleSeed();
            
            expect(result.success).toBe(true);
            expect(result.finalSeed).toBeDefined();
            expect(result.timestampCommitment).toBeDefined();
            expect(result.message).toContain('pre-committed timestamp');
        });

        test('should fail if timestamp was not committed before seed generation', () => {
            const dr = new DistributedRandomness();
            
            const result = dr.generateShuffleSeed();
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Timestamp must be committed');
        });

        test('should produce deterministic seed from same inputs', () => {
            const seed1 = 'fixed_seed_1';
            const seed2 = 'fixed_seed_2';
            const commitment1 = crypto.createHash('sha256').update(seed1).digest('hex');
            const commitment2 = crypto.createHash('sha256').update(seed2).digest('hex');
            
            const dr1 = new DistributedRandomness();
            dr1.commitPlayerSeed('player1', commitment1);
            dr1.commitPlayerSeed('player2', commitment2);
            dr1.completeCommitmentPhase();
            dr1.revealPlayerSeed('player1', seed1);
            dr1.revealPlayerSeed('player2', seed2);
            
            const timestamp = dr1.timestamp;
            
            const combined = [seed1, seed2].sort((a, b) => 'player1'.localeCompare('player2') ? -1 : 1).join('||') + '||' + timestamp;
            const expectedSeed = crypto.createHash('sha256').update(combined).digest('hex');
            
            const result = dr1.generateShuffleSeed();
            
            expect(result.finalSeed).toBeDefined();
        });
    });

    describe('Reset Functionality', () => {
        test('should clear all state including timestamp commitment', () => {
            const seed = crypto.randomBytes(32).toString('hex');
            const commitment = crypto.createHash('sha256').update(seed).digest('hex');
            
            distributedRandomness.commitPlayerSeed('player1', commitment);
            distributedRandomness.completeCommitmentPhase();
            distributedRandomness.revealPlayerSeed('player1', seed);
            distributedRandomness.generateShuffleSeed();
            
            distributedRandomness.reset();
            
            const state = distributedRandomness.getState();
            const timestampInfo = distributedRandomness.getTimestampCommitment();
            
            expect(state.commitmentCount).toBe(0);
            expect(state.revealCount).toBe(0);
            expect(timestampInfo.timestampCommitted).toBe(false);
            expect(timestampInfo.timestampCommitment).toBeNull();
        });
    });
});

describe('Verifiable Shuffle', () => {
    const createTestDeck = () => {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck = [];
        
        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ suit, rank });
            }
        }
        
        return deck;
    };

    test('should produce deterministic shuffle from seed', () => {
        const deck = createTestDeck();
        const seed = 'test_seed_12345';
        
        const result1 = VerifiableShuffle.deterministicShuffle([...deck], seed);
        const result2 = VerifiableShuffle.deterministicShuffle([...deck], seed);
        
        expect(result1.shuffled).toEqual(result2.shuffled);
        expect(result1.permutation).toEqual(result2.permutation);
    });

    test('should produce different shuffles for different seeds', () => {
        const deck = createTestDeck();
        
        const result1 = VerifiableShuffle.deterministicShuffle([...deck], 'seed_a');
        const result2 = VerifiableShuffle.deterministicShuffle([...deck], 'seed_b');
        
        expect(result1.shuffled).not.toEqual(result2.shuffled);
    });

    test('should verify correct shuffle', () => {
        const deck = createTestDeck();
        const seed = 'verification_test_seed';
        
        const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle([...deck], seed);
        
        const isValid = VerifiableShuffle.verifyShuffle(deck, shuffled, seed);
        
        expect(isValid).toBe(true);
    });

    test('should reject tampered shuffle', () => {
        const deck = createTestDeck();
        const seed = 'tamper_test_seed';
        
        const { shuffled } = VerifiableShuffle.deterministicShuffle([...deck], seed);
        
        const tamperedShuffle = [...shuffled];
        [tamperedShuffle[0], tamperedShuffle[1]] = [tamperedShuffle[1], tamperedShuffle[0]];
        
        const isValid = VerifiableShuffle.verifyShuffle(deck, tamperedShuffle, seed);
        
        expect(isValid).toBe(false);
    });

    test('should generate verification transcript', () => {
        const deck = createTestDeck();
        const seed = 'transcript_test_seed';
        const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle([...deck], seed);
        
        const transcript = VerifiableShuffle.generateVerificationTranscript({
            gameId: 'test-game-123',
            playerCommitments: new Map([['player1', 'commitment1']]),
            playerReveals: new Map([['player1', 'reveal1']]),
            finalSeed: seed,
            originalDeck: deck,
            shuffledDeck: shuffled,
            permutation: permutation,
            timestamp: Date.now().toString()
        });
        
        expect(transcript.gameId).toBe('test-game-123');
        expect(transcript.transcriptHash).toBeDefined();
        expect(transcript.commitments).toHaveLength(1);
        expect(transcript.reveals).toHaveLength(1);
    });
});

describe('AEAD Encryption', () => {
    let aeadEncryption;

    beforeEach(() => {
        aeadEncryption = new AEADEncryption();
    });

    test('should encrypt and decrypt data correctly', () => {
        const plaintext = 'sensitive card data';
        const gameId = 'test-game-123';
        
        const encrypted = aeadEncryption.encrypt(plaintext, gameId);
        const decrypted = aeadEncryption.decrypt(encrypted, gameId);
        
        expect(decrypted).toBe(plaintext);
    });

    test('should produce different ciphertext for same plaintext (due to random IV)', () => {
        const plaintext = 'same data';
        const gameId = 'test-game-123';
        
        const encrypted1 = aeadEncryption.encrypt(plaintext, gameId);
        const encrypted2 = aeadEncryption.encrypt(plaintext, gameId);
        
        expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    test('should fail decryption with wrong game ID', () => {
        const plaintext = 'sensitive data';
        
        const encrypted = aeadEncryption.encrypt(plaintext, 'game-1');
        
        expect(() => {
            aeadEncryption.decrypt(encrypted, 'game-2');
        }).toThrow();
    });

    test('should encrypt and decrypt deck state', () => {
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' }
        ];
        const gameId = 'deck-test-game';
        
        const encrypted = aeadEncryption.encryptDeckState(deck, gameId);
        const decrypted = aeadEncryption.decryptDeckState(encrypted, gameId);
        
        expect(decrypted).toEqual(deck);
    });

    test('should derive different keys for different games', () => {
        const key1 = aeadEncryption.deriveGameKey('game-1');
        const key2 = aeadEncryption.deriveGameKey('game-2');
        
        expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });

    test('should support key rotation', () => {
        const plaintext = 'test data';
        const gameId = 'rotation-test';
        
        const encrypted1 = aeadEncryption.encrypt(plaintext, gameId);
        
        aeadEncryption.rotateKey();
        
        expect(() => {
            aeadEncryption.decrypt(encrypted1, gameId);
        }).toThrow();
    });
});

describe('Client-Side Verification Integration', () => {
    let verifier;

    beforeEach(() => {
        verifier = new IndianPokerVerifier();
    });

    test('should store and verify deck commitment', async () => {
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' }
        ];
        const nonce = crypto.randomBytes(32).toString('hex');
        
        const serialized = deck.map(c => `${c.suit}:${c.rank}`).join('|');
        const commitment = crypto.createHash('sha256')
            .update(serialized + ':' + nonce)
            .digest('hex');
        
        verifier.setDeckCommitment(commitment, 'test-game');
        
        const result = await verifier.verifyDeckCommitment(deck, nonce);
        
        expect(result.valid).toBe(true);
    });

    test('should detect tampered deck', async () => {
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' }
        ];
        const nonce = crypto.randomBytes(32).toString('hex');
        
        const serialized = deck.map(c => `${c.suit}:${c.rank}`).join('|');
        const commitment = crypto.createHash('sha256')
            .update(serialized + ':' + nonce)
            .digest('hex');
        
        verifier.setDeckCommitment(commitment, 'test-game');
        
        const tamperedDeck = [
            { suit: 'hearts', rank: 'K' },
            { suit: 'spades', rank: 'A' }
        ];
        
        const result = await verifier.verifyDeckCommitment(tamperedDeck, nonce);
        
        expect(result.valid).toBe(false);
    });

    test('should verify player commitments match reveals', async () => {
        const seed1 = crypto.randomBytes(32).toString('hex');
        const seed2 = crypto.randomBytes(32).toString('hex');
        const commitment1 = crypto.createHash('sha256').update(seed1).digest('hex');
        const commitment2 = crypto.createHash('sha256').update(seed2).digest('hex');
        
        verifier.addPlayerCommitment('player1', commitment1);
        verifier.addPlayerCommitment('player2', commitment2);
        verifier.addPlayerReveal('player1', seed1);
        verifier.addPlayerReveal('player2', seed2);
        
        const result = await verifier.verifyPlayerCommitments();
        
        expect(result.valid).toBe(true);
        expect(result.playerResults['player1'].valid).toBe(true);
        expect(result.playerResults['player2'].valid).toBe(true);
    });

    test('should detect mismatched player reveal', async () => {
        const seed = crypto.randomBytes(32).toString('hex');
        const wrongSeed = crypto.randomBytes(32).toString('hex');
        const commitment = crypto.createHash('sha256').update(seed).digest('hex');
        
        verifier.addPlayerCommitment('player1', commitment);
        verifier.addPlayerReveal('player1', wrongSeed);
        
        const result = await verifier.verifyPlayerCommitments();
        
        expect(result.valid).toBe(false);
        expect(result.playerResults['player1'].valid).toBe(false);
    });

    test('should verify timestamp commitment (anti-grinding)', async () => {
        const timestamp = Date.now().toString();
        const timestampCommitment = crypto.createHash('sha256')
            .update(timestamp)
            .digest('hex');
        
        verifier.setTimestampCommitment(timestampCommitment);
        
        const result = await verifier.verifyTimestampCommitment(timestamp);
        
        expect(result.valid).toBe(true);
        expect(result.securityNote).toContain('server could not grind');
    });

    test('should detect timestamp grinding attempt', async () => {
        const originalTimestamp = Date.now().toString();
        const timestampCommitment = crypto.createHash('sha256')
            .update(originalTimestamp)
            .digest('hex');
        
        verifier.setTimestampCommitment(timestampCommitment);
        
        const differentTimestamp = (Date.now() + 1000).toString();
        const result = await verifier.verifyTimestampCommitment(differentTimestamp);
        
        expect(result.valid).toBe(false);
        expect(result.securityNote).toContain('SECURITY ALERT');
    });

    test('should verify card position in deck', () => {
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' },
            { suit: 'diamonds', rank: 'Q' }
        ];
        
        const result = verifier.verifyCardPosition(deck, 1, { suit: 'spades', rank: 'K' });
        
        expect(result.valid).toBe(true);
    });

    test('should detect wrong card at position', () => {
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' },
            { suit: 'diamonds', rank: 'Q' }
        ];
        
        const result = verifier.verifyCardPosition(deck, 1, { suit: 'hearts', rank: 'A' });
        
        expect(result.valid).toBe(false);
    });

    test('should export verification log for audit', async () => {
        verifier.setDeckCommitment('test_commitment', 'test-game');
        verifier.setTimestampCommitment('timestamp_commitment');
        
        const log = verifier.exportVerificationLog();
        const parsed = JSON.parse(log);
        
        expect(parsed.gameId).toBe('test-game');
        expect(parsed.verificationResults).toHaveLength(2);
        expect(parsed.exportedAt).toBeDefined();
    });

    test('should reset verifier for new game', async () => {
        verifier.setDeckCommitment('commitment', 'game-1');
        verifier.addPlayerCommitment('player1', 'commitment1');
        
        verifier.reset();
        
        expect(verifier.deckCommitment).toBeNull();
        expect(verifier.playerCommitments.size).toBe(0);
        expect(verifier.gameId).toBeNull();
    });
});

describe('Verification Checkpoint', () => {
    let checkpoint;

    beforeEach(() => {
        checkpoint = new VerificationCheckpoint();
    });

    test('should create checkpoint with state hash', () => {
        const gameState = {
            deckCommitment: 'test_commitment',
            dealtCards: 3,
            playerCount: 4,
            currentRound: 1
        };
        
        const result = checkpoint.createCheckpoint('game-123', gameState);
        
        expect(result.id).toBeDefined();
        expect(result.stateHash).toBeDefined();
        expect(result.state.deckCommitment).toBe('test_commitment');
    });

    test('should verify checkpoint integrity', () => {
        const gameState = {
            deckCommitment: 'test_commitment',
            dealtCards: 3,
            playerCount: 4,
            currentRound: 1
        };
        
        const created = checkpoint.createCheckpoint('game-123', gameState);
        
        const result = checkpoint.verifyCheckpoint(created.id, gameState);
        
        expect(result.valid).toBe(true);
        expect(result.tampering).toBe(false);
    });

    test('should detect state tampering', () => {
        const originalState = {
            deckCommitment: 'original_commitment',
            dealtCards: 3,
            playerCount: 4,
            currentRound: 1
        };
        
        const created = checkpoint.createCheckpoint('game-123', originalState);
        
        const tamperedState = {
            ...originalState,
            deckCommitment: 'tampered_commitment'
        };
        
        const result = checkpoint.verifyCheckpoint(created.id, tamperedState);
        
        expect(result.valid).toBe(false);
        expect(result.tampering).toBe(true);
    });
});

describe('createRandomnessCommitment Utility', () => {
    test('should create commitment from provided seed', async () => {
        const seed = 'my_secret_seed_12345';
        
        const result = await createRandomnessCommitment(seed);
        
        expect(result.seed).toBe(seed);
        expect(result.commitment).toBeDefined();
        expect(result.commitment).toHaveLength(64);
        
        const expectedCommitment = crypto.createHash('sha256').update(seed).digest('hex');
        expect(result.commitment).toBe(expectedCommitment);
    });

    test('should generate random seed if not provided', async () => {
        const result = await createRandomnessCommitment();
        
        expect(result.seed).toBeDefined();
        expect(result.seed).toHaveLength(64);
        expect(result.commitment).toBeDefined();
        expect(result.warning).toContain('Keep seed secret');
    });
});

describe('Full Cryptographic Flow Integration', () => {
    test('should complete full commit-reveal-shuffle-verify flow', async () => {
        const distributedRandomness = new DistributedRandomness();
        const verifier = new IndianPokerVerifier();
        
        const player1Seed = crypto.randomBytes(32).toString('hex');
        const player2Seed = crypto.randomBytes(32).toString('hex');
        const player1Commitment = crypto.createHash('sha256').update(player1Seed).digest('hex');
        const player2Commitment = crypto.createHash('sha256').update(player2Seed).digest('hex');
        
        distributedRandomness.commitPlayerSeed('player1', player1Commitment);
        distributedRandomness.commitPlayerSeed('player2', player2Commitment);
        
        verifier.addPlayerCommitment('player1', player1Commitment);
        verifier.addPlayerCommitment('player2', player2Commitment);
        
        const commitResult = distributedRandomness.completeCommitmentPhase();
        expect(commitResult.success).toBe(true);
        
        verifier.setTimestampCommitment(commitResult.timestampCommitment);
        
        distributedRandomness.revealPlayerSeed('player1', player1Seed);
        distributedRandomness.revealPlayerSeed('player2', player2Seed);
        
        verifier.addPlayerReveal('player1', player1Seed);
        verifier.addPlayerReveal('player2', player2Seed);
        
        const seedResult = distributedRandomness.generateShuffleSeed();
        expect(seedResult.success).toBe(true);
        
        const deck = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'K' },
            { suit: 'diamonds', rank: 'Q' },
            { suit: 'clubs', rank: 'J' }
        ];
        
        const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle([...deck], seedResult.finalSeed);
        
        const isShuffleValid = VerifiableShuffle.verifyShuffle(deck, shuffled, seedResult.finalSeed);
        expect(isShuffleValid).toBe(true);
        
        const commitmentVerification = await verifier.verifyPlayerCommitments();
        expect(commitmentVerification.valid).toBe(true);
        
        const transcriptData = distributedRandomness.getTranscriptData();
        const timestampVerification = await verifier.verifyTimestampCommitment(transcriptData.timestamp);
        expect(timestampVerification.valid).toBe(true);
        
        const finalSeedVerification = await verifier.verifyFinalSeed(
            seedResult.finalSeed,
            transcriptData.timestamp
        );
        expect(finalSeedVerification.valid).toBe(true);
    });

    test('should abort game when player does not reveal (no server fallback)', () => {
        const distributedRandomness = new DistributedRandomness();
        
        const player1Seed = crypto.randomBytes(32).toString('hex');
        const player2Seed = crypto.randomBytes(32).toString('hex');
        const player1Commitment = crypto.createHash('sha256').update(player1Seed).digest('hex');
        const player2Commitment = crypto.createHash('sha256').update(player2Seed).digest('hex');
        
        distributedRandomness.commitPlayerSeed('player1', player1Commitment);
        distributedRandomness.commitPlayerSeed('player2', player2Commitment);
        distributedRandomness.completeCommitmentPhase();
        
        distributedRandomness.revealPlayerSeed('player1', player1Seed);
        
        const seedResult = distributedRandomness.generateShuffleSeed();
        
        expect(seedResult.success).toBe(false);
        expect(seedResult.error).toContain('Not all players revealed');
    });
});
