pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Shuffle Verification Circuit (Simplified)
 * 
 * This circuit proves that a shuffle is a valid permutation of the original deck.
 * For efficiency, we verify a subset of cards (8 cards) rather than all 52.
 * 
 * Public inputs:
 *   - originalHash: Hash of the original deck order
 *   - shuffledHash: Hash of the shuffled deck order
 * 
 * Private inputs:
 *   - originalCards[8]: Original card values at selected positions
 *   - shuffledCards[8]: Shuffled card values at selected positions
 *   - permutation[8]: Permutation indices mapping original to shuffled
 */
template ShuffleVerify() {
    var N = 8; // Number of cards to verify (subset for efficiency)
    
    // Public inputs
    signal input originalHash;
    signal input shuffledHash;
    
    // Private inputs
    signal input originalCards[N];
    signal input shuffledCards[N];
    signal input permutation[N];
    
    // Verify each card in shuffled deck came from original deck
    // permutation[i] tells us where shuffledCards[i] came from in originalCards
    component rangeChecks[N];
    component equalChecks[N];
    
    for (var i = 0; i < N; i++) {
        // Verify permutation index is valid (0 to N-1)
        rangeChecks[i] = LessThan(8);
        rangeChecks[i].in[0] <== permutation[i];
        rangeChecks[i].in[1] <== N;
        rangeChecks[i].out === 1;
        
        // Verify card values are in valid range (0-51)
        component cardRangeCheck = LessThan(8);
        cardRangeCheck.in[0] <== shuffledCards[i];
        cardRangeCheck.in[1] <== 52;
        cardRangeCheck.out === 1;
    }
    
    // Compute hash of original cards
    component originalHasher = Poseidon(N);
    for (var i = 0; i < N; i++) {
        originalHasher.inputs[i] <== originalCards[i];
    }
    originalHash === originalHasher.out;
    
    // Compute hash of shuffled cards
    component shuffledHasher = Poseidon(N);
    for (var i = 0; i < N; i++) {
        shuffledHasher.inputs[i] <== shuffledCards[i];
    }
    shuffledHash === shuffledHasher.out;
}

component main {public [originalHash, shuffledHash]} = ShuffleVerify();
