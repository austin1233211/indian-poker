# Super Secure Indian Poker Game

A real-time multiplayer Indian poker game server with advanced cryptographic security features.

## Components

### 1. indian-poker-server (Main Game Server)
WebSocket-based game server supporting:
- **Teen Patti** - Traditional 3-card Indian poker
- **Jhandi Munda** - Card-based dice prediction game

### 2. pir-server (Private Information Retrieval)
Secure card query system that allows players to query card data without revealing what they're looking for.

### 3. groth16-snark (Zero-Knowledge Proofs)
JavaScript library for generating and verifying zero-knowledge proofs for provably fair gaming.

### 4. wasm-crypto (WebAssembly Cryptography)
High-performance cryptographic operations using BLS12-381 curves. **Note:** Requires Rust toolchain fixes for compilation.

## Quick Start

### Local Development

```bash
# Start the main game server
cd indian-poker-server
npm install
npm start
# Server runs at ws://localhost:8080
```

Open `indian-poker-server/client-example.html` in multiple browser tabs to test multiplayer.

### Docker Deployment

```bash
# Build and run with Docker
cd indian-poker-server
docker build -t indian-poker-server .
docker run -p 8080:8080 indian-poker-server
```

### Docker Compose (All Services)

```bash
docker-compose up -d
```

## Railway Deployment

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Deploy:
```bash
cd indian-poker-server
railway init
railway up
```

## Game Features

### Teen Patti
- 3-card Indian poker with traditional hand rankings
- Hand rankings: Trail > Pure Sequence > Sequence > Color > Pair > High Card
- Authentic betting terms: Chaal, Pack, Show, Boot
- 2-6 players per room

### Jhandi Munda
- 6 dice simulation using cards
- Prediction-based betting
- Multiple win multipliers

## WebSocket API

### Client → Server Messages
- `create_room` - Create a new game room
- `list_rooms` - Get available rooms
- `join_room` - Join an existing room
- `leave_room` - Leave current room
- `start_game` - Start the game (room creator only)
- `make_bet` - Place a bet
- `fold` - Fold your hand
- `show_cards` - Show your cards

### Server → Client Messages
- `connection_established` - Welcome message with client ID
- `rooms_list` - List of available rooms
- `room_created` - Room created successfully
- `room_joined` - Successfully joined room
- `game_started` - Game has started
- `game_ended` - Game completed
- `error` - Error message

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                          │
├─────────────────────────────────────────────────────────────┤
│  WebSocket Connection                                        │
├─────────────────────────────────────────────────────────────┤
│                indian-poker-server (Port 8080)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Teen Patti  │  │Jhandi Munda │  │ Room Manager│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  Optional Security Layer                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PIR Server  │  │groth16-snark│  │ wasm-crypto │         │
│  │ (Port 3000) │  │  (Library)  │  │  (WASM)     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

### indian-poker-server
- `PORT` - Server port (default: 8080)

### pir-server
- `PORT` - API port (default: 3000)
- `DB_CLIENT` - Database type (sqlite/postgres)
- `DB_PATH` - SQLite database path
- `ENCRYPTION_SECRET` - Encryption key (32+ chars)
- `JWT_SECRET` - JWT signing secret

## License

MIT
