"use strict";
/**
 * Circuit Loader Module
 *
 * This module handles loading real Circom circuit artifacts (.wasm, .zkey, verification keys)
 * for Groth16 proof generation and verification.
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
exports.getCircuitLoader = exports.CircuitLoader = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const snarkjs = __importStar(require("snarkjs"));
const DEFAULT_BUILD_DIR = path.join(__dirname, '..', 'build');
const DEFAULT_CIRCUITS = ['cardCommitment', 'shuffleVerify', 'dealVerify'];
/**
 * CircuitLoader class for managing circuit artifacts
 */
class CircuitLoader {
    constructor(config) {
        this.loadedCircuits = new Map();
        this.artifactPaths = new Map();
        this.buildDir = config?.buildDir || DEFAULT_BUILD_DIR;
    }
    /**
     * Check if circuit artifacts exist for a given circuit
     */
    async circuitExists(circuitName) {
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
        }
        catch {
            return false;
        }
    }
    /**
     * Get paths to circuit artifacts
     */
    getArtifactPaths(circuitName) {
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
    async loadCircuit(circuitName) {
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
            const loadedCircuit = {
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
        }
        catch (error) {
            throw new Error(`Failed to load circuit ${circuitName}: ${error.message}`);
        }
    }
    /**
     * Load all default circuits
     */
    async loadAllCircuits() {
        const results = new Map();
        for (const circuitName of DEFAULT_CIRCUITS) {
            try {
                const circuit = await this.loadCircuit(circuitName);
                results.set(circuitName, circuit);
            }
            catch (error) {
                console.warn(`Warning: Could not load circuit ${circuitName}: ${error.message}`);
            }
        }
        return results;
    }
    /**
     * Generate a proof using real circuit artifacts
     */
    async generateProof(circuitName, inputs) {
        const circuit = await this.loadCircuit(circuitName);
        const paths = this.getArtifactPaths(circuitName);
        try {
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, paths.wasmPath, paths.zkeyPath);
            return { proof, publicSignals };
        }
        catch (error) {
            throw new Error(`Failed to generate proof for ${circuitName}: ${error.message}`);
        }
    }
    /**
     * Verify a proof using real verification key
     */
    async verifyProof(circuitName, proof, publicSignals) {
        const circuit = await this.loadCircuit(circuitName);
        try {
            const isValid = await snarkjs.groth16.verify(circuit.verificationKey, publicSignals, proof);
            return isValid;
        }
        catch (error) {
            console.error(`Proof verification failed for ${circuitName}: ${error.message}`);
            return false;
        }
    }
    /**
     * Get verification key for a circuit
     */
    async getVerificationKey(circuitName) {
        const circuit = await this.loadCircuit(circuitName);
        return circuit.verificationKey;
    }
    /**
     * Check if circuits are compiled and ready
     */
    async checkCircuitsReady() {
        const missing = [];
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
    getCircuitInfo(circuitName) {
        return this.artifactPaths.get(circuitName) || null;
    }
    /**
     * Clear cached circuits
     */
    clearCache() {
        this.loadedCircuits.clear();
        this.artifactPaths.clear();
    }
}
exports.CircuitLoader = CircuitLoader;
/**
 * Singleton instance for convenience
 */
let defaultLoader = null;
function getCircuitLoader(config) {
    if (!defaultLoader) {
        defaultLoader = new CircuitLoader(config);
    }
    return defaultLoader;
}
exports.getCircuitLoader = getCircuitLoader;
exports.default = CircuitLoader;
//# sourceMappingURL=circuitLoader.js.map