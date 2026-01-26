# GamerStake SDK + Indian Poker Security - Proof of Concept

This proof of concept demonstrates how to integrate the **GamerStake wagering platform SDK** with the **cryptographic security features** from the indian-poker project.

## Overview

This integration combines:
- **GamerStake SDK**: Player authentication, match lifecycle management, and wagering (handled by platform)
- **Indian Poker Security**: Distributed randomness, verifiable shuffling, card commitments, and audit logging

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────┐         ┌─────────────────┐
│  GamerStake     │  JWT    │   Secure Game Server         │  SDK    │  GamerStake     │
│  Frontend       │ ──────> │   (This POC)                 │ ──────> │  API            │
│  (Web/Mobile)   │  Token  │                              │  Calls  │  (Backend)      │
└─────────────────┘         │  Security Features:          │         └─────────────────┘
                            │  - Distributed Randomness    │
                            │  - Verifiable Shuffle        │
                            │  - Card Commitments          │
                            │  - Rate Limiting             │
                            │  - Audit Logging             │
                            └──────────────────────────────┘
```

## Security Features

### 1. Distributed Randomness (Commit-Reveal)
No single party can control the shuffle outcome:
- Each player generates a random seed
- Players commit to their seed (send SHA-256 hash)
- After all commitments, players reveal their seeds
- Final shuffle seed = H(seed_1 || seed_2 || ... || timestamp)

### 2. Verifiable Shuffle
The deck shuffle is deterministic and verifiable:
- Uses Fisher-Yates shuffle with the distributed seed
- Shuffle permutation is recorded for verification
- Players can independently verify the shuffle was fair

### 3. Card Commitments
Cryptographic proof of deck order before dealing:
- Deck commitment = H(matchId:nonce:card_data)
- Commitment is shared before cards are dealt
- After game, full deck data is revealed for verification

### 4. Rate Limiting
Prevents abuse of cryptographic operations:
- Max 10 proof generations per hour
- Max 20 deck commitments per hour
- Configurable limits per operation type

### 5. Audit Logging
Complete trail of security-relevant events:
- Player joins, randomness contributions
- Deck shuffles, card deals
- Winner determination, verification requests

## Installation

```bash
cd gamerstake-poc
npm install
```

## Configuration

Create a `.env` file:

```env
# GamerStake SDK Configuration
GAMERSTAKE_API_KEY=your-api-key-here
ENVIRONMENT=development

# Server Configuration
PORT=3000
```

## Running the Server

```bash
# Development mode
node server.js

# Or with nodemon for auto-reload
npx nodemon server.js
```

## Testing

1. Start the server: `node server.js`
2. Open `test-client.html` in two browser windows
3. Connect both clients to the same match ID
4. Follow the distributed randomness protocol
5. View the game result and verification data

## Game Flow

1. **Authentication**: Players connect with JWT tokens (validated by GamerStake SDK)
2. **Match Start**: When 2 players join, match begins
3. **Commitment Phase**: Each player commits to a random seed
4. **Reveal Phase**: Players reveal their seeds (verified against commitments)
5. **Shuffle & Deal**: Deck is shuffled with combined seed, cards are dealt
6. **Result**: Winner determined, reported to GamerStake for payout
7. **Verification**: Players can request cryptographic proof of fairness

## API Endpoints

### HTTP
- `GET /health` - Health check with security status
- `GET /security/stats` - Crypto monitoring statistics

### WebSocket Events

**Client → Server:**
- `authenticate` - Send JWT token and match ID
- `commit_randomness` - Send randomness commitment
- `reveal_randomness` - Reveal random seed
- `get_verification` - Request verification data

**Server → Client:**
- `authenticated` - Authentication successful
- `match_started` - Match has begun
- `commitment_accepted` - Commitment received
- `reveal_phase` - Time to reveal seeds
- `match_ended` - Game result with cards
- `verification_data` - Cryptographic proof data

## Security Verification

After a match, players receive:
- Shuffle seed (derived from all player contributions)
- Deck commitment (hash of deck order)
- Full randomness transcript
- Card positions and hashes

Players can independently verify:
1. Their seed was included in the final shuffle seed
2. The shuffle permutation matches the seed
3. Card hashes match the committed deck
4. No manipulation occurred

## Integration with GamerStake

The SDK handles:
- `validatePlayerToken(token)` - Verify player JWT
- `reportMatchStart(matchId)` - Notify match started
- `reportPlayerJoin(matchId, playerId)` - Player joined
- `reportMatchResult(matchId, result)` - Report winner/scores
- `reportMatchError(matchId, reason)` - Cancel match (refunds wagers)

## Files

- `server.js` - Main game server with SDK + security integration
- `security-utils.js` - Cryptographic security utilities (from indian-poker)
- `test-client.html` - Browser-based test client
- `.env.example` - Environment configuration template

## Production Considerations

1. **Use real GamerStake API key** - Replace test key with production key
2. **Enable WSS** - Use secure WebSocket connections
3. **Configure CORS** - Restrict to allowed origins
4. **Monitor alerts** - Watch crypto monitor for anomalies
5. **Backup audit logs** - Store logs for compliance

## License

MIT
