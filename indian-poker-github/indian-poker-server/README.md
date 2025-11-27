# 🃏 Indian Poker Server

A comprehensive WebSocket server for traditional Indian card games, featuring **Teen Patti**, **Jhandi Munda**, and other authentic Indian poker variants.

## ✨ Features

- 🎯 **Authentic Indian Games**: Teen Patti, Jhandi Munda with traditional rules
- 🌐 **Real-time Multiplayer**: WebSocket-based instant communication
- 🎮 **Cultural Authenticity**: Indian terminology and betting patterns
- 🏠 **Room Management**: Create, join, and manage game rooms
- 💰 **Chip System**: Virtual chip management for betting
- 📱 **Simple Integration**: Easy-to-use client API
- 🔄 **Scalable Architecture**: Supports multiple concurrent games

## 🚀 Quick Start

### Installation

```bash
cd /workspace/code/indian-poker-server
npm install
```

### Run the Server

```bash
npm start
```

The server will start on `ws://localhost:8080`

### Client Example

```javascript
class IndianPokerClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
    }

    connect() {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
            console.log('🃏 Connected to Indian Poker Server');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'game_started':
                console.log('🎮 Game started:', message.data.message);
                break;
            case 'bet_made':
                console.log(`💰 ${message.data.playerName} bet ${message.data.amount}`);
                break;
            case 'game_ended':
                console.log(message.data.message);
                break;
        }
    }

    // API Methods
    createRoom(variant = 'teen_patti', roomName) {
        this.send({ type: 'create_room', data: { variant, roomName } });
    }

    joinRoom(roomId, playerName, chips = 1000) {
        this.send({ type: 'join_room', data: { roomId, playerName, chips } });
    }

    makeBet(amount) {
        this.send({ type: 'make_bet', data: { amount } });
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

// Usage
const client = new IndianPokerClient('ws://localhost:8080');
client.connect();

// Create a Teen Patti room
setTimeout(() => {
    client.createRoom('teen_patti', 'My Teen Patti Table');
}, 1000);
```

## 🎲 Game Variants

### Teen Patti (तीन पत्ती)
Traditional 3-card Indian poker with authentic hand rankings:

1. **Trail** - Three of a kind (Highest)
2. **Pure Sequence** - Straight flush 
3. **Sequence** - Straight
4. **Color** - Flush
5. **Pair** - One pair
6. **High Card** - (Lowest)

**Features:**
- 2-6 players
- Traditional betting (Chaal, Pack, Show, Boot)
- Authentic hand evaluation
- Cultural terminology

### Jhandi Munda (झंडी मुंडा)
Card-based dice prediction game:

**Features:**
- 6 dice simulation using cards
- Prediction-based betting
- Multiple win multipliers
- Unlimited players

## 🗣️ Indian Terminology

The server uses authentic Indian poker terms:

- **Chaal** (छल) - Call or raise
- **Pack** (पैक) - Fold
- **Show** (शो) - Show cards
- **Boot** (बूट) - Forced bet/ante
- **Pot** (पॉट) - Total betting amount

## 🌐 WebSocket API

### Client → Server Messages

```javascript
// Create room
{ type: 'create_room', data: { variant: 'teen_patti', roomName: 'My Room' } }

// List rooms
{ type: 'list_rooms' }

// Join room
{ 
  type: 'join_room', 
  data: { 
    roomId: 'abc123', 
    playerName: 'Rajesh', 
    chips: 1000 
  } 
}

// Leave room
{ type: 'leave_room' }

// Make bet
{ type: 'make_bet', data: { amount: 100 } }

// Fold (Teen Patti)
{ type: 'fold' }

// Show cards (Teen Patti)
{ type: 'show_cards' }

// Get game state
{ type: 'get_game_state' }
```

### Server → Client Messages

