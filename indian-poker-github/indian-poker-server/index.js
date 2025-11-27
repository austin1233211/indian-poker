#!/usr/bin/env node

/**
 * Indian Poker WebSocket Server
 * A comprehensive server for traditional Indian card games
 * Supports Teen Patti, Jhandi Munda, and other authentic Indian poker variants
 * 
 * Features:
 * - Real-time multiplayer WebSocket communication
 * - Authentic Indian poker rules and hand rankings
 * - Cultural terminology and betting patterns
 * - Room management for multiple game variants
 * - Simplified, focused architecture
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Game Constants
const CARD_SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const GAME_VARIANTS = {
    TEEN_PATTI: 'teen_patti',
    JHANDI_MUNDA: 'jhandi_munda',
    RUMLY: 'rumly'
};

// Indian Poker Hand Rankings (Teen Patti)
const TEEN_PATTI_HAND_RANKINGS = {
    'trail': { name: 'Trail', value: 100, description: 'Three of a kind - highest hand' },
    'pure_sequence': { name: 'Pure Sequence', value: 90, description: 'Three consecutive cards same suit' },
    'sequence': { name: 'Sequence', value: 80, description: 'Three consecutive cards' },
    'color': { name: 'Color', value: 70, description: 'Three cards of same suit' },
    'pair': { name: 'Pair', value: 60, description: 'Two cards of same rank' },
    'high_card': { name: 'High Card', value: 50, description: 'Highest single card' }
};

// Traditional Indian Betting Terms
const BETTING_TERMS = {
    CHAAL: 'chaal',      // Call/raise
    PACK: 'pack',        // Fold  
    SHOW: 'show',        // Show cards
    BOOT: 'boot',        // Forced bet
    POT: 'pot'           // Pot/amount
};

/**
 * Card class for Indian Poker
 */
class Card {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }

    getNumericValue() {
        const values = { 'A': 1, 'J': 11, 'Q': 12, 'K': 13 };
        return values[this.rank] || parseInt(this.rank);
    }

    getDisplayName() {
        return `${this.rank}${this.suit[0]}`; // e.g., AH for Ace of Hearts
    }

    toString() {
        return `${this.rank} of ${this.suit}`;
    }
}

/**
 * Deck management for Indian Poker
 */
class Deck {
    constructor() {
        this.cards = [];
        this.initializeDeck();
        this.shuffle();
    }

    initializeDeck() {
        this.cards = [];
        for (const suit of CARD_SUITS) {
            for (const rank of CARD_RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
    }

    shuffle() {
        const shuffled = [];
        while (this.cards.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.cards.length);
            shuffled.push(this.cards.splice(randomIndex, 1)[0]);
        }
        this.cards = shuffled;
    }

    dealCard() {
        return this.cards.pop();
    }

    cardsRemaining() {
        return this.cards.length;
    }
}

/**
 * Teen Patti Game Logic
 */
class TeenPattiGame {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map();
        this.deck = new Deck();
        this.pot = 0;
        this.bootAmount = 10; // Minimum boot amount
        this.currentRound = 'ante'; // ante, dealing, betting, showdown
        this.dealerButton = 0;
        this.smallBlind = 0;
        this.bigBlind = 1;
        this.currentBet = this.bootAmount;
        this.dealer = null;
    }

