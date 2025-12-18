"use strict";
/**
 * Trusted Setup Ceremony for Groth16 SNARK
 *
 * This module implements a secure multi-party trusted setup ceremony
 * that generates the proving and verification keys for poker circuits.
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
exports.TrustedSetupCeremonyManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const sha3_1 = require("@noble/hashes/sha3");
const sha256_1 = require("@noble/hashes/sha256");
/**
 * Trusted Setup Ceremony Manager
 */
class TrustedSetupCeremonyManager {
    constructor(config) {
        this.activeCeremonies = new Map();
        this.participantKeys = new Map(); // participant_id -> public_key
        this.config = {
            minParticipants: 2,
            maxParticipants: 10,
            timeoutMinutes: 60,
            requireUniqueContributions: true,
            verifyEachContribution: true,
            broadcastTranscript: true,
            ...config
        };
    }
    /**
     * Initialize a new trusted setup ceremony
     */
    async initializeCeremony(circuitName, name, description, initiatorId) {
        console.log(`🎭 Initializing trusted setup ceremony for circuit: ${circuitName}`);
        const ceremonyId = this.generateCeremonyId();
        const ceremony = {
            id: ceremonyId,
            name,
            description,
            status: 'initiated',
            startTime: Date.now(),
            participants: [],
            finalContribution: this.generateInitialContribution(),
            verificationKey: null,
            provingKey: null,
            circuitName,
            transcript: {
                events: [],
                finalHash: '',
                participantsHash: ''
            }
        };
        // Add initiator as first participant
        await this.addParticipant(ceremonyId, initiatorId);
        this.activeCeremonies.set(ceremonyId, ceremony);
        await this.recordCeremonyEvent(ceremonyId, 'ceremony-initialized', { circuitName });
        console.log(`✅ Trusted setup ceremony initialized: ${ceremonyId}`);
        return ceremony;
    }
    /**
     * Add a participant to the ceremony
     */
    async addParticipant(ceremonyId, participantId) {
        const ceremony = this.activeCeremonies.get(ceremonyId);
        if (!ceremony) {
            throw new Error(`Ceremony ${ceremonyId} not found`);
        }
        if (ceremony.status !== 'initiated' && ceremony.status !== 'in-progress') {
            throw new Error(`Cannot add participant to ceremony in status: ${ceremony.status}`);
        }
        if (ceremony.participants.length >= this.config.maxParticipants) {
            throw new Error('Maximum participants reached');
        }
        // Check if participant already exists
        const existingParticipant = ceremony.participants.find(p => p.id === participantId);
        if (existingParticipant) {
            throw new Error(`Participant ${participantId} already joined`);
        }
        // Generate participant's public key
        const publicKey = await this.generateParticipantPublicKey(participantId);
        this.participantKeys.set(participantId, publicKey);
        // Add participant to ceremony
        ceremony.participants.push({
            id: participantId,
            publicKey,
            contribution: this.generateEmptyContribution(),
            signature: '',
            timestamp: Date.now()
        });
        ceremony.status = 'in-progress';
        await this.recordCeremonyEvent(ceremonyId, 'participant-joined', { participantId, publicKey });
        console.log(`👤 Participant ${participantId} joined ceremony ${ceremonyId}`);
    }
    /**
     * Make a contribution to the ceremony
     */
    async makeContribution(ceremonyId, participantId, contribution) {
        const ceremony = this.activeCeremonies.get(ceremonyId);
        if (!ceremony) {
            throw new Error(`Ceremony ${ceremonyId} not found`);
        }
        const participant = ceremony.participants.find(p => p.id === participantId);
        if (!participant) {
            throw new Error(`Participant ${participantId} not found in ceremony`);
        }
        // Verify contribution format
        if (!this.validateContribution(contribution)) {
            throw new Error('Invalid contribution format');
        }
        // Check for unique contributions if required
        if (this.config.requireUniqueContributions) {
            const isUnique = await this.verifyContributionUniqueness(ceremony, contribution);
            if (!isUnique) {
                throw new Error('Contribution is not unique');
            }
        }
        // Add contribution to ceremony
        participant.contribution = contribution;
        participant.signature = await this.signContribution(participantId, contribution);
        participant.timestamp = Date.now();
        // Update final contribution
        ceremony.finalContribution = this.aggregateContributions(ceremony.participants);
        await this.recordCeremonyEvent(ceremonyId, 'contribution-made', {
            participantId,
            contributionHash: this.hashContribution(contribution)
        });
        console.log(`🎁 Contribution received from participant ${participantId}`);
        // Check if ceremony can be completed
        if (this.canCompleteCeremony(ceremony)) {
            await this.completeCeremony(ceremonyId);
        }
    }
    /**
     * Complete the ceremony and generate final keys
     */
    async completeCeremony(ceremonyId) {
        const ceremony = this.activeCeremonies.get(ceremonyId);
        if (!ceremony) {
            throw new Error(`Ceremony ${ceremonyId} not found`);
        }
        console.log(`🎯 Completing trusted setup ceremony: ${ceremonyId}`);
        try {
            // Generate final proving and verification keys
            const { provingKey, verificationKey } = await this.generateFinalKeys(ceremony.circuitName, ceremony.finalContribution);
            ceremony.provingKey = provingKey;
            ceremony.verificationKey = verificationKey;
            ceremony.status = 'completed';
            ceremony.endTime = Date.now();
            // Compute final transcript hash
            ceremony.transcript.finalHash = this.computeTranscriptHash(ceremony);
            ceremony.transcript.participantsHash = this.computeParticipantsHash(ceremony.participants);
            await this.recordCeremonyEvent(ceremonyId, 'ceremony-completed', {
                participants: ceremony.participants.length,
                finalHash: ceremony.transcript.finalHash
            });
            console.log(`✅ Ceremony ${ceremonyId} completed successfully`);
            // Optionally save ceremony data
            await this.saveCeremonyData(ceremony);
        }
        catch (error) {
            ceremony.status = 'failed';
            await this.recordCeremonyEvent(ceremonyId, 'ceremony-failed', { error: error.message });
            throw error;
        }
    }
    /**
     * Verify a contribution from a participant
     */
    async verifyContribution(ceremonyId, participantId) {
        const ceremony = this.activeCeremonies.get(ceremonyId);
        if (!ceremony) {
            throw new Error(`Ceremony ${ceremonyId} not found`);
        }
        const participant = ceremony.participants.find(p => p.id === participantId);
        if (!participant) {
            throw new Error(`Participant ${participantId} not found`);
        }
        // Verify signature
        const isSignatureValid = await this.verifySignature(participantId, participant.contribution, participant.signature);
        // Verify contribution format and constraints
        const isContributionValid = this.validateContribution(participant.contribution);
        return isSignatureValid && isContributionValid;
    }
    /**
     * Get ceremony status
     */
    getCeremonyStatus(ceremonyId) {
        return this.activeCeremonies.get(ceremonyId) || null;
    }
    /**
     * List all active ceremonies
     */
    listActiveCeremonies() {
        return Array.from(this.activeCeremonies.values()).filter(c => c.status === 'initiated' || c.status === 'in-progress');
    }
    /**
     * Clean up timed-out ceremonies
     */
    cleanupTimedOutCeremonies() {
        const now = Date.now();
        const timeout = this.config.timeoutMinutes * 60 * 1000;
        let cleaned = 0;
        for (const [id, ceremony] of this.activeCeremonies.entries()) {
            if (ceremony.status === 'in-progress' &&
                now - ceremony.startTime > timeout) {
                ceremony.status = 'failed';
                cleaned++;
            }
        }
        return cleaned;
    }
    // Helper methods
    /**
     * Generate ceremony ID
     */
    generateCeremonyId() {
        return `ceremony-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    }
    /**
     * Generate initial ceremony contribution
     */
    generateInitialContribution() {
        const generateRandomField = () => {
            const randomBytes = crypto.randomBytes(32);
            const seed = `${Date.now()}-${randomBytes.toString('hex')}`;
            const hash = (0, sha256_1.sha256)(seed);
            return BigInt('0x' + Buffer.from(hash).toString('hex')).toString();
        };
        return {
            tau: generateRandomField(),
            alpha: generateRandomField(),
            beta: generateRandomField(),
            gamma: generateRandomField(),
            delta: generateRandomField(),
            circuitSpecific: {}
        };
    }
    /**
     * Generate empty contribution placeholder
     */
    generateEmptyContribution() {
        return {
            tau: '',
            alpha: '',
            beta: '',
            gamma: '',
            delta: '',
            circuitSpecific: {}
        };
    }
    /**
     * Generate participant public key
     */
    async generateParticipantPublicKey(participantId) {
        // Simplified: in reality, this would use proper cryptographic key generation
        const keyMaterial = `participant-${participantId}-${Date.now()}`;
        return (0, sha3_1.sha3_256)(keyMaterial).toString();
    }
    /**
     * Validate contribution format
     */
    validateContribution(contribution) {
        // Check that all required fields are present and properly formatted
        const fields = ['tau', 'alpha', 'beta', 'gamma', 'delta'];
        for (const field of fields) {
            if (typeof contribution[field] !== 'string' ||
                contribution[field] === '') {
                return false;
            }
        }
        return true;
    }
    /**
     * Verify contribution uniqueness
     */
    async verifyContributionUniqueness(ceremony, newContribution) {
        const newHash = this.hashContribution(newContribution);
        for (const participant of ceremony.participants) {
            if (participant.contribution.tau) { // Check only completed contributions
                const existingHash = this.hashContribution(participant.contribution);
                if (newHash === existingHash) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * Sign a contribution
     */
    async signContribution(participantId, contribution) {
        // Simplified signature - in reality would use proper cryptographic signing
        const data = JSON.stringify(contribution) + participantId;
        return (0, sha3_1.sha3_256)(data).toString();
    }
    /**
     * Verify signature
     */
    async verifySignature(participantId, contribution, signature) {
        const expectedSignature = await this.signContribution(participantId, contribution);
        return signature === expectedSignature;
    }
    /**
     * Aggregate contributions from all participants
     */
    aggregateContributions(participants) {
        const result = {
            tau: '0',
            alpha: '0',
            beta: '0',
            gamma: '0',
            delta: '0',
            circuitSpecific: {}
        };
        // In reality, this would perform proper elliptic curve point addition
        // For demo, we'll just concatenate the contributions
        for (const participant of participants) {
            if (participant.contribution.tau) {
                result.tau += participant.contribution.tau;
                result.alpha += participant.contribution.alpha;
                result.beta += participant.contribution.beta;
                result.gamma += participant.contribution.gamma;
                result.delta += participant.contribution.delta;
            }
        }
        return result;
    }
    /**
     * Hash a contribution
     */
    hashContribution(contribution) {
        return (0, sha3_1.sha3_256)(JSON.stringify(contribution)).toString();
    }
    /**
     * Check if ceremony can be completed
     */
    canCompleteCeremony(ceremony) {
        return ceremony.participants.length >= this.config.minParticipants &&
            ceremony.participants.every(p => p.contribution.tau);
    }
    /**
     * Generate final proving and verification keys
     */
    async generateFinalKeys(circuitName, finalContribution) {
        // In a real implementation, this would:
        // 1. Use the final contribution to derive the toxic waste
        // 2. Generate proving and verification keys using the circuit
        // 3. Ensure the keys are properly formatted for snarkjs
        // Simplified key generation for demo
        const provingKey = {
            protocol: 'groth16',
            curve: 'bn128',
            nPublic: 52, // Example for poker circuits
            // ... actual key components would be generated here
        };
        const verificationKey = {
            alpha: [finalContribution.alpha, '1'],
            beta: [finalContribution.beta, '1'],
            gamma: [finalContribution.gamma, '1'],
            delta: [finalContribution.delta, '1'],
            ic: Array(53).fill(0).map(() => [finalContribution.tau, '1'])
        };
        return { provingKey, verificationKey };
    }
    /**
     * Record ceremony event
     */
    async recordCeremonyEvent(ceremonyId, type, data) {
        const ceremony = this.activeCeremonies.get(ceremonyId);
        if (!ceremony)
            return;
        const event = {
            timestamp: Date.now(),
            type,
            data,
            signature: (0, sha3_1.sha3_256)(JSON.stringify(data) + ceremonyId).toString()
        };
        ceremony.transcript.events.push(event);
    }
    /**
     * Compute transcript hash
     */
    computeTranscriptHash(ceremony) {
        const transcriptData = {
            events: ceremony.transcript.events,
            participants: ceremony.participants,
            finalContribution: ceremony.finalContribution
        };
        return (0, sha3_1.sha3_256)(JSON.stringify(transcriptData)).toString();
    }
    /**
     * Compute participants hash
     */
    computeParticipantsHash(participants) {
        const participantsData = participants.map(p => ({
            id: p.id,
            publicKey: p.publicKey,
            timestamp: p.timestamp
        }));
        return (0, sha3_1.sha3_256)(JSON.stringify(participantsData)).toString();
    }
    /**
     * Save ceremony data
     */
    async saveCeremonyData(ceremony) {
        try {
            const filename = `ceremony-${ceremony.id}.json`;
            const filepath = path.join('/workspace/code/groth16-snark', 'ceremonies', filename);
            await fs.mkdir(path.dirname(filepath), { recursive: true });
            await fs.writeFile(filepath, JSON.stringify(ceremony, null, 2));
            console.log(`💾 Ceremony data saved: ${filepath}`);
        }
        catch (error) {
            console.warn('Failed to save ceremony data:', error);
        }
    }
    /**
     * Load ceremony data
     */
    async loadCeremonyData(ceremonyId) {
        try {
            const filename = `ceremony-${ceremonyId}.json`;
            const filepath = path.join('/workspace/code/groth16-snark', 'ceremonies', filename);
            const data = await fs.readFile(filepath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Get ceremony statistics
     */
    getStatistics() {
        const activeCeremonies = this.listActiveCeremonies().length;
        const completedCeremonies = Array.from(this.activeCeremonies.values())
            .filter(c => c.status === 'completed').length;
        const failedCeremonies = Array.from(this.activeCeremonies.values())
            .filter(c => c.status === 'failed').length;
        const totalParticipants = Array.from(this.activeCeremonies.values())
            .reduce((sum, c) => sum + c.participants.length, 0);
        return {
            activeCeremonies,
            completedCeremonies,
            failedCeremonies,
            totalParticipants
        };
    }
}
exports.TrustedSetupCeremonyManager = TrustedSetupCeremonyManager;
exports.default = TrustedSetupCeremonyManager;
//# sourceMappingURL=trustedSetup.js.map