```javascript
// Connection established
{ 
  type: 'connection_established', 
  data: { 
    clientId: 'xyz789',
    message: 'Welcome to Indian Poker Server!'
  } 
}

// Rooms list
{ 
  type: 'rooms_list', 
  data: { 
    rooms: [
      {
        id: 'abc123',
        name: 'My Room',
        variant: 'teen_patti',
        playerCount: 3,
        maxPlayers: 6
      }
    ]
  } 
}

// Game started
{ 
  type: 'game_started', 
  data: { 
    message: '🎮 Teen Patti game started! Cards dealt.',
    gameState: { /* game state object */ }
  } 
}

// Bet made
{ 
  type: 'bet_made', 
  data: { 
    playerId: 'xyz789',
    playerName: 'Rajesh',
    amount: 100,
    gameState: { /* updated game state */ }
  } 
}

// Cards shown
{ 
  type: 'cards_shown', 
  data: { 
    playerId: 'xyz789',
    playerName: 'Rajesh',
    handValue: { 
      type: 'sequence', 
      name: 'Sequence', 
      value: 80 
    },
    cards: ['AH', 'KS', 'QD']
  } 
}

// Game ended
{ 
  type: 'game_ended', 
  data: { 
    winner: { 
      id: 'xyz789', 
      name: 'Rajesh' 
    },
    winningHand: { /* hand value */ },
    message: '🏆 Rajesh wins with Sequence!'
  } 
}

// Error
{ 
  type: 'error', 
  data: { 
    message: 'Room not found' 
  } 
}
```

## 🏗️ Architecture

### Core Classes

- **IndianPokerServer** - Main WebSocket server
- **IndianPokerRoomManager** - Room and player management
- **TeenPattiGame** - Teen Patti game logic
- **JhandiMundaGame** - Jhandi Munda game logic
- **Card** - Card representation
- **Deck** - Deck management

### Game Flow

```
1. Client connects to WebSocket server
2. Client creates or joins a room
3. Players join the room (min 2 players)
4. Room creator starts the game
5. Cards are dealt (Teen Patti)
6. Betting rounds occur
7. Showdown or fold resolution
8. Winner determined and chips distributed
9. Ready for next game
```

## 🎨 Cultural Elements

### Indian Poker Hand Rankings (Teen Patti)

| Rank | Name | Description | Probability |
|------|------|-------------|-------------|
| 1 | Trail | Three of a kind | 0.24% |
| 2 | Pure Sequence | Straight flush | 0.22% |
| 3 | Sequence | Straight | 3.26% |
| 4 | Color | Flush | 4.96% |
| 5 | Pair | One pair | 16.7% |
| 6 | High Card | Nothing | 74.6% |

### Traditional Betting Structure

- **Boot**: Minimum ante (typically ₹10)
- **Chaal**: Call or raise amount
- **Show**: Optional card reveal
- **Pack**: Fold and lose bets

## 🔧 Configuration

### Server Settings

```javascript
const server = new IndianPokerServer(8080); // Custom port
```

### Room Settings

```javascript
// Default room settings
settings: {
    minBuyIn: 100,        // Minimum chips to join
    maxBuyIn: 10000,      // Maximum chips allowed
    autoStart: true,      // Auto-start with min players
    minPlayers: 2         // Minimum players to start
}
```

## 🧪 Testing

### Manual Testing

1. Start the server: `npm start`
2. Open multiple browser tabs
3. Create rooms and join as different players
4. Test game flow and betting

### WebSocket Testing

```bash
# Connect using wscat (if installed)
npm install -g wscat
wscat -c ws://localhost:8080

# Send test message
{"type": "list_rooms"}
```

## 🚀 Deployment

### Local Development

```bash
npm install
npm start
```

### Production Deployment

1. **Install dependencies**
2. **Set environment variables**
3. **Use process manager (PM2)**
4. **Configure reverse proxy (nginx)**
5. **Set up SSL certificates**

```bash
# Using PM2 for production
npm install -g pm2
pm2 start index.js --name indian-poker-server
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Adding New Games

To add a new Indian poker variant:

1. Create a new game class extending the base structure
2. Add game logic and hand evaluation
3. Update the room manager to support the new variant
4. Add cultural terminology and rules
5. Test with multiple players

## 📝 License

MIT License - feel free to use in your projects!

## 🎯 Roadmap

- [ ] **Mufl and variants** - More traditional games
- [ ] **Tournament mode** - Structured tournaments
- [ ] **Database integration** - Persistent storage
- [ ] **User authentication** - Login system
- [ ] **Statistics tracking** - Player stats
- [ ] **Mobile app** - React Native client
- [ ] **AI opponents** - Single player mode

## 📞 Support

- Create an issue for bugs
- Join discussions for features
- Check documentation for examples

---

**Happy Gaming! 🃏🎯**

*Experience the authentic taste of Indian poker with modern real-time technology.*