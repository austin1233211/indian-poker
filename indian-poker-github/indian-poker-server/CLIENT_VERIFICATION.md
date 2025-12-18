# Client-Side Verification Library Documentation

This document describes how clients can independently verify the cryptographic fairness of Indian Poker games without trusting the server.

## Overview

The Indian Poker server provides multiple verification mechanisms that allow clients to cryptographically verify that games are conducted fairly. This document explains how to implement client-side verification.

## Verification Types

### 1. Deck Commitment Verification

Before cards are dealt, the server commits to the deck order by publishing a hash. At game end, the full deck is revealed, allowing clients to verify the commitment.

```javascript
function verifyDeckCommitment(revealedDeck, nonce, expectedCommitment) {
    const serializedDeck = revealedDeck.map(card => 
        `${card.suit}:${card.rank}`
    ).join('|');
    
    const dataToHash = serializedDeck + ':' + nonce;
    const computedHash = sha256(dataToHash);
    
    return computedHash === expectedCommitment;
}
```

### 2. Card Position Verification

Verify that your card matches the committed deck order based on your seat index.

```javascript
function verifyCardPosition(revealedDeck, seatIndex, receivedCard) {
    const expectedCard = revealedDeck[seatIndex];
    return expectedCard.suit === receivedCard.suit && 
           expectedCard.rank === receivedCard.rank;
}
```

### 3. Dealing Order Verification

Verify that the dealing order was generated unpredictably using the game secret.

```javascript
function verifyDealingOrder(dealingOrder, dealingSeed, playerCount) {
    // Reconstruct the expected dealing order from the seed
    const indices = Array.from({ length: playerCount }, (_, i) => i);
    
    for (let i = indices.length - 1; i > 0; i--) {
        const seedPart = dealingSeed.substring((i * 4) % 60, (i * 4) % 60 + 4);
        const j = parseInt(seedPart, 16) % (i + 1);
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    return JSON.stringify(indices) === JSON.stringify(dealingOrder);
}
```

### 4. SNARK Proof Verification

For games with SNARK proofs enabled, clients can verify shuffle and dealing proofs.

```javascript
async function verifySNARKProof(proof, publicInputs, verificationKey) {
    // Load the verification key (should be embedded in client)
    const vk = await loadVerificationKey(verificationKey);
    
    // Verify the proof
    const isValid = await snarkjs.groth16.verify(vk, publicInputs, proof);
    
    return isValid;
}
```

### 5. Distributed Randomness Verification

Verify that the shuffle seed was derived from all players' contributions.

```javascript
function verifyDistributedRandomness(playerCommitments, playerReveals, finalSeed) {
    // Verify each player's reveal matches their commitment
    for (const [playerId, reveal] of Object.entries(playerReveals)) {
        const expectedCommitment = sha256(reveal);
        if (expectedCommitment !== playerCommitments[playerId]) {
            return { valid: false, error: `Player ${playerId} commitment mismatch` };
        }
    }
    
    // Verify final seed is derived from all reveals
    const sortedReveals = Object.keys(playerReveals)
        .sort()
        .map(id => playerReveals[id])
        .join(':');
    
    const expectedSeed = sha256(sortedReveals);
    
    return { 
        valid: expectedSeed === finalSeed,
        error: expectedSeed !== finalSeed ? 'Final seed mismatch' : null
    };
}
```

### 6. Checkpoint Verification

Verify game state integrity using checkpoints created during gameplay.

```javascript
function verifyCheckpoint(checkpoint, currentState) {
    const stateHash = sha256(JSON.stringify({
        deckCommitment: currentState.deckCommitment,
        dealtCards: currentState.dealtCards,
        playerCount: currentState.playerCount,
        currentRound: currentState.currentRound
    }));
    
    return {
        valid: currentState.deckCommitment === checkpoint.state.deckCommitment,
        stateHashMatch: stateHash === checkpoint.stateHash,
        tampering: currentState.deckCommitment !== checkpoint.state.deckCommitment
    };
}
```

## WebSocket API for Verification

### Request Proofs
```javascript
ws.send(JSON.stringify({
    type: 'get_proofs'
}));
```

### Verify Proof Server-Side
```javascript
ws.send(JSON.stringify({
    type: 'verify_proof',
    data: {
        proofType: 'shuffle', // or 'dealing'
        proof: proofData
    }
}));
```

