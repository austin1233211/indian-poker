# Indian Poker Security Enhancements

This document summarizes the security changes implemented based on the cryptographic security analysis recommendations.

## Overview

The following security enhancements have been implemented to address vulnerabilities identified in the Indian Poker cryptographic system. These changes focus on preventing common attack vectors while maintaining the game's functionality.

## Changes Implemented

### 1. Cryptographic Nonce in Deck Commitment

**Problem**: The original deck commitment used deterministic serialization without any randomness, making it vulnerable to hash precomputation attacks where an attacker could pre-calculate hashes for all possible deck orderings.

**Solution**: Added a cryptographic nonce (32-byte random value) to each deck commitment.

**Files Modified**:
- `index.js`: Updated `serializeDeck()`, `commitToDeck()`, and `getDeckReveal()` methods in `TeenPattiGame` class

**Implementation Details**:
- New serialization format: `gameId:nonce:index:rank:suit|...`
- Nonce generated using `crypto.randomBytes(32)`
- Timestamp recorded with each commitment
- Nonce included in reveal data for client verification

### 2. Rate Limiting for Cryptographic Operations

**Problem**: Without rate limiting, attackers could perform denial-of-service (DoS) attacks by flooding the server with proof verification requests.

**Solution**: Implemented a `CryptoRateLimiter` class that tracks and limits cryptographic operations per client.

**Files Added**:
- `security-utils.js`: Contains `CryptoRateLimiter` class

**Files Modified**:
- `index.js`: Integrated rate limiter in `IndianPokerServer` constructor and `handleVerifyProof()` method

**Configuration**:
- Maximum 10 proof verifications per hour per client
- Maximum 20 commitments per hour per client
- Configurable time window (default: 1 hour)

### 3. Proof Replay Protection

**Problem**: Without replay protection, attackers could reuse old valid proofs to bypass verification or cause confusion.

**Solution**: Implemented a `ProofValidator` class that tracks used proofs and enforces expiration.

**Files Added**:
- `security-utils.js`: Contains `ProofValidator` class

**Files Modified**:
- `index.js`: Integrated proof validator in `handleVerifyProof()` method

**Features**:
- Proof expiration (default: 1 hour)
- Replay detection using proof fingerprints
- Automatic cleanup of expired proofs

### 4. WSS (WebSocket Secure) Enforcement

**Problem**: Unencrypted WebSocket connections (WS) are vulnerable to man-in-the-middle attacks where attackers can intercept and modify game data.

**Solution**: Implemented a `WSSEnforcer` class that validates connections and enforces secure protocols in production.

**Files Added**:
- `security-utils.js`: Contains `WSSEnforcer` class

**Files Modified**:
- `index.js`: Integrated WSS enforcer in `setupWebSocketHandlers()` method

**Features**:
- Automatic detection of production environment
- Origin validation against allowed origins list
- Warning system for insecure connections in development
- Connection rejection for insecure connections in production

### 5. Distributed Randomness Generation

**Problem**: Server-controlled randomness allows a malicious server to manipulate shuffle outcomes.

**Solution**: Implemented a commit-reveal scheme where all players contribute entropy to the final shuffle seed.

**Files Added**:
- `security-utils.js`: Contains `DistributedRandomness` class

**Files Modified**:
- `index.js`: Added message handlers for `commit_randomness`, `reveal_randomness`, and `get_randomness_status`

**Protocol**:
1. **Commitment Phase**: Each player commits to a hash of their random seed
2. **Reveal Phase**: After all commitments are in, players reveal their actual seeds
3. **Verification**: Server verifies each reveal matches its commitment
4. **Combination**: All seeds are combined using XOR to produce the final shuffle seed

**New WebSocket Message Types**:
- `commit_randomness`: Player submits commitment (64-char hex hash)
- `reveal_randomness`: Player reveals their seed
- `get_randomness_status`: Query current randomness protocol status
- `randomness_committed`: Confirmation of commitment
- `randomness_revealed`: Confirmation of reveal
- `commitment_phase_complete`: All players have committed
- `randomness_finalized`: Final seed has been generated

