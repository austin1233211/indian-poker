# SNARK Trusted Setup Documentation

This document describes the trusted setup process for the SNARK (Succinct Non-interactive ARgument of Knowledge) proof system used in Indian Poker for verifiable fairness.

## Overview

The Indian Poker server uses SNARK proofs to provide cryptographic guarantees that card shuffling and dealing are performed fairly. The trusted setup is a one-time ceremony that generates the proving and verification keys required for the SNARK system.

## Trusted Setup Components

### Proving Key (pk)
The proving key is used by the server to generate proofs for shuffle and dealing operations. This key is kept on the server and is used during game execution.

### Verification Key (vk)
The verification key is distributed to clients and allows them to verify proofs without needing to trust the server. This key should be publicly available and can be embedded in client applications.

## Setup Ceremony

### Phase 1: Powers of Tau
The first phase generates random powers of a secret value tau. This phase is circuit-agnostic and can be reused across different SNARK applications.

The ceremony uses the following parameters:
- Curve: BN254 (also known as BN128)
- Maximum constraint count: 2^20 (approximately 1 million constraints)

### Phase 2: Circuit-Specific Setup
The second phase incorporates the specific circuit constraints for shuffle and dealing verification.

Circuits used:
1. **Shuffle Circuit**: Verifies that a permutation was applied correctly to the deck
2. **Dealing Circuit**: Verifies that cards were dealt according to the committed order

## Security Considerations

### Multi-Party Computation (MPC)
For production deployments, the trusted setup should be performed using a multi-party computation ceremony where multiple independent parties contribute randomness. As long as at least one participant is honest and destroys their toxic waste, the setup is secure.

### Toxic Waste
The random values used during setup (often called "toxic waste") must be securely destroyed after the ceremony. If these values are compromised, an attacker could generate false proofs.

### Verification
After setup completion:
1. Verify the setup transcript is consistent
2. Verify the final parameters match the expected circuit
3. Publish the verification key for public audit

## Current Implementation Status

The Indian Poker server currently uses a simulated SNARK system for development purposes. For production deployment:

1. **Generate Real Parameters**: Run a proper trusted setup ceremony
2. **Distribute Verification Keys**: Embed vk in client applications
3. **Secure Proving Keys**: Store pk securely on the server
4. **Enable Verification**: Allow clients to verify proofs independently

## File Locations

When properly configured, the SNARK files should be located at:
- Proving Key: `./snark/proving_key.bin`
- Verification Key: `./snark/verification_key.json`
- Circuit Definition: `./snark/circuit.r1cs`

## Verification Process

Clients can verify proofs using the following steps:

1. Receive proof from server (included in game state)
2. Load the public verification key
3. Extract public inputs (deck commitment, dealt cards)
4. Call the verification function with (vk, proof, public_inputs)
5. Verification returns true if the proof is valid

## Proof Types

### Shuffle Proof
Proves that the shuffled deck is a valid permutation of the original deck.

Public inputs:
- Original deck commitment
- Shuffled deck commitment
- Permutation commitment

### Dealing Proof
Proves that cards were dealt according to the committed deck order.

Public inputs:
- Shuffled deck commitment
- Dealt card positions
- Player assignments

## Recommendations for Production

1. **Conduct Public Ceremony**: Invite community members to participate in the trusted setup
2. **Publish Transcripts**: Make all ceremony transcripts publicly available
3. **Multiple Implementations**: Use multiple independent implementations to verify setup correctness
4. **Regular Audits**: Have the SNARK circuits audited by cryptography experts
5. **Fallback Mechanism**: Implement fallback verification methods in case SNARK verification fails

## References

- Groth16: On the Size of Pairing-based Non-interactive Arguments
- Zcash Powers of Tau Ceremony
- snarkjs Documentation
- circom Circuit Compiler

## Contact

For questions about the trusted setup or to participate in future ceremonies, please open an issue on the GitHub repository.