### Create Checkpoint
```javascript
ws.send(JSON.stringify({
    type: 'create_checkpoint'
}));
```

### Verify Checkpoint
```javascript
ws.send(JSON.stringify({
    type: 'verify_checkpoint',
    data: {
        checkpointId: 'checkpoint-id-here'
    }
}));
```

### Get Security Statistics
```javascript
ws.send(JSON.stringify({
    type: 'get_security_stats'
}));
```

## Complete Verification Flow

### During Game Setup
1. Connect to server and receive `connection_established`
2. Join room and wait for game start
3. Receive `game_started` with deck commitment hash
4. Store the commitment for later verification

### During Gameplay
1. Periodically create checkpoints using `create_checkpoint`
2. Verify checkpoints haven't been tampered with
3. Monitor for any security alerts

### At Game End
1. Receive `game_ended` with deck reveal
2. Verify deck commitment matches revealed deck
3. Verify your card position matches the committed order
4. If SNARK proofs available, verify shuffle and dealing proofs
5. If distributed randomness was used, verify the seed derivation

## Implementation Example

```javascript
class IndianPokerVerifier {
    constructor() {
        this.deckCommitment = null;
        this.checkpoints = [];
    }
    
    onGameStarted(data) {
        this.deckCommitment = data.deckCommitmentHash;
        this.gameId = data.gameId;
    }
    
    onGameEnded(data) {
        const verification = this.verifyGame(data);
        console.log('Game verification result:', verification);
        return verification;
    }
    
    verifyGame(gameEndData) {
        const results = {
            deckCommitment: false,
            cardPosition: false,
            dealingOrder: false,
            snarkProofs: null,
            overall: false
        };
        
        // Verify deck commitment
        if (gameEndData.deckReveal) {
            results.deckCommitment = this.verifyDeckCommitment(
                gameEndData.deckReveal.deck,
                gameEndData.deckReveal.nonce,
                this.deckCommitment
            );
        }
        
        // Verify card position
        if (gameEndData.yourCard && gameEndData.deckReveal) {
            results.cardPosition = this.verifyCardPosition(
                gameEndData.deckReveal.deck,
                gameEndData.yourSeatIndex,
                gameEndData.yourCard
            );
        }
        
        // Verify dealing order
        if (gameEndData.dealingOrder && gameEndData.dealingSeed) {
            results.dealingOrder = this.verifyDealingOrder(
                gameEndData.dealingOrder,
                gameEndData.dealingSeed,
                gameEndData.playerCount
            );
        }
        
        // Overall result
        results.overall = results.deckCommitment && 
                         results.cardPosition && 
                         results.dealingOrder;
        
        return results;
    }
    
    verifyDeckCommitment(deck, nonce, commitment) {
        const serialized = deck.map(c => `${c.suit}:${c.rank}`).join('|');
        const hash = this.sha256(serialized + ':' + nonce);
        return hash === commitment;
    }
    
    verifyCardPosition(deck, seatIndex, card) {
        const expected = deck[seatIndex];
        return expected.suit === card.suit && expected.rank === card.rank;
    }
    
    verifyDealingOrder(order, seed, playerCount) {
        const indices = Array.from({ length: playerCount }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const part = seed.substring((i * 4) % 60, (i * 4) % 60 + 4);
            const j = parseInt(part, 16) % (i + 1);
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return JSON.stringify(indices) === JSON.stringify(order);
    }
    
    sha256(data) {
        // Use Web Crypto API or a library like crypto-js
        return crypto.subtle.digest('SHA-256', 
            new TextEncoder().encode(data)
        ).then(hash => {
            return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        });
    }
}
```

## Security Recommendations

1. **Always Verify**: Never trust game results without verification
2. **Store Commitments**: Save all commitments received during the game
3. **Check Proofs**: If SNARK proofs are available, always verify them
4. **Report Failures**: If verification fails, report to the community
5. **Use Secure Connection**: Always connect via WSS in production

## Troubleshooting

### Verification Fails
- Ensure you're using the correct commitment hash
- Check that the nonce matches
- Verify the deck serialization format matches

### SNARK Verification Fails
- Ensure you have the correct verification key
- Check that public inputs are formatted correctly
- Verify the proof format matches expected structure

### Checkpoint Verification Fails
- This may indicate tampering
- Report the issue immediately
- Save all game state for forensic analysis

## Contact

For questions about client-side verification or to report verification failures, please open an issue on the GitHub repository.