    evaluateHand(cards) {
        const sortedCards = cards.sort((a, b) => b.getNumericValue() - a.getNumericValue());
        
        // Check for Trail (Three of a kind)
        if (sortedCards[0].rank === sortedCards[1].rank && 
            sortedCards[1].rank === sortedCards[2].rank) {
            return {
                type: 'trail',
                value: TEEN_PATTI_HAND_RANKINGS.trail.value,
                name: TEEN_PATTI_HAND_RANKINGS.trail.name,
                cards: sortedCards,
                tieBreaker: sortedCards[0].getNumericValue()
            };
        }

        // Check for Pure Sequence (Straight flush)
        if (this.isPureSequence(sortedCards)) {
            return {
                type: 'pure_sequence',
                value: TEEN_PATTI_HAND_RANKINGS.pure_sequence.value,
                name: TEEN_PATTI_HAND_RANKINGS.pure_sequence.name,
                cards: sortedCards,
                tieBreaker: sortedCards[0].getNumericValue()
            };
        }

        // Check for Sequence (Straight)
        if (this.isSequence(sortedCards)) {
            return {
                type: 'sequence',
                value: TEEN_PATTI_HAND_RANKINGS.sequence.value,
                name: TEEN_PATTI_HAND_RANKINGS.sequence.name,
                cards: sortedCards,
                tieBreaker: sortedCards[0].getNumericValue()
            };
        }

        // Check for Color (Flush)
        if (this.isColor(sortedCards)) {
            return {
                type: 'color',
                value: TEEN_PATTI_HAND_RANKINGS.color.value,
                name: TEEN_PATTI_HAND_RANKINGS.color.name,
                cards: sortedCards,
                tieBreaker: sortedCards[0].getNumericValue()
            };
        }

        // Check for Pair
        if (this.isPair(sortedCards)) {
            const pairRank = this.getPairRank(sortedCards);
            return {
                type: 'pair',
                value: TEEN_PATTI_HAND_RANKINGS.pair.value,
                name: TEEN_PATTI_HAND_RANKINGS.pair.name,
                cards: sortedCards,
                tieBreaker: pairRank
            };
        }

        // High Card
        return {
            type: 'high_card',
            value: TEEN_PATTI_HAND_RANKINGS.high_card.value,
            name: TEEN_PATTI_HAND_RANKINGS.high_card.name,
            cards: sortedCards,
            tieBreaker: sortedCards[0].getNumericValue()
        };
    }

    isPureSequence(cards) {
        if (cards[0].suit !== cards[1].suit || cards[1].suit !== cards[2].suit) {
            return false;
        }
        return this.isSequence(cards);
    }

    isSequence(cards) {
        const values = cards.map(card => card.getNumericValue()).sort((a, b) => b - a);
        
        // Check for A, 2, 3 (lowest sequence)
        if (values[0] === 14 && values[1] === 3 && values[2] === 2) {
            return true;
        }
        
        // Check for normal sequences
        return (values[0] - values[1] === 1) && (values[1] - values[2] === 1);
    }

    isColor(cards) {
        return cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
    }

    isPair(cards) {
        return (cards[0].rank === cards[1].rank) ||
               (cards[1].rank === cards[2].rank) ||
               (cards[0].rank === cards[2].rank);
    }

    getPairRank(cards) {
        if (cards[0].rank === cards[1].rank) return cards[0].getNumericValue();
        if (cards[1].rank === cards[2].rank) return cards[1].getNumericValue();
        return cards[0].getNumericValue();
    }

    addPlayer(playerId, playerName, chips = 1000) {
        const player = {
            id: playerId,
            name: playerName,
            chips: chips,
            cards: [],
            bet: 0,
            hasFolded: false,
            hasShown: false,
            handValue: null,
            isActive: true,
            joinedAt: Date.now()
        };
        this.players.set(playerId, player);
        return player;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    dealCards() {
        this.deck.shuffle();
        for (const [playerId, player] of this.players) {
            player.cards = [];
            for (let i = 0; i < 3; i++) {
                player.cards.push(this.deck.dealCard());
            }
        }
    }

    processBettingRound() {
        let activePlayers = Array.from(this.players.values()).filter(p => !p.hasFolded);
        if (activePlayers.length <= 1) return;

        // Evaluate hands for showdown
        for (const player of activePlayers) {
            player.handValue = this.evaluateHand(player.cards);
        }

        // Determine winner
        const sortedPlayers = activePlayers.sort((a, b) => {
            if (a.handValue.value !== b.handValue.value) {
                return b.handValue.value - a.handValue.value;
            }
            return b.handValue.tieBreaker - a.handValue.tieBreaker;
        });

        const winner = sortedPlayers[0];
        winner.chips += this.pot;
        
        return {
            winner: winner,
            handValue: winner.handValue,
            allHands: sortedPlayers.map(p => ({
                playerId: p.id,
                playerName: p.name,
                handValue: p.handValue,
                cards: p.cards.map(card => card.getDisplayName())
            }))
        };
    }

    getGameState() {
        return {
            roomId: this.roomId,
            variant: GAME_VARIANTS.TEEN_PATTI,
            pot: this.pot,
            currentBet: this.currentBet,
            currentRound: this.currentRound,
            playerCount: this.players.size,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                bet: p.bet,
                hasFolded: p.hasFolded,
                isActive: p.isActive,
                joinedAt: p.joinedAt
                // Cards are not sent to other players
            }))
        };
    }
}