### 6. Enhanced Card Hashing

**Problem**: Simple card hashing without game context could allow cross-game attacks.

**Solution**: Implemented `EnhancedCardHasher` class that includes game secrets in card hashes.

**Files Added**:
- `security-utils.js`: Contains `EnhancedCardHasher` class

**Features**:
- Game-specific secret derivation
- Context-aware card hashing
- Batch hashing support for efficiency

### 7. Nonce Generator Utility

**Problem**: Need for consistent, secure nonce generation across the codebase.

**Solution**: Implemented `NonceGenerator` class with static methods for generating cryptographic nonces.

**Files Added**:
- `security-utils.js`: Contains `NonceGenerator` class

**Features**:
- Configurable nonce length (default: 32 bytes)
- Hex-encoded output
- Timestamp-based nonces for debugging

## Security Utilities Module

A new `security-utils.js` module was created containing all security-related classes:

1. **DistributedRandomness**: Commit-reveal scheme for player entropy contribution
2. **CryptoRateLimiter**: Rate limiting for cryptographic operations
3. **ProofValidator**: Proof expiration and replay protection
4. **EnhancedCardHasher**: Game-context-aware card hashing
5. **WSSEnforcer**: WebSocket security enforcement
6. **NonceGenerator**: Cryptographic nonce generation

## Server Integration

The `IndianPokerServer` class was updated to integrate all security utilities:

- Constructor initializes `rateLimiter`, `proofValidator`, and `wssEnforcer`
- Health endpoint now reports security status
- Connection handler validates WSS and origin
- Proof verification includes rate limiting and replay protection
- New message handlers for distributed randomness protocol

## Configuration

Security features can be configured via environment variables:

- `NODE_ENV`: Set to `production` to enforce WSS
- `ALLOWED_ORIGINS`: Comma-separated list of allowed WebSocket origins

## Verification

Clients can verify security enhancements are active by:

1. Checking the `security` field in `connection_established` message
2. Querying the `/health` endpoint for security status
3. Verifying nonce is included in deck reveal data

## Phase 2 Security Enhancements

The following additional security enhancements have been implemented based on the remaining items from the security analysis.

### 8. Continuous Monitoring of Cryptographic Operations

**Problem**: Without monitoring, suspicious patterns of cryptographic operations could go undetected.

**Solution**: Implemented `CryptoMonitor` class that tracks all cryptographic operations and raises alerts for anomalies.

**Files Modified**:
- `security-utils.js`: Added `CryptoMonitor` class
- `index.js`: Integrated monitoring in server constructor and key operations

**Features**:
- Tracks all cryptographic operations with timestamps
- Configurable alert thresholds for proof generations and verification failures
- Automatic anomaly detection for suspicious patterns
- Statistics endpoint for monitoring dashboards
- Memory-efficient with automatic cleanup of old data

**Alert Types**:
- `HIGH_PROOF_GENERATION_RATE`: Too many proof generations per minute
- `HIGH_VERIFICATION_FAILURE_RATE`: Too many failed verifications per minute

### 9. Audit Logging for Security-Relevant Events

**Problem**: Without comprehensive logging, security incidents cannot be properly investigated.

**Solution**: Implemented `AuditLogger` class that provides structured logging of all security-relevant events.

**Files Modified**:
- `security-utils.js`: Added `AuditLogger` class
- `index.js`: Integrated audit logging throughout the server

**Features**:
- Structured log entries with timestamps, levels, and categories
- Specialized logging methods for auth, crypto, game, and security events
- Configurable log levels and console output
- Log export in JSON or text format
- Memory-efficient with configurable maximum log retention

**Log Categories**:
- `AUTH`: Authentication events
- `CRYPTO`: Cryptographic operations (proof generation, verification, deck commitment)
- `GAME`: Game events (checkpoints, card dealing)
- `SECURITY`: Security-relevant events (rate limits, connection security)
- `ERROR`: Error conditions

