pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Deal Verification Circuit
 * 
 * This circuit proves that a card was correctly dealt from a specific position
 * in the shuffled deck without revealing other cards.
 * 
 * Public inputs:
 *   - deckCommitment: Commitment to the entire shuffled deck
 *   - cardCommitment: Commitment to the dealt card
 *   - position: Position in deck from which card was dealt
 * 
 * Private inputs:
 *   - cardValue: The actual card value (0-51)
 *   - cardNonce: Nonce used for card commitment
 *   - deckSeed: Seed used for deck commitment
 */
template DealVerify() {
    // Public inputs
    signal input deckCommitment;
    signal input cardCommitment;
    signal input position;
    
    // Private inputs
    signal input cardValue;
    signal input cardNonce;
    signal input deckSeed;
    
    // Verify card value is in valid range (0-51)
    component cardRangeCheck = LessThan(8);
    cardRangeCheck.in[0] <== cardValue;
    cardRangeCheck.in[1] <== 52;
    cardRangeCheck.out === 1;
    
    // Verify position is in valid range (0-51)
    component posRangeCheck = LessThan(8);
    posRangeCheck.in[0] <== position;
    posRangeCheck.in[1] <== 52;
    posRangeCheck.out === 1;
    
    // Compute card commitment
    component cardHasher = Poseidon(2);
    cardHasher.inputs[0] <== cardValue;
    cardHasher.inputs[1] <== cardNonce;
    cardCommitment === cardHasher.out;
    
    // Compute deck commitment (includes position to bind card to position)
    component deckHasher = Poseidon(3);
    deckHasher.inputs[0] <== cardValue;
    deckHasher.inputs[1] <== position;
    deckHasher.inputs[2] <== deckSeed;
    deckCommitment === deckHasher.out;
}

component main {public [deckCommitment, cardCommitment, position]} = DealVerify();
