#!/usr/bin/env node

/**
 * Simple Test Client for Indian Poker Server
 * Demonstrates how to connect, create rooms, and play games
 */

const WebSocket = require('ws');

class IndianPokerTestClient {
    constructor(name, serverUrl = 'ws://localhost:8080') {
        this.name = name;
        this.serverUrl = serverUrl;
        this.ws = null;
        this.roomId = null;
        this.clientId = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            console.log(`🔗 ${this.name} connecting to ${this.serverUrl}...`);
            
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.on('open', () => {
                console.log(`✅ ${this.name} connected!`);
                resolve();
            });

            this.ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            });

            this.ws.on('close', () => {
                console.log(`🔌 ${this.name} disconnected`);
            });

            this.ws.on('error', (error) => {
                console.error(`❌ ${this.name} error:`, error);
                reject(error);
            });
        });
    }

    handleMessage(message) {
        const time = new Date().toLocaleTimeString();
        
        switch (message.type) {
            case 'connection_established':
                this.clientId = message.data.clientId;
                console.log(`🆔 ${this.name} got client ID: ${this.clientId}`);
                break;
                
            case 'rooms_list':
                console.log(`🏠 ${this.name} received rooms list:`);
                message.data.rooms.forEach(room => {
                    console.log(`   - ${room.name} (${room.variant}) [${room.playerCount}/${room.maxPlayers}]`);
                });
                break;
                
            case 'room_created':
                this.roomId = message.data.room.id;
                console.log(`🏠 ${this.name} created room: ${this.roomId}`);
                console.log(`   Room: ${message.data.room.name}`);
                console.log(`   Game: ${message.data.room.gameType}`);
                break;
                
            case 'room_joined':
                this.roomId = message.data.room.id;
                console.log(`🚪 ${this.name} joined room: ${this.roomId}`);
                console.log(`   Room: ${message.data.room.name}`);
                console.log(`   Game: ${message.data.room.gameType}`);
                break;
                
            case 'player_joined':
                console.log(`👋 ${this.name} saw player join: ${message.data.player.name}`);
                break;
                
            case 'game_started':
                console.log(`🎮 ${this.name} - GAME STARTED!`);
                console.log(`   ${message.data.message}`);
                break;
                
            case 'bet_made':
                console.log(`💰 ${this.name} - ${message.data.playerName} bet ${message.data.amount}`);
                break;
                
            case 'cards_shown':
                console.log(`🃏 ${this.name} - ${message.data.playerName} showed: ${message.data.handValue.name}`);
                break;
                
            case 'player_folded':
                console.log(`🏃 ${this.name} - ${message.data.playerName} folded`);
                break;
                
            case 'game_ended':
                console.log(`🎉 ${this.name} - GAME ENDED: ${message.data.message}`);
                break;
                
            case 'error':
                console.error(`❌ ${this.name} - ERROR: ${message.data.message}`);
                break;
                
            default:
                console.log(`📨 ${this.name} - Unknown message:`, message);
        }
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    // API Methods
    createRoom(variant = 'teen_patti', roomName = null) {
        const finalRoomName = roomName || `${this.name}'s Room`;
        this.send({
            type: 'create_room',
            data: { variant, roomName: finalRoomName }
        });
    }

    listRooms() {
        this.send({ type: 'list_rooms' });
    }

    joinRoom(roomId, chips = 1000) {
        this.send({
            type: 'join_room',
            data: { roomId, playerName: this.name, chips }
        });
    }

    leaveRoom() {
        this.send({ type: 'leave_room' });
    }

    startGame() {
        this.send({ type: 'start_game' });
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

    getGameState() {
        this.send({ type: 'get_game_state' });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Test scenarios
async function runTestScenario() {
    console.log('🃏 Starting Indian Poker Test Scenario...\n');

    // Create test clients
    const player1 = new IndianPokerTestClient('Rajesh');
    const player2 = new IndianPokerTestClient('Priya');
    const player3 = new IndianPokerTestClient('Amit');

    try {
        // Connect all players
        await Promise.all([
            player1.connect(),
            player2.connect(),
            player3.connect()
        ]);

        console.log('\n' + '='.repeat(50));

        // Player 1 creates a Teen Patti room
        setTimeout(() => {
            console.log('\n🎯 Step 1: Rajesh creates a Teen Patti room');
            player1.createRoom('teen_patti', 'Teen Patti Table 1');
        }, 1000);

        // Player 2 lists rooms
        setTimeout(() => {
            console.log('\n📋 Step 2: Priya lists available rooms');
            player2.listRooms();
        }, 2000);

        // Player 2 joins the room
        setTimeout(() => {
            console.log('\n🚪 Step 3: Priya joins Rajesh\'s room');
            player2.joinRoom(player1.roomId);
        }, 3000);

        // Player 3 joins the room
        setTimeout(() => {
            console.log('\n👥 Step 4: Amit joins the room');
            player3.joinRoom(player1.roomId);
        }, 4000);

        // Player 1 starts the game
        setTimeout(() => {
            console.log('\n🚀 Step 5: Rajesh starts the game');
            player1.startGame();
        }, 5000);

        // Betting phase
        setTimeout(() => {
            console.log('\n💰 Step 6: Betting phase begins');
            player1.makeBet(50);
        }, 6000);

        setTimeout(() => {
            console.log('\n💰 Priya calls the bet');
            player2.makeBet(50);
        }, 7000);

        setTimeout(() => {
            console.log('\n💰 Amit raises to 100');
            player3.makeBet(100);
        }, 8000);

        setTimeout(() => {
            console.log('\n💰 Rajesh calls the raise');
            player1.makeBet(100);
        }, 9000);

        setTimeout(() => {
            console.log('\n💰 Priya calls the raise');
            player2.makeBet(100);
        }, 10000);

        // Showdown phase
        setTimeout(() => {
            console.log('\n🃏 Step 7: Showdown begins');
            player1.showCards();
        }, 11000);

        setTimeout(() => {
            console.log('\n🃏 Priya shows her cards');
            player2.showCards();
        }, 12000);

        setTimeout(() => {
            console.log('\n🃏 Amit shows his cards');
            player3.showCards();
        }, 13000);

        // Disconnect after game
        setTimeout(() => {
            console.log('\n🏁 Test scenario completed!');
            console.log('Disconnecting all players...\n');
            
            player1.disconnect();
            player2.disconnect();
            player3.disconnect();
            
            console.log('✅ Test scenario finished successfully!');
        }, 15000);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Alternative: Jhandi Munda test scenario
async function runJhandiMundaTest() {
    console.log('🎲 Starting Jhandi Munda Test...\n');

    const player1 = new IndianPokerTestClient('Kavya');
    const player2 = new IndianPokerTestClient('Rohit');

    try {
        await player1.connect();
        await player2.connect();

        // Player 1 creates Jhandi Munda room
        setTimeout(() => {
            player1.createRoom('jhandi_munda', 'Jhandi Munda Table');
        }, 1000);

        // Player 2 joins
        setTimeout(() => {
            player2.joinRoom(player1.roomId);
        }, 2000);

        // Start game
        setTimeout(() => {
            player1.startGame();
        }, 3000);

        // Make predictions and bets
        setTimeout(() => {
            console.log('🎯 Kavya predicts 6 and bets 50');
            player1.makeBet(50);
        }, 4000);

        setTimeout(() => {
            console.log('🎯 Rohit predicts 1 and bets 30');
            player2.makeBet(30);
        }, 5000);

        setTimeout(() => {
            console.log('🎯 Kavya changes prediction to 1');
            player1.makeBet(20);
        }, 6000);

    } catch (error) {
        console.error('❌ Jhandi Munda test failed:', error);
    }
}

// Interactive mode for manual testing
function interactiveMode() {
    console.log('🎮 Interactive Mode - Manual Testing');
    console.log('Commands:');
    console.log('  connect <name>');
    console.log('  create <variant> <name>');
    console.log('  join <roomId>');
    console.log('  list');
    console.log('  bet <amount>');
    console.log('  fold');
    console.log('  show');
    console.log('  start');
    console.log('  quit');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const client = new IndianPokerTestClient('Interactive User');

    rl.on('line', async (input) => {
        const [command, ...args] = input.trim().split(' ');

        try {
            switch (command) {
                case 'connect':
                    await client.connect();
                    break;
                case 'create':
                    const variant = args[0] || 'teen_patti';
                    const name = args[1];
                    client.createRoom(variant, name);
                    break;
                case 'join':
                    client.joinRoom(args[0]);
                    break;
                case 'list':
                    client.listRooms();
                    break;
                case 'bet':
                    client.makeBet(parseInt(args[0]));
                    break;
                case 'fold':
                    client.fold();
                    break;
                case 'show':
                    client.showCards();
                    break;
                case 'start':
                    client.startGame();
                    break;
                case 'quit':
                    client.disconnect();
                    rl.close();
                    break;
                default:
                    console.log('Unknown command. Type "quit" to exit.');
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
    });
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--interactive') || args.includes('-i')) {
        interactiveMode();
    } else if (args.includes('--jhandi')) {
        runJhandiMundaTest();
    } else {
        runTestScenario();
    }
}

module.exports = {
    IndianPokerTestClient,
    runTestScenario,
    runJhandiMundaTest,
    interactiveMode
};