/**
 * Circuit Loader Module
 *
 * This module handles loading real Circom circuit artifacts (.wasm, .zkey, verification keys)
 * for Groth16 proof generation and verification.
 */
/// <reference types="node" />
/// <reference types="node" />
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
/**
 * CircuitLoader class for managing circuit artifacts
 */
export declare class CircuitLoader {
    private buildDir;
    private loadedCircuits;
    private artifactPaths;
    constructor(config?: Partial<CircuitConfig>);
    /**
     * Check if circuit artifacts exist for a given circuit
     */
    circuitExists(circuitName: string): Promise<boolean>;
    /**
     * Get paths to circuit artifacts
     */
    getArtifactPaths(circuitName: string): CircuitArtifacts;
    /**
     * Load circuit artifacts from disk
     */
    loadCircuit(circuitName: string): Promise<LoadedCircuit>;
    /**
     * Load all default circuits
     */
    loadAllCircuits(): Promise<Map<string, LoadedCircuit>>;
    /**
     * Generate a proof using real circuit artifacts
     */
    generateProof(circuitName: string, inputs: {
        [key: string]: any;
    }): Promise<{
        proof: any;
        publicSignals: any[];
    }>;
    /**
     * Verify a proof using real verification key
     */
    verifyProof(circuitName: string, proof: any, publicSignals: any[]): Promise<boolean>;
    /**
     * Get verification key for a circuit
     */
    getVerificationKey(circuitName: string): Promise<any>;
    /**
     * Check if circuits are compiled and ready
     */
    checkCircuitsReady(): Promise<{
        ready: boolean;
        missing: string[];
    }>;
    /**
     * Get circuit info
     */
    getCircuitInfo(circuitName: string): CircuitArtifacts | null;
    /**
     * Clear cached circuits
     */
    clearCache(): void;
}
export declare function getCircuitLoader(config?: Partial<CircuitConfig>): CircuitLoader;
export default CircuitLoader;
//# sourceMappingURL=circuitLoader.d.ts.map