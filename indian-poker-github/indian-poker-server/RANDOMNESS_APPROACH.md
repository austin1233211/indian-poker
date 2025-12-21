# Randomness Approach: Commit-Reveal Scheme

## Overview

This implementation uses a **commit-reveal scheme** for distributed randomness rather than a Verifiable Random Function (VRF) with elliptic curves.

## Rationale

1. **Provable Fairness**: Commit-reveal provides cryptographically provable fairness without external dependencies
2. **Distributed Entropy**: Each player contributes entropy, preventing any single party from controlling randomness
3. **Simplicity**: The scheme is simpler to implement and audit than full VRF
4. **No Trusted Setup**: No elliptic curve operations or key management required

## How It Works

### Phase 1: Commitment
Each player generates a random seed and commits `H(seed)` where H is SHA-256.

```
Player A: commitment_A = SHA256(seed_A)
Player B: commitment_B = SHA256(seed_B)
```

### Phase 2: Reveal
After all commitments are collected, players reveal their seeds.

```
Player A reveals: seed_A
Player B reveals: seed_B
```

### Phase 3: Verification
Server verifies that `H(revealed_seed) == commitment` for each player.

### Phase 4: Combination
Final seed is computed as XOR of all revealed seeds:

```
final_seed = seed_A XOR seed_B XOR ... XOR seed_N
```

### Phase 5: Shuffle
Deterministic Fisher-Yates shuffle using the final seed with rejection sampling to avoid modulo bias.

## Security Properties

### Unpredictability
No player can predict the final seed before all reveals are complete. Even if a player knows all other seeds, they cannot predict the final outcome until they reveal their own seed.

### Unbiasability
No player can influence the outcome in their favor. The only way to affect the outcome is by aborting (not revealing), which is detectable and results in game termination.

### Verifiability
Anyone can verify the shuffle was fair given the transcript:
- All commitments
- All reveals
- Final seed computation
- Shuffle permutation

## Implementation Details

### Timeout Handling
If a player fails to reveal within 30 seconds, the game uses fallback randomness from the server. This prevents griefing while maintaining fairness for cooperative players.

### Transcript Generation
A complete verification transcript is generated at game end, including:
- All player commitments with timestamps
- All player reveals with verification status
- Final seed computation
- Shuffle permutation
- Cryptographic hash of the entire transcript

## Trade-offs vs VRF

| Aspect | Commit-Reveal | VRF |
|--------|---------------|-----|
| Rounds | 2 (commit + reveal) | 1 |
| Dependencies | None (built-in crypto) | Elliptic curve library |
| Key Management | Not required | Required |
| Trusted Setup | Not required | May be required |
| Security | Equivalent for this use case | Equivalent |
| Complexity | Lower | Higher |

## Future Considerations

If VRF is required in the future, consider:
- **ECVRF** per RFC 9381
- **libsodium's crypto_vrf_*** functions
- **BLS signatures** for threshold VRF

## References

- [Commit-Reveal Schemes](https://en.wikipedia.org/wiki/Commitment_scheme)
- [Fisher-Yates Shuffle](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle)
- [RFC 9381 - ECVRF](https://datatracker.ietf.org/doc/html/rfc9381)