/**
 * Jhandi Munda Game Logic (Card-based adaptation)
 */
class JhandiMundaGame {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map();
        this.deck = new Deck();
        this.pot = 0;
        this.currentRound = 'betting';
        this.numDice = 6; // Using cards to simulate dice positions
        this.diceResults = [];
    }

    addPlayer(playerId, playerName, chips = 1000) {
        const player = {
            id: playerId,
            name: playerName,
            chips: chips,
            bet: 0,
            prediction: null,
            hasFolded: false,
            isActive: true,
            joinedAt: Date.now()
        };
        this.players.set(playerId, player);
        return player;
    }

    rollDice() {
        this.diceResults = [];
        for (let i = 0; i < this.numDice; i++) {
            this.diceResults.push(Math.floor(Math.random() * 6) + 1);
        }
        return this.diceResults;
    }

    calculateWinMultiplier(prediction, actualResults) {
        const count = actualResults.filter(result => result === prediction).length;
        if (count === 0) return 0;
        if (count === 1) return 1;
        if (count === 2) return 2;
        if (count === 3) return 3;
        if (count === 4) return 12;
        if (count === 5) return 45;
        if (count === 6) return 150;
        return 0;
    }

    processGame() {
        const actualResults = this.rollDice();
        let results = [];

        for (const [playerId, player] of this.players) {
            if (player.hasFolded || !player.prediction) continue;
            
            const multiplier = this.calculateWinMultiplier(player.prediction, actualResults);
            const winAmount = player.bet * multiplier;
            player.chips += winAmount;
            
            results.push({
                playerId: playerId,
                playerName: player.name,
                prediction: player.prediction,
                actualCount: actualResults.filter(r => r === player.prediction).length,
                bet: player.bet,
                winAmount: winAmount,
                multiplier: multiplier
            });
        }

        return {
            diceResults: actualResults,
            results: results,
            totalPot: this.pot
        };
    }

    getGameState() {
        return {
            roomId: this.roomId,
            variant: GAME_VARIANTS.JHANDI_MUNDA,
            pot: this.pot,
            currentRound: this.currentRound,
            diceResults: this.diceResults,
            playerCount: this.players.size,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                bet: p.bet,
                prediction: p.prediction,
                hasFolded: p.hasFolded,
                isActive: p.isActive
            }))
        };
    }
}

/**
 * Room Manager for Indian Poker Games
 */
class IndianPokerRoomManager {
    constructor() {
        this.rooms = new Map();
        this.maxPlayersPerRoom = 6;
    }

    createRoom(variant = GAME_VARIANTS.TEEN_PATTI, roomName = null) {
        const roomId = uuidv4().substr(0, 8);
        const room = {
            id: roomId,
            name: roomName || `Room ${roomId}`,
            variant: variant,
            game: null,
            players: new Set(),
            maxPlayers: this.maxPlayersPerRoom,
            createdAt: Date.now(),
            settings: {
                minBuyIn: 100,
                maxBuyIn: 10000,
                autoStart: true,
                minPlayers: 2
            }
        };

        // Initialize appropriate game
        switch (variant) {
            case GAME_VARIANTS.TEEN_PATTI:
                room.game = new TeenPattiGame(roomId);
                break;
            case GAME_VARIANTS.JHANDI_MUNDA:
                room.game = new JhandiMundaGame(roomId);
                break;
            default:
                room.game = new TeenPattiGame(roomId);
        }

        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    joinRoom(roomId, playerId, playerName, chips = 1000) {
        const room = this.getRoom(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.players.size >= room.maxPlayers) {
            throw new Error('Room is full');
        }

        room.players.add(playerId);
        return room.game.addPlayer(playerId, playerName, chips);
    }

    leaveRoom(roomId, playerId) {
        const room = this.getRoom(roomId);
        if (!room) return false;

        room.players.delete(playerId);
        room.game.removePlayer(playerId);
        
        // Delete room if empty
        if (room.players.size === 0) {
            this.rooms.delete(roomId);
        }
        
        return true;
    }

    listRooms() {
        return Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            variant: room.variant,
            playerCount: room.players.size,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt,
            gameType: this.getGameTypeDisplayName(room.variant)
        }));
    }

    getGameTypeDisplayName(variant) {
        const names = {
            [GAME_VARIANTS.TEEN_PATTI]: 'Teen Patti',
            [GAME_VARIANTS.JHANDI_MUNDA]: 'Jhandi Munda',
            [GAME_VARIANTS.RUMLY]: 'Rumly'
        };
        return names[variant] || 'Unknown';
    }
}

