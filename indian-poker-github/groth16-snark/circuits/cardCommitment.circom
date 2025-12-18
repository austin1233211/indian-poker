pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Card Commitment Circuit
 * 
 * This circuit proves that a commitment was correctly computed from a card value
 * without revealing the actual card value.
 * 
 * Public inputs:
 *   - commitment: The Poseidon hash commitment
 * 
 * Private inputs:
 *   - cardValue: The card value (0-51)
 *   - nonce: Random nonce used in commitment
 */
template CardCommitment() {
    // Public inputs
    signal input commitment;
    
    // Private inputs
    signal input cardValue;
    signal input nonce;
    
    // Verify card value is in valid range (0-51)
    component rangeCheck = LessThan(8);
    rangeCheck.in[0] <== cardValue;
    rangeCheck.in[1] <== 52;
    rangeCheck.out === 1;
    
    // Compute commitment using Poseidon hash
    component hasher = Poseidon(2);
    hasher.inputs[0] <== cardValue;
    hasher.inputs[1] <== nonce;
    
    // Verify commitment matches
    commitment === hasher.out;
}

component main {public [commitment]} = CardCommitment();