### 10. Continuous Verification Checkpoints

**Problem**: Verification only at game end allows tampering to go undetected during gameplay.

**Solution**: Implemented `VerificationCheckpoint` class that allows periodic verification during gameplay.

**Files Modified**:
- `security-utils.js`: Added `VerificationCheckpoint` class
- `index.js`: Added checkpoint message handlers

**Features**:
- Create checkpoints at any point during gameplay
- State hashing for integrity verification
- Tampering detection if deck commitment changes
- Configurable verification interval (default: 30 seconds)
- Per-game checkpoint storage with automatic cleanup

**New WebSocket Message Types**:
- `create_checkpoint`: Create a new verification checkpoint
- `verify_checkpoint`: Verify a previously created checkpoint
- `get_checkpoints`: List all checkpoints for current game
- `checkpoint_created`: Confirmation with checkpoint ID and state hash
- `checkpoint_verification`: Verification result with tampering detection

### 11. Secure Dealing Index Generation

**Problem**: Predictable dealing order based on seat indices allows seat-based prediction attacks.

**Solution**: Implemented `SecureDealingIndex` class that generates unpredictable dealing orders.

**Files Modified**:
- `security-utils.js`: Added `SecureDealingIndex` class
- `index.js`: Updated `dealCardsWithVerifiableOrder()` to use secure indices

**Features**:
- Cryptographically secure dealing order generation
- Uses game secret and random entropy for unpredictability
- Verifiable dealing order with seed publication
- Fisher-Yates shuffle with cryptographic randomness

**Implementation**:
- Dealing order derived from SHA-256 hash of game ID, secret, timestamp, and random bytes
- Order can be verified by clients using the published seed
- Prevents attackers from predicting which player receives which card position

### 12. Enhanced Card Hasher Integration

**Problem**: The `EnhancedCardHasher` class was implemented but not integrated into the server.

**Solution**: Integrated `EnhancedCardHasher` into the server for game-specific card hashing.

**Files Modified**:
- `index.js`: Added `enhancedCardHasher` to server constructor

**Features**:
- Game-specific secret derivation for each game
- Context-aware card hashing prevents cross-game attacks
- Batch hashing support for efficiency

### 13. Security Statistics Endpoint

**Problem**: No way to monitor security status in real-time.

**Solution**: Added HTTP endpoints and WebSocket message for security statistics.

**Files Modified**:
- `index.js`: Added `/security/stats` and `/security/audit` HTTP endpoints, `get_security_stats` message handler

**Endpoints**:
- `GET /security/stats`: Returns crypto monitor statistics and proof validator stats
- `GET /security/audit`: Returns recent audit logs (last 100 entries)

**WebSocket Message**:
- `get_security_stats`: Returns comprehensive security statistics to client

### 14. SNARK Trusted Setup Documentation

**Problem**: No documentation for the SNARK trusted setup process.

**Solution**: Created comprehensive documentation for the trusted setup ceremony.

**Files Added**:
- `SNARK_TRUSTED_SETUP.md`: Complete documentation of trusted setup process

**Contents**:
- Overview of SNARK proof system
- Trusted setup components (proving key, verification key)
- Setup ceremony phases (Powers of Tau, circuit-specific)
- Security considerations (MPC, toxic waste)
- File locations and verification process
- Recommendations for production deployment

### 15. Client-Side Verification Library Documentation

**Problem**: No documentation for clients to implement independent verification.

**Solution**: Created comprehensive documentation with code examples for client-side verification.

**Files Added**:
- `CLIENT_VERIFICATION.md`: Complete client verification documentation

**Contents**:
- Verification types (deck commitment, card position, dealing order, SNARK, distributed randomness, checkpoints)
- WebSocket API for verification requests
- Complete verification flow (setup, gameplay, game end)
- Implementation example with `IndianPokerVerifier` class
- Security recommendations and troubleshooting

## Updated Security Utilities Module

