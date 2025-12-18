/**
 * Circuit Loader Module
 * 
 * This module handles loading real Circom circuit artifacts (.wasm, .zkey, verification keys)
 * for Groth16 proof generation and verification.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as snarkjs from 'snarkjs';

export interface CircuitArtifacts {
    wasmPath: string;
    zkeyPath: string;
    verificationKey: any;
    circuitName: string;
    loaded: boolean;
}

export interface LoadedCircuit {
    wasm: Buffer;
    zkey: Buffer;
    verificationKey: any;
    circuitName: string;
}

export interface CircuitConfig {
    buildDir: string;
    circuits: string[];
}

const DEFAULT_BUILD_DIR = path.join(__dirname, '..', 'build');
const DEFAULT_CIRCUITS = ['cardCommitment', 'shuffleVerify', 'dealVerify'];

/**
 * CircuitLoader class for managing circuit artifacts
 */
export class CircuitLoader {
    private buildDir: string;
    private loadedCircuits: Map<string, LoadedCircuit> = new Map();
    private artifactPaths: Map<string, CircuitArtifacts> = new Map();

    constructor(config?: Partial<CircuitConfig>) {
        this.buildDir = config?.buildDir || DEFAULT_BUILD_DIR;
    }

    /**
     * Check if circuit artifacts exist for a given circuit
     */
    async circuitExists(circuitName: string): Promise<boolean> {
        const circuitDir = path.join(this.buildDir, circuitName);
        const wasmPath = path.join(circuitDir, `${circuitName}_js`, `${circuitName}.wasm`);
        const zkeyPath = path.join(circuitDir, `${circuitName}_final.zkey`);
        const vkPath = path.join(circuitDir, 'verification_key.json');

        try {
            await Promise.all([
                fs.access(wasmPath),
                fs.access(zkeyPath),
                fs.access(vkPath)
            ]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get paths to circuit artifacts
     */
    getArtifactPaths(circuitName: string): CircuitArtifacts {
        const circuitDir = path.join(this.buildDir, circuitName);
        return {
            wasmPath: path.join(circuitDir, `${circuitName}_js`, `${circuitName}.wasm`),
            zkeyPath: path.join(circuitDir, `${circuitName}_final.zkey`),
            verificationKey: null,
            circuitName,
            loaded: false
        };
    }

    /**
     * Load circuit artifacts from disk
     */
    async loadCircuit(circuitName: string): Promise<LoadedCircuit> {
        // Check if already loaded
        const cached = this.loadedCircuits.get(circuitName);
        if (cached) {
            return cached;
        }

        const paths = this.getArtifactPaths(circuitName);

        try {
            // Load all artifacts
            const [wasm, zkey, vkJson] = await Promise.all([
                fs.readFile(paths.wasmPath),
                fs.readFile(paths.zkeyPath),
                fs.readFile(path.join(this.buildDir, circuitName, 'verification_key.json'), 'utf-8')
            ]);

            const verificationKey = JSON.parse(vkJson);

            const loadedCircuit: LoadedCircuit = {
                wasm,
                zkey,
                verificationKey,
                circuitName
            };

            // Cache the loaded circuit
            this.loadedCircuits.set(circuitName, loadedCircuit);
            this.artifactPaths.set(circuitName, {
                ...paths,
                verificationKey,
                loaded: true
            });

            console.log(`Loaded circuit artifacts for: ${circuitName}`);
            return loadedCircuit;
        } catch (error) {
            throw new Error(`Failed to load circuit ${circuitName}: ${error.message}`);
        }
    }

    /**
     * Load all default circuits
     */
    async loadAllCircuits(): Promise<Map<string, LoadedCircuit>> {
        const results = new Map<string, LoadedCircuit>();

        for (const circuitName of DEFAULT_CIRCUITS) {
            try {
                const circuit = await this.loadCircuit(circuitName);
                results.set(circuitName, circuit);
            } catch (error) {
                console.warn(`Warning: Could not load circuit ${circuitName}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Generate a proof using real circuit artifacts
     */
    async generateProof(
        circuitName: string,
        inputs: { [key: string]: any }
    ): Promise<{ proof: any; publicSignals: any[] }> {
        const circuit = await this.loadCircuit(circuitName);
        const paths = this.getArtifactPaths(circuitName);

        try {
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                inputs,
                paths.wasmPath,
                paths.zkeyPath
            );

            return { proof, publicSignals };
        } catch (error) {
            throw new Error(`Failed to generate proof for ${circuitName}: ${error.message}`);
        }
    }

    /**
     * Verify a proof using real verification key
     */
    async verifyProof(
        circuitName: string,
        proof: any,
        publicSignals: any[]
    ): Promise<boolean> {
        const circuit = await this.loadCircuit(circuitName);

        try {
            const isValid = await snarkjs.groth16.verify(
                circuit.verificationKey,
                publicSignals,
                proof
            );

            return isValid;
        } catch (error) {
            console.error(`Proof verification failed for ${circuitName}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get verification key for a circuit
     */
    async getVerificationKey(circuitName: string): Promise<any> {
        const circuit = await this.loadCircuit(circuitName);
        return circuit.verificationKey;
    }

    /**
     * Check if circuits are compiled and ready
     */
    async checkCircuitsReady(): Promise<{ ready: boolean; missing: string[] }> {
        const missing: string[] = [];

        for (const circuitName of DEFAULT_CIRCUITS) {
            const exists = await this.circuitExists(circuitName);
            if (!exists) {
                missing.push(circuitName);
            }
        }

        return {
            ready: missing.length === 0,
            missing
        };
    }

    /**
     * Get circuit info
     */
    getCircuitInfo(circuitName: string): CircuitArtifacts | null {
        return this.artifactPaths.get(circuitName) || null;
    }

    /**
     * Clear cached circuits
     */
    clearCache(): void {
        this.loadedCircuits.clear();
        this.artifactPaths.clear();
    }
}

/**
 * Singleton instance for convenience
 */
let defaultLoader: CircuitLoader | null = null;

export function getCircuitLoader(config?: Partial<CircuitConfig>): CircuitLoader {
    if (!defaultLoader) {
        defaultLoader = new CircuitLoader(config);
    }
    return defaultLoader;
}

export default CircuitLoader;