/**
 * WebSocket Server for Indian Poker
 */
class IndianPokerServer {
    constructor(port = 8080) {
        this.port = port;
        this.wss = new WebSocket.Server({ port });
        this.clients = new Map(); // clientId -> { ws, playerId, roomId }
        this.roomManager = new IndianPokerRoomManager();
        this.setupWebSocketHandlers();
        
        console.log('Indian Poker Server started on port ' + port);
        console.log('Supporting: Teen Patti, Jhandi Munda, and other Indian variants');
        console.log('WebSocket endpoint: ws://localhost:' + port);
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            const clientId = uuidv4();
            console.log('New connection: ' + clientId);

            this.clients.set(clientId, {
                ws: ws,
                playerId: null,
                roomId: null
            });

            this.sendMessage(clientId, {
                type: 'connection_established',
                data: {
                    clientId: clientId,
                    message: 'Welcome to Indian Poker Server!'
                }
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(clientId, data);
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                    this.sendError(clientId, 'Invalid message format');
                }
            });

            ws.on('close', () => {
                this.handleDisconnection(clientId);
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                this.handleDisconnection(clientId);
            });
        });
    }

    handleClientMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const { type, data: messageData } = data;

        try {
            switch (type) {
                case 'create_room':
                    this.handleCreateRoom(clientId, messageData);
                    break;
                case 'list_rooms':
                    this.handleListRooms(clientId);
                    break;
                case 'join_room':
                    this.handleJoinRoom(clientId, messageData);
                    break;
                case 'leave_room':
                    this.handleLeaveRoom(clientId);
                    break;
                case 'start_game':
                    this.handleStartGame(clientId);
                    break;
                case 'make_bet':
                    this.handleMakeBet(clientId, messageData);
                    break;
                case 'fold':
                    this.handleFold(clientId);
                    break;
                case 'show_cards':
                    this.handleShowCards(clientId);
                    break;
                case 'get_game_state':
                    this.handleGetGameState(clientId);
                    break;
                default:
                    this.sendError(clientId, `Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
            this.sendError(clientId, error.message);
        }
    }

    handleCreateRoom(clientId, data) {
        const { variant, roomName } = data;
        const room = this.roomManager.createRoom(variant, roomName);
        
        this.sendMessage(clientId, {
            type: 'room_created',
            data: {
                room: {
                    id: room.id,
                    name: room.name,
                    variant: room.variant,
                    playerCount: 0,
                    maxPlayers: room.maxPlayers,
                    gameType: this.roomManager.getGameTypeDisplayName(room.variant)
                }
            }
        });

        console.log(`🏠 Room created: ${room.id} (${room.variant})`);
    }

    handleListRooms(clientId) {
        const rooms = this.roomManager.listRooms();
        this.sendMessage(clientId, {
            type: 'rooms_list',
            data: { rooms }
        });
    }

    handleJoinRoom(clientId, data) {
        const { roomId, playerName, chips } = data;
        const client = this.clients.get(clientId);

        try {
            const player = this.roomManager.joinRoom(roomId, clientId, playerName, chips);
            client.playerId = clientId;
            client.roomId = roomId;

            // Send room and game state to the joining player
            const room = this.roomManager.getRoom(roomId);
            this.sendMessage(clientId, {
                type: 'room_joined',
                data: {
                    room: {
                        id: room.id,
                        name: room.name,
                        variant: room.variant,
                        gameType: this.roomManager.getGameTypeDisplayName(room.variant)
                    },
                    gameState: room.game.getGameState(),
                    player: {
                        id: player.id,
                        name: player.name,
                        chips: player.chips
                    }
                }
            });

            // Notify other players in the room
            this.broadcastToRoom(roomId, clientId, {
                type: 'player_joined',
                data: {
                    player: {
                        id: player.id,
                        name: player.name,
                        chips: player.chips
                    },
                    roomState: room.game.getGameState()
                }
            });

            console.log(`👤 ${playerName} joined room ${roomId}`);

            // Auto-start game if enough players
            if (room.players.size >= room.settings.minPlayers && room.settings.autoStart) {
                this.startGameInRoom(roomId);
            }

        } catch (error) {
            this.sendError(clientId, error.message);
        }
    }

    handleLeaveRoom(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        this.roomManager.leaveRoom(client.roomId, clientId);
        
        this.broadcastToRoom(client.roomId, clientId, {
            type: 'player_left',
            data: { playerId: clientId }
        });

        client.roomId = null;
        client.playerId = null;

        this.sendMessage(clientId, {
            type: 'room_left',
            data: { message: 'Left room successfully' }
        });

        console.log(`🚪 Player left room ${client.roomId}`);
    }

    handleStartGame(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        this.startGameInRoom(client.roomId);
    }

    startGameInRoom(roomId) {
        const room = this.roomManager.getRoom(roomId);
        if (!room) return;

        if (room.players.size < room.settings.minPlayers) {
            this.broadcastToRoom(roomId, null, {
                type: 'game_error',
                data: { message: 'Not enough players to start game' }
            });
            return;
        }

        // Start the game based on variant
        switch (room.variant) {
            case GAME_VARIANTS.TEEN_PATTI:
                this.startTeenPattiGame(room);
                break;
            case GAME_VARIANTS.JHANDI_MUNDA:
                this.startJhandiMundaGame(room);
                break;
        }
    }

    startTeenPattiGame(room) {
        room.game.currentRound = 'dealing';
        room.game.dealCards();
        room.game.currentRound = 'betting';
        room.game.currentBet = room.game.bootAmount;

        this.broadcastToRoom(room.id, null, {
            type: 'game_started',
            data: {
                gameState: room.game.getGameState(),
                message: '🎮 Teen Patti game started! Cards dealt.'
            }
        });

        console.log(`🎯 Teen Patti game started in room ${room.id}`);
    }

    startJhandiMundaGame(room) {
        room.game.currentRound = 'betting';

        this.broadcastToRoom(room.id, null, {
            type: 'game_started',
            data: {
                gameState: room.game.getGameState(),
                message: '🎮 Jhandi Munda game started! Place your predictions.'
            }
        });

        console.log(`🎯 Jhandi Munda game started in room ${room.id}`);
    }

    handleMakeBet(clientId, data) {
        const { amount } = data;
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        if (amount > player.chips) {
            this.sendError(clientId, 'Insufficient chips');
            return;
        }

        player.chips -= amount;
        player.bet += amount;
        room.game.pot += amount;

        this.broadcastToRoom(room.id, null, {
            type: 'bet_made',
            data: {
                playerId: clientId,
                playerName: player.name,
                amount: amount,
                gameState: room.game.getGameState()
            }
        });

        console.log(`💰 ${player.name} bet ${amount} in room ${room.id}`);
    }

    handleFold(clientId) {
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        player.hasFolded = true;

        this.broadcastToRoom(room.id, null, {
            type: 'player_folded',
            data: {
                playerId: clientId,
                playerName: player.name,
                gameState: room.game.getGameState()
            }
        });

        // Check if game should end
        this.checkGameEnd(room);
    }

    handleShowCards(clientId) {
        const client = this.clients.get(clientId);
        const room = this.roomManager.getRoom(client.roomId);

        if (!client || !room || room.variant !== GAME_VARIANTS.TEEN_PATTI) return;

        const player = room.game.players.get(clientId);
        if (!player) return;

        player.hasShown = true;
        player.handValue = room.game.evaluateHand(player.cards);

        this.broadcastToRoom(room.id, null, {
            type: 'cards_shown',
            data: {
                playerId: clientId,
                playerName: player.name,
                handValue: player.handValue,
                cards: player.cards.map(card => card.getDisplayName())
            }
        });

        // If all players have shown, determine winner
        const activePlayers = Array.from(room.game.players.values()).filter(p => !p.hasFolded);
        if (activePlayers.every(p => p.hasShown)) {
            this.endTeenPattiGame(room);
        }
    }

    endTeenPattiGame(room) {
        const result = room.game.processBettingRound();
        
        this.broadcastToRoom(room.id, null, {
            type: 'game_ended',
            data: {
                winner: {
                    id: result.winner.id,
                    name: result.winner.name
                },
                winningHand: result.handValue,
                allHands: result.allHands,
                pot: room.game.pot,
                message: `🏆 ${result.winner.name} wins with ${result.handValue.name}!`
            }
        });

        console.log(`🎉 Teen Patti game ended in room ${room.id}. Winner: ${result.winner.name}`);
    }

    checkGameEnd(room) {
        if (room.variant === GAME_VARIANTS.TEEN_PATTI) {
            const activePlayers = Array.from(room.game.players.values()).filter(p => !p.hasFolded);
            if (activePlayers.length <= 1) {
                const winner = activePlayers[0];
                if (winner) {
                    winner.chips += room.game.pot;
                    this.broadcastToRoom(room.id, null, {
                        type: 'game_ended',
                        data: {
                            winner: {
                                id: winner.id,
                                name: winner.name
                            },
                            message: `🏆 ${winner.name} wins by default!`,
                            pot: room.game.pot
                        }
                    });
                }
            }
        }
    }

    handleGetGameState(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.roomId) return;

        const room = this.roomManager.getRoom(client.roomId);
        if (!room) return;

        this.sendMessage(clientId, {
            type: 'game_state',
            data: { gameState: room.game.getGameState() }
        });
    }

    handleDisconnection(clientId) {
        console.log(`🔌 Disconnection: ${clientId}`);
        
        const client = this.clients.get(clientId);
        if (client && client.roomId) {
            this.roomManager.leaveRoom(client.roomId, clientId);
            
            this.broadcastToRoom(client.roomId, clientId, {
                type: 'player_disconnected',
                data: { playerId: clientId }
            });
        }

        this.clients.delete(clientId);
    }

    broadcastToRoom(roomId, excludeClientId, message) {
        for (const [clientId, client] of this.clients) {
            if (client.roomId === roomId && clientId !== excludeClientId) {
                this.sendMessage(clientId, message);
            }
        }
    }

    sendMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    sendError(clientId, errorMessage) {
        this.sendMessage(clientId, {
            type: 'error',
            data: { message: errorMessage }
        });
    }
}

/**
 * Client-side integration example
 */
const CLIENT_EXAMPLE = `
// Simple Indian Poker Client Example
class IndianPokerClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.clientId = null;
        this.roomId = null;
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

        this.ws.onclose = () => {
            console.log('🔌 Disconnected from server');
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'connection_established':
                this.clientId = message.data.clientId;
                console.log('✅ Connected with ID:', this.clientId);
                break;
                
            case 'rooms_list':
                console.log('🏠 Available rooms:', message.data.rooms);
                break;
                
            case 'game_started':
                console.log('Game started:', message.data.message);
                break;
                
            case 'bet_made':
                console.log(message.data.playerName + ' bet ' + message.data.amount);
                break;
                
            case 'cards_shown':
                console.log(message.data.playerName + ' shows: ' + message.data.handValue.name);
                break;
                
            case 'game_ended':
                console.log(message.data.message);
                break;
                
            case 'error':
                console.error('Error:', message.data.message);
                break;
        }
    }

    // API Methods
    createRoom(variant = 'teen_patti', roomName) {
        this.send({
            type: 'create_room',
            data: { variant, roomName }
        });
    }

    listRooms() {
        this.send({ type: 'list_rooms' });
    }

    joinRoom(roomId, playerName, chips = 1000) {
        this.send({
            type: 'join_room',
            data: { roomId, playerName, chips }
        });
    }

    makeBet(amount) {
        this.send({
            type: 'make_bet',
            data: { amount }
        });
    }

    fold() {
        this.send({ type: 'fold' });
    }

    showCards() {
        this.send({ type: 'show_cards' });
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

// Usage example:
const client = new IndianPokerClient('ws://localhost:8080');
client.connect();

// Create a Teen Patti room
setTimeout(() => {
    client.createRoom('teen_patti', 'My Teen Patti Table');
}, 1000);

// List available rooms
setTimeout(() => {
    client.listRooms();
}, 2000);
`;

/**
 * Deployment and Setup Instructions
 */
const DEPLOYMENT_GUIDE = `
# Indian Poker Server Deployment Guide

## Quick Start

1. **Install Dependencies:**
   npm install ws uuid crypto

2. **Run Server:**
   node index.js

3. **Client Integration:**
   Use the provided CLIENT_EXAMPLE in your frontend

## Features

✅ **Teen Patti**: Authentic 3-card Indian poker with traditional hand rankings
✅ **Jhandi Munda**: Card-based dice prediction game
✅ **Real-time Multiplayer**: WebSocket-based instant communication
✅ **Cultural Authenticity**: Indian terminology and betting patterns
✅ **Room Management**: Create, join, and manage game rooms
✅ **Chip Management**: Virtual chip system for betting

## Game Variants

### Teen Patti
- 3-card Indian poker
- Traditional hand rankings (Trail, Pure Sequence, Sequence, Color, Pair, High Card)
- Authentic betting terms (Chaal, Pack, Show, Boot)
- Support for 2-6 players

### Jhandi Munda
- 6 dice simulation using cards
- Prediction-based betting
- Multiple win multipliers
- Support for unlimited players

## WebSocket API

### Messages (Client → Server)
- \`create_room\`: Create a new game room
- \`list_rooms\`: Get available rooms
- \`join_room\`: Join an existing room
- \`leave_room\`: Leave current room
- \`start_game\`: Start the game (room creator only)
- \`make_bet\`: Place a bet
- \`fold\`: Fold your hand (Teen Patti)
- \`show_cards\`: Show your cards (Teen Patti)

### Messages (Server → Client)
- \`connection_established\`: Welcome message with client ID
- \`rooms_list\`: List of available rooms
- \`room_created\`: Room created successfully
- \`room_joined\`: Successfully joined room
- \`game_started\`: Game has started
- \`bet_made\`: Player made a bet
- \`player_folded\`: Player folded
- \`cards_shown\`: Player showed cards
- \`game_ended\`: Game completed
- \`error\`: Error message

## Cultural Elements

The server includes authentic Indian poker terminology:
- **Chaal**: Call or raise
- **Pack**: Fold
- **Show**: Show cards
- **Boot**: Forced bet/ante
- **Pot**: Total betting amount

## Hand Rankings (Teen Patti)

1. **Trail** (Three of a kind) - Highest
2. **Pure Sequence** (Straight flush)
3. **Sequence** (Straight)
4. **Color** (Flush)
5. **Pair** (One pair)
6. **High Card** - Lowest

## Next Steps

1. Integrate with your frontend
2. Add user authentication
3. Implement persistence (database)
4. Add more Indian poker variants
5. Deploy to production server

Happy Gaming! 🃏🎯
`;

// Export for external use
if (require.main === module) {
    // Start the server if run directly
    const port = process.env.PORT || 8080;
    const server = new IndianPokerServer(port);
    
    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down Indian Poker Server...');
        server.wss.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });
    });

    // Log deployment guide
    console.log('\n' + '='.repeat(60));
    console.log(DEPLOYMENT_GUIDE);
    console.log('='.repeat(60));
}

module.exports = {
    IndianPokerServer,
    IndianPokerRoomManager,
    TeenPattiGame,
    JhandiMundaGame,
    CARD_SUITS,
    CARD_RANKS,
    GAME_VARIANTS,
    BETTING_TERMS,
    TEEN_PATTI_HAND_RANKINGS
};