The `security-utils.js` module now contains 10 security-related classes:

1. **DistributedRandomness**: Commit-reveal scheme for player entropy contribution
2. **CryptoRateLimiter**: Rate limiting for cryptographic operations
3. **ProofValidator**: Proof expiration and replay protection
4. **EnhancedCardHasher**: Game-context-aware card hashing
5. **WSSEnforcer**: WebSocket security enforcement
6. **NonceGenerator**: Cryptographic nonce generation
7. **CryptoMonitor**: Continuous monitoring of cryptographic operations (NEW)
8. **AuditLogger**: Comprehensive security event logging (NEW)
9. **VerificationCheckpoint**: Periodic verification during gameplay (NEW)
10. **SecureDealingIndex**: Unpredictable dealing order generation (NEW)

## Updated Server Integration

The `IndianPokerServer` class now integrates all security utilities:

- Constructor initializes all 10 security utilities
- Health endpoint reports all security features status
- New HTTP endpoints for security statistics and audit logs
- Connection handler validates WSS and origin
- Proof verification includes rate limiting, replay protection, and monitoring
- Card dealing uses secure unpredictable indices
- All key operations logged via audit logger
- Checkpoint handlers for continuous verification

## Updated Health Endpoint

The `/health` endpoint now reports:
```json
{
  "status": "ok",
  "service": "indian-poker-server",
  "security": {
    "wssEnforced": true,
    "rateLimitingEnabled": true,
    "proofValidationEnabled": true,
    "continuousMonitoringEnabled": true,
    "auditLoggingEnabled": true,
    "verificationCheckpointsEnabled": true,
    "secureDealingEnabled": true
  }
}
```

## Testing

To test the security enhancements:

1. **Rate Limiting**: Send multiple proof verification requests and verify rate limit errors
2. **WSS Enforcement**: Connect via WS in production mode and verify rejection
3. **Distributed Randomness**: Use the new message types to participate in the commit-reveal protocol
4. **Nonce Verification**: Check that deck reveals include nonce and timestamp

---

# Phase 3 Security Enhancements

## Overview

Phase 3 focuses on protocol-level security improvements including explicit WebSocket message types for cryptographic operations, enhanced connection security, and timing attack prevention.

## New Security Features

### 1. Explicit WebSocket Message Types

**deck_committed Message**
- Sent immediately after deck commitment, before dealing
- Contains: gameId, commitmentHash, timestamp, algorithm
- Provides clear protocol separation for client verification

**zk_proof_deal Message**
- Sent at game end with ZK proofs for verification
- Contains: shuffle proof, dealing proof, verification data
- Enables client-side verification of game fairness

### 2. Enhanced WebSocket Authentication

**Connection Audit Logging**
- All connections logged with IP, origin, and timestamp
- Connection rejections logged with reason
- Connection closures logged with duration and message count

**Per-Connection Rate Limiting**
- Maximum 100 messages per minute per connection
- Prevents message flooding attacks
- Rate limit violations logged to audit trail

**Connection Metadata Tracking**
- Connection time, IP address, origin tracked
- Message count and last message time monitored
- Enables anomaly detection and forensics

### 3. Constant-Time Comparison Utility

**ConstantTimeCompare Class**
- Prevents timing attacks on secret comparisons
- Uses Node.js crypto.timingSafeEqual
- Methods: compare() for strings, compareHex() for hex strings

**Usage in Verification**
- Deck commitment comparisons use constant-time comparison
- Prevents attackers from inferring hash values through timing

## Implementation Details

### WebSocket Message Flow

```
Game Start:
1. Server shuffles deck
2. Server commits to deck → broadcasts 'deck_committed' message
3. Server deals cards → sends 'game_started' with commitment hash

Game End:
1. Server reveals deck → broadcasts 'game_ended' with deck reveal
2. Server sends ZK proofs → broadcasts 'zk_proof_deal' message
3. Clients can verify: commitment matches revealed deck, proofs valid
```

### Connection Security Flow

