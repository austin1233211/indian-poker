# PIR Query Schema Documentation

## Overview

This document defines the schema for PIR (Private Information Retrieval) queries used by the Indian Poker game server to retrieve card data in a privacy-preserving manner.

## Authentication

All PIR API endpoints require authentication via Bearer token.

### Login Request

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "gameserver@indianpoker.local",
  "password": "your-password"
}
```

### Login Response

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

### Using the Token

Include the token in all subsequent requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## PIR Query Endpoint

```
POST /api/pir/query
Authorization: Bearer <token>
Content-Type: application/json
```

## Query Types

### 1. Card Lookup

Retrieve a specific card by position.

**Request:**
```json
{
  "query": {
    "type": "card_lookup",
    "parameters": {
      "cardId": "game123_0",
      "gameId": "game123",
      "position": 0,
      "requestingPlayer": "player1",
      "targetPlayer": "player2",
      "encryptedProperties": ["rank", "suit"]
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "queryId": "pir_1703145600000_abc123",
    "cardData": {
      "position": 0,
      "rank": "K",
      "suit": "Hearts",
      "hash": "a1b2c3d4..."
    },
    "verification": {
      "method": "pir",
      "timestamp": "2025-12-21T08:00:00.000Z"
    }
  },
  "timestamp": "2025-12-21T08:00:00.000Z"
}
```

### 2. Card Search

Search for cards matching criteria.

**Request:**
```json
{
  "query": {
    "type": "card_search",
    "parameters": {
      "gameId": "game123",
      "criteria": {
        "suit": "Hearts"
      },
      "limit": 10
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "matches": [
      {
        "position": 0,
        "rank": "K",
        "suit": "Hearts"
      },
      {
        "position": 5,
        "rank": "Q",
        "suit": "Hearts"
      }
    ],
    "totalMatches": 13
  },
  "timestamp": "2025-12-21T08:00:00.000Z"
}
```

### 3. Card Stats

Get statistics about cards in a game.

**Request:**
```json
{
  "query": {
    "type": "card_stats",
    "parameters": {
      "gameId": "game123"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "totalCards": 52,
    "dealtCards": 4,
    "remainingCards": 48,
    "suitDistribution": {
      "Hearts": 13,
      "Diamonds": 13,
      "Clubs": 13,
      "Spades": 13
    }
  },
  "timestamp": "2025-12-21T08:00:00.000Z"
}
```

### 4. Card Validation

Validate a card hash against the deck.

**Request:**
```json
{
  "query": {
    "type": "card_validation",
    "parameters": {
      "gameId": "game123",
      "cardHash": "a1b2c3d4...",
      "expectedPosition": 0
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "valid": true,
    "position": 0,
    "hashMatch": true
  },
  "timestamp": "2025-12-21T08:00:00.000Z"
}
```

## Error Responses

### Authentication Error

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### Validation Error

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Invalid query type",
  "details": {
    "field": "query.type",
    "expected": ["card_lookup", "card_search", "card_stats", "card_validation"]
  }
}
```

### Rate Limit Error

```json
{
  "success": false,
  "error": "RateLimitExceeded",
  "message": "Too many requests",
  "retryAfter": 60
}
```

### Game Not Found

```json
{
  "success": false,
  "error": "NotFound",
  "message": "Game not found or deck not registered"
}
```

## Data Types

### Card Object

| Field | Type | Description |
|-------|------|-------------|
| `position` | integer | Card position in deck (0-51) |
| `rank` | string | Card rank: A, 2-10, J, Q, K |
| `suit` | string | Card suit: Hearts, Diamonds, Clubs, Spades |
| `hash` | string | SHA-256 hash of card data |

### Query Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gameId` | string | Yes | Unique game identifier |
| `position` | integer | Conditional | Card position (for card_lookup) |
| `requestingPlayer` | string | Conditional | Player making the request |
| `targetPlayer` | string | Conditional | Player whose card is being requested |
| `encryptedProperties` | array | No | Properties to encrypt in response |

## Privacy Guarantees

The PIR server provides the following privacy guarantees:

1. **Query Privacy**: The server cannot determine which card was queried
2. **Access Control**: Players can only query cards they're allowed to see
3. **Audit Trail**: All queries are logged for verification
4. **Rate Limiting**: Prevents enumeration attacks

## Integration Example

```javascript
// Game server PIR client usage
const pirResponse = await pirClient.makeRequestWithRetry('POST', '/api/pir/query', {
  query: {
    type: 'card_lookup',
    parameters: {
      cardId: `${gameId}_${position}`,
      gameId: gameId,
      position: position,
      requestingPlayer: requestingPlayerId,
      targetPlayer: targetPlayerId,
      encryptedProperties: ['rank', 'suit']
    }
  }
});

if (pirResponse.success && pirResponse.result) {
  const cardData = pirResponse.result.cardData;
  // Use card data...
}
```

## Versioning

Current API version: `v1`

All endpoints are prefixed with `/api/` and the version is implicit. Future versions will use explicit versioning: `/api/v2/pir/query`.
