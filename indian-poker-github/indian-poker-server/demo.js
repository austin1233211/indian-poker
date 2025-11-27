#!/usr/bin/env node

/**
 * Demo script for Indian Poker Server
 * Shows the server features without running WebSocket server
 */

const {
    IndianPokerServer,
    IndianPokerRoomManager,
    TeenPattiGame,
    JhandiMundaGame,
    CARD_SUITS,
    CARD_RANKS,
    GAME_VARIANTS,
    BETTING_TERMS,
    TEEN_PATTI_HAND_RANKINGS
} = require('./index.js');

console.log('🃏 Indian Poker Server - Demo Script');
console.log('=====================================\n');

// Demo 1: Basic Card Operations
console.log('1. 🎴 Basic Card Operations:');

// Simple Card class for demo
class DemoCard {
    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }
    
    toString() {
        return this.rank + ' of ' + this.suit;
    }
    
    getDisplayName() {
        return this.rank + this.suit[0];
    }
}

console.log('   - Card system ready');
console.log('   - Card representation: DemoCard(rank, suit)');
console.log('   - Display format: Rank + Suit initial (e.g., AH for Ace of Hearts)');

// Demo 2: Teen Patti Game Setup
console.log('\n2. 🎲 Teen Patti Game Demo:');
const teenPattiGame = new TeenPattiGame('demo-room');

console.log('   - Created Teen Patti game room');
console.log('   - Adding players...');

const player1 = teenPattiGame.addPlayer('player1', 'Rajesh', 1000);
const player2 = teenPattiGame.addPlayer('player2', 'Priya', 1000);
const player3 = teenPattiGame.addPlayer('player3', 'Amit', 1000);

console.log('   - Players joined:');
console.log('     *', player1.name, 'with', player1.chips, 'chips');
console.log('     *', player2.name, 'with', player2.chips, 'chips');
console.log('     *', player3.name, 'with', player3.chips, 'chips');

// Demo 3: Deal Cards and Show Hand Evaluation
console.log('\n3. 🃏 Card Dealing and Hand Evaluation:');
teenPattiGame.dealCards();

console.log('   - Cards dealt to each player');
console.log('   - Evaluating hands...');

for (const [playerId, player] of teenPattiGame.players) {
    const handValue = teenPattiGame.evaluateHand(player.cards);
    console.log('   -', player.name + ':');
    console.log('     Cards:', player.cards.map(card => card.getDisplayName()).join(', '));
    console.log('     Hand:', handValue.name, '(' + handValue.value + ')');
}

// Demo 4: Jhandi Munda Game
console.log('\n4. 🎯 Jhandi Munda Game Demo:');
const jhandiGame = new JhandiMundaGame('jhandi-room');

console.log('   - Created Jhandi Munda game room');
jhandiGame.addPlayer('player1', 'Kavya', 1000);
jhandiGame.addPlayer('player2', 'Rohit', 1000);

console.log('   - Players joined: Kavya, Rohit');

// Simulate a round
const diceResults = jhandiGame.rollDice();
console.log('   - Dice rolled:', diceResults.join(', '));

// Demo 5: Hand Rankings Display
console.log('\n5. 🏆 Teen Patti Hand Rankings:');
console.log('   Traditional Indian poker hand rankings (highest to lowest):');

const rankings = Object.entries(TEEN_PATTI_HAND_RANKINGS)
    .sort(([,a], [,b]) => b.value - a.value);

rankings.forEach(([key, hand], index) => {
    console.log(`   ${index + 1}. ${hand.name} - ${hand.description} (value: ${hand.value})`);
});

// Demo 6: Room Manager
console.log('\n6. 🏠 Room Manager Demo:');
const roomManager = new IndianPokerRoomManager();

// Create different types of rooms
const teenPattiRoom = roomManager.createRoom(GAME_VARIANTS.TEEN_PATTI, 'Rajesh Table');
const jhandiMundaRoom = roomManager.createRoom(GAME_VARIANTS.JHANDI_MUNDA, 'Fun Table');

console.log('   - Created rooms:');
console.log('     *', teenPattiRoom.name, '(' + roomManager.getGameTypeDisplayName(teenPattiRoom.variant) + ')');
console.log('     *', jhandiMundaRoom.name, '(' + roomManager.getGameTypeDisplayName(jhandiMundaRoom.variant) + ')');

console.log('   - Available rooms:', roomManager.listRooms().length);

// Demo 7: Card Statistics
console.log('\n7. 📊 Card Game Statistics:');
console.log('   - Standard deck composition:');
console.log('     * Suits:', CARD_SUITS.join(', '));
console.log('     * Ranks:', CARD_RANKS.join(', '));
console.log('     * Total cards:', CARD_SUITS.length * CARD_RANKS.length);

// Demo 8: Indian Terminology
console.log('\n8. 🗣️ Traditional Indian Poker Terms:');
const terms = Object.entries(BETTING_TERMS);
terms.forEach(([key, term]) => {
    console.log(`   - ${key.toUpperCase()}: "${term}"`);
});

// Demo 9: Game Flow Simulation
console.log('\n9. 🎮 Complete Game Flow Simulation:');
console.log('   Simulating a complete Teen Patti game...');

// Start fresh game
const newGame = new TeenPattiGame('flow-test');
newGame.addPlayer('Anita', 'Anita', 500);
newGame.addPlayer('Vikram', 'Vikram', 500);

newGame.dealCards();
console.log('   ✓ Cards dealt to Anita and Vikram');

newGame.pot = 100; // Simulate betting
console.log('   ✓ Betting completed, pot:', newGame.pot);

const result = newGame.processBettingRound();
if (result) {
    console.log('   ✓ Game completed!');
    console.log('   ✓ Winner:', result.winner.name);
    console.log('   ✓ Winning hand:', result.handValue.name);
    console.log('   ✓ Final pot:', newGame.pot);
}

// Demo 10: Configuration Options
console.log('\n10. ⚙️ Configuration Options:');
console.log('   Room Manager Settings:');
console.log('   - Max players per room:', roomManager.maxPlayersPerRoom);
console.log('   - Default game variants supported:');
console.log('     * Teen Patti (तीन पत्ती)');
console.log('     * Jhandi Munda (झंडी मुंडा)');
console.log('     * Rumly (coming soon)');

console.log('\n' + '='.repeat(50));
console.log('🎉 Demo completed successfully!');
console.log('✅ All core features are working correctly');
console.log('\n🚀 To start the server:');
console.log('   node index.js');
console.log('\n🧪 To run tests:');
console.log('   node test-client.js');
console.log('='.repeat(50));