```
New Connection:
1. WSS enforcement check
2. If rejected: log rejection, close connection
3. If allowed: generate clientId, log connection
4. Track connection metadata (time, IP, origin)

Message Handling:
1. Increment message count
2. Check rate limit (100 msg/min)
3. If exceeded: log violation, reject message
4. Process message normally

Connection Close:
1. Log connection duration and message count
2. Clean up client resources
```

### Files Modified

- `security-utils.js`: Added ConstantTimeCompare class, logConnection method
- `index.js`: Enhanced setupWebSocketHandlers with audit logging and rate limiting, added deck_committed and zk_proof_deal message broadcasts

## Security Benefits

1. **Protocol Clarity**: Explicit message types make verification easier for clients
2. **Audit Trail**: Complete connection lifecycle logging for forensics
3. **Rate Limiting**: Per-connection limits prevent abuse
4. **Timing Attack Prevention**: Constant-time comparisons protect secrets
5. **Anomaly Detection**: Connection metadata enables pattern analysis

---

# Phase 4 Security Enhancements: Verifiable Shuffle

## Overview

Phase 4 implements a fully verifiable shuffle system that allows clients to independently verify that the deck was shuffled fairly using a deterministic, reproducible algorithm seeded by player-contributed randomness.

## New Security Features

### 1. Deterministic Seeded Shuffle (VerifiableShuffle)

**Problem**: The existing shuffle used `crypto.randomInt()` which is cryptographically secure but not verifiable - clients cannot reproduce the shuffle to verify it was fair.

**Solution**: Implemented `VerifiableShuffle` class with a deterministic Fisher-Yates shuffle that produces the same permutation given the same seed.

**Key Features**:
- Deterministic shuffle from 64-character hex seed
- Rejection sampling to avoid modulo bias
- Version-tagged algorithm for future compatibility
- Static verification method for client-side validation

**Implementation**:
```javascript
// Server shuffles with distributed randomness seed
const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle(deck, finalSeed);

// Client can verify by reproducing the shuffle
const verification = VerifiableShuffle.verifyShuffle(originalDeck, shuffledDeck, permutation, finalSeed);
```

### 2. Distributed Randomness Wiring

**Problem**: The `DistributedRandomness` class existed but was not wired into the actual shuffle - the game used server-side randomness by default.

**Solution**: Wired the commit-reveal randomness protocol into the actual shuffle process.

**Flow**:
1. Players commit their random seeds (SHA-256 hashes)
2. Players reveal their actual seeds
3. Server verifies reveals match commitments
4. Final seed = SHA-256(seed_1 || seed_2 || ... || seed_n || timestamp)
5. Deck is shuffled using the deterministic shuffle with the final seed

**Code Changes**:
- `startBlindMansBluffGame()` now checks for distributed randomness and uses it if available
- `Deck.shuffle(seedHex)` accepts an optional seed for deterministic shuffling
- `Deck.shuffleWithSeed()` uses `VerifiableShuffle.deterministicShuffle()`

### 3. Game State Machine for Randomness Collection

**Problem**: No enforcement that randomness collection must complete before dealing.

**Solution**: Added state machine methods to `TeenPattiGame` for managing randomness collection.

**States**:
- `idle`: No randomness collection in progress
- `awaiting_commitments`: Waiting for player commitments
- `awaiting_reveals`: Waiting for player reveals
- `complete`: Distributed randomness finalized
- `fallback`: Timeout or failure, using server randomness
- `timeout_partial`: Some players didn't reveal, using server randomness

**Methods**:
- `startRandomnessCollection()`: Begin collecting player seeds
- `canStartDealing()`: Check if game can proceed to dealing
- `finalizeRandomness()`: Complete the randomness protocol
- `handleRandomnessTimeout()`: Handle timeout with graceful fallback

### 4. Verification Transcript

**Problem**: Clients had no way to verify the shuffle was derived from their contributed seeds.

**Solution**: Generate a complete verification transcript at game end that includes all data needed to reproduce and verify the shuffle.

