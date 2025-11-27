#!/usr/bin/env node

/**
 * Proof Generation Script
 * 
 * This script provides command-line utilities for generating
 * Groth16 SNARK proofs for poker card dealing verification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import PokerProofManager from '../src/proofManager';

const program = new Command();

program
    .name('generate-proofs')
    .description('Generate Groth16 SNARK proofs for poker verification')
    .version('1.0.0');

// Global options
program
    .option('--output <dir>', 'Output directory for proofs', './proofs')
    .option('--verify', 'Verify proofs immediately after generation')
    .option('--parallel', 'Generate proofs in parallel where possible')
    .option('--json', 'Output results in JSON format');

// Command: deck
program
    .command('deck')
    .description('Generate deck generation proof')
    .option('-s, --seed <seed>', 'Random seed for deck generation')
    .option('-g, --game-id <id>', 'Game ID for the proof')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🃏 Generating Deck Generation Proof'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const result = await manager.createDeckGenerationProof(options.seed);
            
            if (result.success && result.proof) {
                if (options.verify && result.verificationResult !== false) {
                    const verified = await manager.verifyProof(result.proof);
                    result.verificationResult = verified;
                }
                
                if (options.output) {
                    const filename = `deck-${result.proof.dealId}.json`;
                    await manager.saveProof(result.proof, filename);
                }
                
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(chalk.green('✅ Deck generation proof created successfully'));
                    console.log(chalk.gray(`  Deal ID: ${result.proof.dealId}`));
                    console.log(chalk.gray(`  Processing time: ${result.processingTime}ms`));
                    if (result.verificationResult !== undefined) {
                        console.log(chalk.gray(`  Verified: ${result.verificationResult ? 'Yes' : 'No'}`));
                    }
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate deck proof:'), error.message);
            process.exit(1);
        }
    });

// Command: shuffle
program
    .command('shuffle')
    .description('Generate card shuffle proof')
    .requiredOption('-d, --deck <file>', 'JSON file containing original and shuffled decks')
    .requiredOption('-g, --game-id <id>', 'Game ID for the proof')
    .option('-o, --original <file>', 'Original deck JSON file')
    .option('-s, --shuffled <file>', 'Shuffled deck JSON file')
    .option('-p, --permutation <file>', 'Permutation array JSON file')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔀 Generating Card Shuffle Proof'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            let originalDeck: number[], shuffledDeck: number[], permutation: number[];
            
            if (options.deck) {
                const data = JSON.parse(fs.readFileSync(options.deck, 'utf-8'));
                originalDeck = data.original;
                shuffledDeck = data.shuffled;
                permutation = data.permutation;
            } else {
                if (!options.original || !options.shuffled || !options.permutation) {
                    throw new Error('Must provide either --deck or all of --original, --shuffled, --permutation');
                }
                
                originalDeck = JSON.parse(fs.readFileSync(options.original, 'utf-8'));
                shuffledDeck = JSON.parse(fs.readFileSync(options.shuffled, 'utf-8'));
                permutation = JSON.parse(fs.readFileSync(options.permutation, 'utf-8'));
            }
            
            const result = await manager.createCardShuffleProof(
                originalDeck,
                shuffledDeck,
                permutation,
                options.gameId
            );
            
            if (result.success && result.proof) {
                if (options.verify && result.verificationResult !== false) {
                    const verified = await manager.verifyProof(result.proof);
                    result.verificationResult = verified;
                }
                
                if (options.output) {
                    const filename = `shuffle-${result.proof.dealId}.json`;
                    await manager.saveProof(result.proof, filename);
                }
                
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(chalk.green('✅ Card shuffle proof created successfully'));
                    console.log(chalk.gray(`  Deal ID: ${result.proof.dealId}`));
                    console.log(chalk.gray(`  Processing time: ${result.processingTime}ms`));
                    if (result.verificationResult !== undefined) {
                        console.log(chalk.gray(`  Verified: ${result.verificationResult ? 'Yes' : 'No'}`));
                    }
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate shuffle proof:'), error.message);
            process.exit(1);
        }
    });

// Command: deal
program
    .command('deal')
    .description('Generate card dealing proof')
    .requiredOption('-d, --deck <file>', 'Shuffled deck JSON file')
    .requiredOption('-p, --positions <file>', 'Dealing positions JSON file')
    .requiredOption('-g, --game-id <id>', 'Game ID for the proof')
    .option('--player <id>', 'Player ID for the proof')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🃏 Generating Card Dealing Proof'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const deckData = JSON.parse(fs.readFileSync(options.deck, 'utf-8'));
            const positionsData = JSON.parse(fs.readFileSync(options.positions, 'utf-8'));
            
            const result = await manager.createCardDealingProof(
                deckData,
                positionsData,
                options.gameId,
                options.player
            );
            
            if (result.success && result.proof) {
                if (options.verify && result.verificationResult !== false) {
                    const verified = await manager.verifyProof(result.proof);
                    result.verificationResult = verified;
                }
                
                if (options.output) {
                    const filename = `deal-${result.proof.dealId}.json`;
                    await manager.saveProof(result.proof, filename);
                }
                
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(chalk.green('✅ Card dealing proof created successfully'));
                    console.log(chalk.gray(`  Deal ID: ${result.proof.dealId}`));
                    console.log(chalk.gray(`  Processing time: ${result.processingTime}ms`));
                    if (result.verificationResult !== undefined) {
                        console.log(chalk.gray(`  Verified: ${result.verificationResult ? 'Yes' : 'No'}`));
                    }
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate dealing proof:'), error.message);
            process.exit(1);
        }
    });

// Command: commitment
program
    .command('commitment')
    .description('Generate card commitment proof')
    .requiredOption('-c, --card <number>', 'Card value (0-51)')
    .requiredOption('-n, --nonce <number>', 'Random nonce for commitment')
    .requiredOption('-g, --game-id <id>', 'Game ID for the proof')
    .option('--player <id>', 'Player ID for the proof')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔒 Generating Card Commitment Proof'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const card = parseInt(options.card);
            const nonce = parseInt(options.nonce);
            
            if (card < 0 || card >= 52) {
                throw new Error('Card must be between 0 and 51');
            }
            
            const result = await manager.createCardCommitmentProof(
                card,
                nonce,
                options.gameId,
                options.player
            );
            
            if (result.success && result.proof) {
                if (options.verify && result.verificationResult !== false) {
                    const verified = await manager.verifyProof(result.proof);
                    result.verificationResult = verified;
                }
                
                if (options.output) {
                    const filename = `commitment-${result.proof.dealId}.json`;
                    await manager.saveProof(result.proof, filename);
                }
                
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(chalk.green('✅ Card commitment proof created successfully'));
                    console.log(chalk.gray(`  Deal ID: ${result.proof.dealId}`));
                    console.log(chalk.gray(`  Card: ${card} (suit: ${Math.floor(card/13)}, rank: ${(card%13)+2})`));
                    console.log(chalk.gray(`  Processing time: ${result.processingTime}ms`));
                    if (result.verificationResult !== undefined) {
                        console.log(chalk.gray(`  Verified: ${result.verificationResult ? 'Yes' : 'No'}`));
                    }
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate commitment proof:'), error.message);
            process.exit(1);
        }
    });

// Command: batch
program
    .command('batch')
    .description('Generate batch of proofs')
    .requiredOption('-f, --file <file>', 'JSON file containing proof requests')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📦 Generating Batch Proofs'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const batchData = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
            
            const result = await manager.generateBatchProofs({
                proofs: batchData.proofs,
                parallel: options.parallel || batchData.parallel || false,
                verifyImmediately: options.verify || batchData.verify || false
            });
            
            if (options.output) {
                const timestamp = Date.now();
                const filename = `batch-${timestamp}.json`;
                const filepath = path.join(options.output, filename);
                
                // Save individual proofs
                if (fs.existsSync(options.output) === false) {
                    fs.mkdirSync(options.output, { recursive: true });
                }
                
                result.results.forEach((proofResult, index) => {
                    if (proofResult.success && proofResult.proof) {
                        const proofFilename = `proof-${index}-${proofResult.proof.dealId}.json`;
                        const proofPath = path.join(options.output, proofFilename);
                        manager.saveProof(proofResult.proof, proofPath);
                    }
                });
                
                // Save batch summary
                fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
                console.log(chalk.gray(`  Batch results saved to: ${filepath}`));
            }
            
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                const successCount = result.results.filter(r => r.success).length;
                console.log(chalk.green(`✅ Batch generation completed: ${successCount}/${result.results.length} successful`));
                console.log(chalk.gray(`  Total time: ${result.totalProcessingTime}ms`));
                console.log(chalk.gray(`  Failed: ${result.failedCount}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate batch proofs:'), error.message);
            process.exit(1);
        }
    });

// Command: stats
program
    .command('stats')
    .description('Show proof generation statistics')
    .option('-e, --export <file>', 'Export statistics to file')
    .action(async (options) => {
        try {
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const stats = manager.getStatistics();
            
            if (options.export) {
                const data = await manager.exportStatistics();
                fs.writeFileSync(options.export, data);
                console.log(chalk.green('✅ Statistics exported'), chalk.gray(options.export));
            } else if (options.json) {
                console.log(JSON.stringify(stats, null, 2));
            } else {
                console.log(chalk.blue('📊 Proof Generation Statistics:'));
                console.log(chalk.gray(`  Total proofs generated: ${stats.totalProofsGenerated}`));
                console.log(chalk.gray(`  Total proofs verified: ${stats.totalProofsVerified}`));
                console.log(chalk.gray(`  Average generation time: ${stats.averageGenerationTime.toFixed(2)}ms`));
                console.log(chalk.gray(`  Average verification time: ${stats.averageVerificationTime.toFixed(2)}ms`));
                console.log(chalk.gray(`  Success rate: ${(stats.successRate * 100).toFixed(1)}%`));
                
                console.log(chalk.gray('\n  Circuit usage:'));
                Object.entries(stats.circuitUsage).forEach(([circuit, count]) => {
                    console.log(chalk.gray(`    ${circuit}: ${count}`));
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to get statistics:'), error.message);
            process.exit(1);
        }
    });

// Command: history
program
    .command('history')
    .description('Show proof history')
    .option('-l, --limit <number>', 'Limit number of proofs to show', '10')
    .option('-c, --clear', 'Clear proof history')
    .action(async (options) => {
        try {
            const manager = new PokerProofManager();
            await manager.initialize();
            
            if (options.clear) {
                manager.clearHistory();
                console.log(chalk.green('✅ Proof history cleared'));
                return;
            }
            
            const history = manager.getProofHistory(parseInt(options.limit));
            
            if (options.json) {
                console.log(JSON.stringify(history, null, 2));
            } else {
                console.log(chalk.blue(`📜 Proof History (${history.length} proofs):`));
                
                history.forEach((proof, index) => {
                    console.log(chalk.gray(`  ${index + 1}. ID: ${proof.dealId}`));
                    console.log(chalk.gray(`     Timestamp: ${new Date(proof.timestamp).toISOString()}`));
                    console.log(chalk.gray(`     Public signals: ${proof.publicSignals.length}`));
                    console.log('');
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to get history:'), error.message);
            process.exit(1);
        }
    });

// Command: example
program
    .command('example')
    .description('Generate example proofs for demonstration')
    .option('-t, --type <type>', 'Type of example: full-game or quick', 'quick')
    .option('-o, --output <dir>', 'Output directory for examples', './examples')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🎮 Generating Example Proofs'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const outputDir = options.output;
            fs.mkdirSync(outputDir, { recursive: true });
            
            const gameId = `example-game-${Date.now()}`;
            
            if (options.type === 'quick') {
                // Quick example: deck generation + commitment
                console.log(chalk.gray('  Generating deck generation proof...'));
                const deckResult = await manager.createDeckGenerationProof();
                
                if (deckResult.success && deckResult.proof) {
                    await manager.saveProof(deckResult.proof, path.join(outputDir, '01-deck-generation.json'));
                }
                
                console.log(chalk.gray('  Generating card commitment proof...'));
                const commitmentResult = await manager.createCardCommitmentProof(25, 12345, gameId);
                
                if (commitmentResult.success && commitmentResult.proof) {
                    await manager.saveProof(commitmentResult.proof, path.join(outputDir, '02-card-commitment.json'));
                }
                
            } else {
                // Full game example: complete poker game flow
                console.log(chalk.gray('  Step 1: Generating fresh deck...'));
                const deckResult = await manager.createDeckGenerationProof();
                
                if (deckResult.success && deckResult.proof) {
                    await manager.saveProof(deckResult.proof, path.join(outputDir, '01-deck-generation.json'));
                    
                    // Simulate shuffled deck
                    const shuffledDeck = Array.from({length: 52}, (_, i) => i).sort(() => Math.random() - 0.5);
                    const permutation = Array.from({length: 52}, (_, i) => i);
                    
                    console.log(chalk.gray('  Step 2: Shuffling deck...'));
                    const shuffleResult = await manager.createCardShuffleProof(
                        Array.from({length: 52}, (_, i) => i),
                        shuffledDeck,
                        permutation,
                        gameId
                    );
                    
                    if (shuffleResult.success && shuffleResult.proof) {
                        await manager.saveProof(shuffleResult.proof, path.join(outputDir, '02-deck-shuffle.json'));
                        
                        console.log(chalk.gray('  Step 3: Dealing hole cards...'));
                        const dealResult = await manager.createCardDealingProof(
                            shuffledDeck,
                            [0, 1, 2, 3], // First 4 cards (2 for each of 2 players)
                            gameId
                        );
                        
                        if (dealResult.success && dealResult.proof) {
                            await manager.saveProof(dealResult.proof, path.join(outputDir, '03-hole-cards.json'));
                        }
                        
                        console.log(chalk.gray('  Step 4: Dealing community cards...'));
                        const communityResult = await manager.createCardDealingProof(
                            shuffledDeck,
                            [4, 5, 6, 7, 8], // Next 5 cards for community
                            gameId
                        );
                        
                        if (communityResult.success && communityResult.proof) {
                            await manager.saveProof(communityResult.proof, path.join(outputDir, '04-community-cards.json'));
                        }
                    }
                }
            }
            
            console.log(chalk.green('✅ Example proofs generated successfully'));
            console.log(chalk.gray(`  Output directory: ${outputDir}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to generate examples:'), error.message);
            process.exit(1);
        }
    });

// Help text
program.addHelpText('after', `
Examples:
  # Generate deck generation proof
  generate-proofs deck --game-id game123 --seed myseed123 --verify
  
  # Generate card shuffle proof
  generate-proofs shuffle --deck deck.json --game-id game123
  
  # Generate card dealing proof
  generate-proofs deal --deck shuffled.json --positions deals.json --game-id game123 --player alice
  
  # Generate card commitment proof
  generate-proofs commitment --card 25 --nonce 12345 --game-id game123
  
  # Generate batch proofs from file
  generate-proofs batch --file batch-requests.json --parallel --verify
  
  # Generate example proofs
  generate-proofs example --type full-game --output ./examples
  
  # Show statistics
  generate-proofs stats --export stats.json
  
  # Show proof history
  generate-proofs history --limit 20
`);

program.parse();