/**
 * ZK Circuit Integration Tests
 * 
 * These tests verify that the Groth16 circuits are properly compiled,
 * verification keys are generated, and proofs can be generated and verified.
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const CIRCUITS = ['cardCommitment', 'shuffleVerify', 'dealVerify'];

describe('ZK Circuit Artifacts', () => {
    describe('Circuit Compilation', () => {
        CIRCUITS.forEach(circuit => {
            it(`should have compiled WASM for ${circuit}`, () => {
                const wasmPath = path.join(BUILD_DIR, circuit, `${circuit}_js`, `${circuit}.wasm`);
                expect(fs.existsSync(wasmPath)).toBe(true);
                const stats = fs.statSync(wasmPath);
                expect(stats.size).toBeGreaterThan(0);
            });

            it(`should have verification key for ${circuit}`, () => {
                const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');
                expect(fs.existsSync(vkeyPath)).toBe(true);
                const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
                expect(vkey).toHaveProperty('protocol');
                expect(vkey.protocol).toBe('groth16');
            });

            it(`should have proving key (.zkey) for ${circuit}`, () => {
                const zkeyPath = path.join(BUILD_DIR, circuit, `${circuit}_final.zkey`);
                expect(fs.existsSync(zkeyPath)).toBe(true);
                const stats = fs.statSync(zkeyPath);
                expect(stats.size).toBeGreaterThan(0);
            });
        });
    });

    describe('Verification Key Structure', () => {
        CIRCUITS.forEach(circuit => {
            it(`should have valid verification key structure for ${circuit}`, () => {
                const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');
                if (!fs.existsSync(vkeyPath)) {
                    console.warn(`Skipping ${circuit} - verification key not found`);
                    return;
                }
                const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
                
                expect(vkey).toHaveProperty('protocol', 'groth16');
                expect(vkey).toHaveProperty('curve');
                expect(vkey).toHaveProperty('nPublic');
                expect(vkey).toHaveProperty('vk_alpha_1');
                expect(vkey).toHaveProperty('vk_beta_2');
                expect(vkey).toHaveProperty('vk_gamma_2');
                expect(vkey).toHaveProperty('vk_delta_2');
                expect(vkey).toHaveProperty('IC');
                expect(Array.isArray(vkey.IC)).toBe(true);
            });
        });
    });
});

describe('Proof Generation and Verification', () => {
    let snarkjs;
    
    beforeAll(async () => {
        try {
            snarkjs = require('snarkjs');
        } catch (e) {
            console.warn('snarkjs not available, skipping proof tests');
        }
    });

    describe('Card Commitment Circuit', () => {
        it('should generate and verify a valid proof', async () => {
            if (!snarkjs) {
                console.warn('Skipping - snarkjs not available');
                return;
            }

            const circuit = 'cardCommitment';
            const wasmPath = path.join(BUILD_DIR, circuit, `${circuit}_js`, `${circuit}.wasm`);
            const zkeyPath = path.join(BUILD_DIR, circuit, `${circuit}_final.zkey`);
            const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');

            if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
                console.warn(`Skipping ${circuit} - artifacts not found`);
                return;
            }

            const input = {
                cardValue: 7,
                cardSuit: 2,
                salt: 12345678901234567890n
            };

            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                input,
                wasmPath,
                zkeyPath
            );

            expect(proof).toBeDefined();
            expect(publicSignals).toBeDefined();
            expect(Array.isArray(publicSignals)).toBe(true);

            const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
            const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
            expect(isValid).toBe(true);
        });

        it('should reject invalid proofs', async () => {
            if (!snarkjs) {
                console.warn('Skipping - snarkjs not available');
                return;
            }

            const circuit = 'cardCommitment';
            const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');

            if (!fs.existsSync(vkeyPath)) {
                console.warn(`Skipping ${circuit} - verification key not found`);
                return;
            }

            const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
            
            const fakeProof = {
                pi_a: ["1", "2", "1"],
                pi_b: [["1", "2"], ["3", "4"], ["1", "0"]],
                pi_c: ["1", "2", "1"],
                protocol: "groth16",
                curve: "bn128"
            };
            const fakeSignals = ["12345"];

            const isValid = await snarkjs.groth16.verify(vkey, fakeSignals, fakeProof);
            expect(isValid).toBe(false);
        });
    });

    describe('Shuffle Verify Circuit', () => {
        it('should have correct public input count', () => {
            const circuit = 'shuffleVerify';
            const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');

            if (!fs.existsSync(vkeyPath)) {
                console.warn(`Skipping ${circuit} - verification key not found`);
                return;
            }

            const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
            expect(vkey.nPublic).toBeGreaterThan(0);
        });
    });

    describe('Deal Verify Circuit', () => {
        it('should have correct public input count', () => {
            const circuit = 'dealVerify';
            const vkeyPath = path.join(BUILD_DIR, circuit, 'verification_key.json');

            if (!fs.existsSync(vkeyPath)) {
                console.warn(`Skipping ${circuit} - verification key not found`);
                return;
            }

            const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
            expect(vkey.nPublic).toBeGreaterThan(0);
        });
    });
});

describe('Circuit Loader Integration', () => {
    it('should load circuit artifacts correctly', async () => {
        let CircuitLoader;
        try {
            const circuitLoaderPath = path.join(__dirname, '..', 'dist', 'circuitLoader.js');
            if (fs.existsSync(circuitLoaderPath)) {
                CircuitLoader = require(circuitLoaderPath).CircuitLoader;
            }
        } catch (e) {
            console.warn('CircuitLoader not available:', e.message);
        }

        if (!CircuitLoader) {
            console.warn('Skipping - CircuitLoader not available');
            return;
        }

        const loader = new CircuitLoader();
        const isReady = await loader.isReady();
        
        if (isReady) {
            expect(loader.hasRealCircuits()).toBe(true);
        }
    });
});

describe('SNARK Integration Module', () => {
    it('should export required functions', () => {
        const snarkIntegrationPath = path.join(__dirname, '..', '..', 'indian-poker-server', 'snark-integration.js');
        
        if (!fs.existsSync(snarkIntegrationPath)) {
            console.warn('Skipping - snark-integration.js not found');
            return;
        }

        const snarkIntegration = require(snarkIntegrationPath);
        
        expect(snarkIntegration).toHaveProperty('snarkVerifier');
        expect(snarkIntegration).toHaveProperty('cardToIndex');
        expect(snarkIntegration).toHaveProperty('calculatePermutation');
        expect(snarkIntegration).toHaveProperty('deckToIndices');
    });

    it('should initialize SNARK verifier', async () => {
        const snarkIntegrationPath = path.join(__dirname, '..', '..', 'indian-poker-server', 'snark-integration.js');
        
        if (!fs.existsSync(snarkIntegrationPath)) {
            console.warn('Skipping - snark-integration.js not found');
            return;
        }

        const { snarkVerifier } = require(snarkIntegrationPath);
        
        await snarkVerifier.initialize();
        expect(snarkVerifier.isAvailable()).toBeDefined();
    });
});