**Transcript Contents**:
- Shuffle algorithm version
- Game ID and timestamp
- All player commitments (playerId, commitment hash)
- All player reveals (playerId, seed hash for privacy)
- Final combined seed
- Original deck hash
- Shuffled deck hash
- Permutation array
- Transcript hash for integrity
- Step-by-step verification instructions

**Verification Steps**:
1. Verify each commitment matches SHA-256(revealed_seed)
2. Compute finalSeed = SHA-256(seed_1 || seed_2 || ... || timestamp) with seeds sorted by playerId
3. Run deterministicShuffle(originalDeck, finalSeed) and verify result matches shuffledDeck
4. Verify permutation array correctly maps original positions to shuffled positions

### 5. Enhanced Deck Class

**Problem**: Deck class didn't support seeded shuffling or track shuffle metadata.

**Solution**: Extended Deck class with seeded shuffle support and metadata tracking.

**New Properties**:
- `shuffleSeed`: The seed used for shuffling (null if server randomness)
- `shuffleTimestamp`: When the shuffle occurred
- `isVerifiableShuffle`: Whether the shuffle is reproducible

**New Methods**:
- `shuffle(seedHex)`: Shuffle with optional seed
- `shuffleRandom()`: Original random shuffle
- `shuffleWithSeed(seedHex)`: Deterministic seeded shuffle

### 6. Enhanced Game End Messages

**Problem**: Game end messages didn't include verification transcript for verifiable shuffles.

**Solution**: Extended `game_ended` and `zk_proof_deal` messages to include verification transcript.

**New Message Fields**:
- `verificationTranscript`: Full transcript for verifiable shuffles
- `isVerifiableShuffle`: Whether shuffle is verifiable
- `shuffleVersion`: Algorithm version for compatibility

## Files Modified

- `security-utils.js`:
  - Added `VerifiableShuffle` class with deterministic shuffle and verification
  - Extended `DistributedRandomness` with `getTranscriptData()`, `addCommitment()`, `addReveal()`, `getFinalSeed()`, `reset()` methods

- `index.js`:
  - Updated `Deck` class with seeded shuffle support
  - Added state machine methods to `TeenPattiGame`
  - Updated `startBlindMansBluffGame()` to wire distributed randomness
  - Updated `endTeenPattiGame()` to include verification transcript

## Security Benefits

1. **Verifiable Fairness**: Clients can independently verify the shuffle was fair
2. **No Server Trust Required**: Server cannot manipulate shuffle when distributed randomness is used
3. **Bias-Free Randomness**: Rejection sampling prevents modulo bias
4. **Graceful Degradation**: Falls back to server randomness if protocol fails
5. **Complete Audit Trail**: Full transcript enables post-game verification
6. **Version Compatibility**: Algorithm versioning enables future improvements

## Client Verification Example

```javascript
// After receiving game_ended message with verificationTranscript
const transcript = message.data.verificationTranscript;

// 1. Verify commitments match reveals
for (const reveal of transcript.reveals) {
    const commitment = transcript.commitments.find(c => c.playerId === reveal.playerId);
    const expectedHash = sha256(reveal.seed).substring(0, 16);
    if (expectedHash !== reveal.seedHash) {
        throw new Error('Commitment mismatch for player ' + reveal.playerId);
    }
}

// 2. Reproduce the shuffle
const { shuffled, permutation } = VerifiableShuffle.deterministicShuffle(
    originalDeck, 
    transcript.finalSeed
);

// 3. Verify shuffled deck matches
const shuffledHash = sha256(JSON.stringify(shuffled));
if (shuffledHash !== transcript.shuffledDeckHash) {
    throw new Error('Shuffle verification failed');
}

console.log('Shuffle verified successfully!');
```

## Conclusion

These security enhancements significantly improve the cryptographic security of the Indian Poker system by addressing the most critical vulnerabilities identified in the security analysis. The modular design allows for easy maintenance and future enhancements.
