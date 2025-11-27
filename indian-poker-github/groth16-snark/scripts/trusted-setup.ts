#!/usr/bin/env node

/**
 * Trusted Setup Ceremony Script
 * 
 * This script automates the trusted setup ceremony for poker circuits
 * in the Groth16 SNARK system.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import Groth16SNARK from '../src/index';
import TrustedSetupCeremonyManager from '../src/trustedSetup';
import PokerCircuitBuilder from '../src/pokerCircuits';

const program = new Command();

program
    .name('trusted-setup')
    .description('Run trusted setup ceremony for poker circuits')
    .version('1.0.0');

// Command: init
program
    .command('init')
    .description('Initialize a new trusted setup ceremony')
    .requiredOption('-c, --circuit <name>', 'Circuit name')
    .requiredOption('-n, --name <name>', 'Ceremony name')
    .requiredOption('-d, --description <desc>', 'Ceremony description')
    .requiredOption('-i, --initiator <id>', 'Initiator participant ID')
    .option('-o, --output <path>', 'Output directory for ceremony data')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🎭 Initializing Trusted Setup Ceremony'));
            
            const manager = new TrustedSetupCeremonyManager();
            const ceremony = await manager.initializeCeremony(
                options.circuit,
                options.name,
                options.description,
                options.initiator
            );
            
            console.log(chalk.green('✅ Ceremony initialized successfully:'));
            console.log(chalk.gray(`  ID: ${ceremony.id}`));
            console.log(chalk.gray(`  Circuit: ${ceremony.circuitName}`));
            console.log(chalk.gray(`  Status: ${ceremony.status}`));
            
            if (options.output) {
                const outputPath = path.join(options.output, `ceremony-${ceremony.id}.json`);
                fs.writeFileSync(outputPath, JSON.stringify(ceremony, null, 2));
                console.log(chalk.gray(`  Saved to: ${outputPath}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize ceremony:'), error.message);
            process.exit(1);
        }
    });

// Command: join
program
    .command('join')
    .description('Join an existing ceremony as a participant')
    .requiredOption('-i, --ceremony-id <id>', 'Ceremony ID')
    .requiredOption('-p, --participant <id>', 'Participant ID')
    .option('--public-key <key>', 'Participant public key')
    .action(async (options) => {
        try {
            console.log(chalk.blue('👤 Joining Ceremony'));
            
            const manager = new TrustedSetupCeremonyManager();
            await manager.addParticipant(options.ceremonyId, options.participantId);
            
            console.log(chalk.green('✅ Successfully joined ceremony'));
            console.log(chalk.gray(`  Ceremony ID: ${options.ceremonyId}`));
            console.log(chalk.gray(`  Participant ID: ${options.participantId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to join ceremony:'), error.message);
            process.exit(1);
        }
    });

// Command: contribute
program
    .command('contribute')
    .description('Make a contribution to a ceremony')
    .requiredOption('-i, --ceremony-id <id>', 'Ceremony ID')
    .requiredOption('-p, --participant <id>', 'Participant ID')
    .requiredOption('--tau <value>', 'Tau contribution')
    .requiredOption('--alpha <value>', 'Alpha contribution')
    .requiredOption('--beta <value>', 'Beta contribution')
    .requiredOption('--gamma <value>', 'Gamma contribution')
    .requiredOption('--delta <value>', 'Delta contribution')
    .option('-f, --file <path>', 'Load contribution from JSON file')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🎁 Making Contribution'));
            
            const manager = new TrustedSetupCeremonyManager();
            
            let contribution;
            if (options.file) {
                const data = fs.readFileSync(options.file, 'utf-8');
                contribution = JSON.parse(data);
            } else {
                contribution = {
                    tau: options.tau,
                    alpha: options.alpha,
                    beta: options.beta,
                    gamma: options.gamma,
                    delta: options.delta,
                    circuitSpecific: {}
                };
            }
            
            await manager.makeContribution(options.ceremonyId, options.participantId, contribution);
            
            console.log(chalk.green('✅ Contribution made successfully'));
            
            // Check ceremony status
            const ceremony = manager.getCeremonyStatus(options.ceremonyId);
            if (ceremony) {
                console.log(chalk.gray(`  Status: ${ceremony.status}`));
                console.log(chalk.gray(`  Participants: ${ceremony.participants.length}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to make contribution:'), error.message);
            process.exit(1);
        }
    });

// Command: status
program
    .command('status')
    .description('Check ceremony status')
    .option('-i, --ceremony-id <id>', 'Specific ceremony ID')
    .option('-a, --all', 'Show all ceremonies')
    .action(async (options) => {
        try {
            const manager = new TrustedSetupCeremonyManager();
            
            if (options.ceremonyId) {
                const ceremony = manager.getCeremonyStatus(options.ceremonyId);
                if (ceremony) {
                    console.log(chalk.blue('📋 Ceremony Status:'));
                    console.log(chalk.gray(`  ID: ${ceremony.id}`));
                    console.log(chalk.gray(`  Name: ${ceremony.name}`));
                    console.log(chalk.gray(`  Circuit: ${ceremony.circuitName}`));
                    console.log(chalk.gray(`  Status: ${ceremony.status}`));
                    console.log(chalk.gray(`  Participants: ${ceremony.participants.length}`));
                    console.log(chalk.gray(`  Started: ${new Date(ceremony.startTime).toISOString()}`));
                    
                    if (ceremony.endTime) {
                        console.log(chalk.gray(`  Completed: ${new Date(ceremony.endTime).toISOString()}`));
                    }
                    
                    if (ceremony.status === 'completed') {
                        console.log(chalk.green('  Final keys generated ✅'));
                    }
                } else {
                    console.log(chalk.red('❌ Ceremony not found'));
                }
            } else if (options.all) {
                const ceremonies = manager.listActiveCeremonies();
                console.log(chalk.blue('📋 Active Ceremonies:'));
                
                ceremonies.forEach(ceremony => {
                    console.log(chalk.gray(`  ${ceremony.id} - ${ceremony.name} (${ceremony.status})`));
                });
                
                if (ceremonies.length === 0) {
                    console.log(chalk.gray('  No active ceremonies'));
                }
            } else {
                console.log(chalk.yellow('Please specify --ceremony-id or --all'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to check status:'), error.message);
            process.exit(1);
        }
    });

// Command: verify
program
    .command('verify')
    .description('Verify ceremony contribution')
    .requiredOption('-i, --ceremony-id <id>', 'Ceremony ID')
    .requiredOption('-p, --participant <id>', 'Participant ID')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔐 Verifying Contribution'));
            
            const manager = new TrustedSetupCeremonyManager();
            const isValid = await manager.verifyContribution(options.ceremonyId, options.participantId);
            
            if (isValid) {
                console.log(chalk.green('✅ Contribution verified successfully'));
            } else {
                console.log(chalk.red('❌ Contribution verification failed'));
                process.exit(1);
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Verification failed:'), error.message);
            process.exit(1);
        }
    });

// Command: export-keys
program
    .command('export-keys')
    .description('Export final ceremony keys')
    .requiredOption('-i, --ceremony-id <id>', 'Ceremony ID')
    .requiredOption('-o, --output <path>', 'Output directory')
    .option('--pk', 'Export proving key')
    .option('--vk', 'Export verification key (default: true)')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📤 Exporting Ceremony Keys'));
            
            const manager = new TrustedSetupCeremonyManager();
            const ceremony = manager.getCeremonyStatus(options.ceremonyId);
            
            if (!ceremony) {
                throw new Error('Ceremony not found');
            }
            
            if (ceremony.status !== 'completed') {
                throw new Error('Ceremony not completed yet');
            }
            
            const outputDir = options.output;
            fs.mkdirSync(outputDir, { recursive: true });
            
            if (options.vk !== false && ceremony.verificationKey) {
                const vkPath = path.join(outputDir, 'verification-key.json');
                fs.writeFileSync(vkPath, JSON.stringify(ceremony.verificationKey, null, 2));
                console.log(chalk.green('✅ Verification key exported'), chalk.gray(vkPath));
            }
            
            if (options.pk && ceremony.provingKey) {
                const pkPath = path.join(outputDir, 'proving-key.json');
                fs.writeFileSync(pkPath, JSON.stringify(ceremony.provingKey, null, 2));
                console.log(chalk.green('✅ Proving key exported'), chalk.gray(pkPath));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Export failed:'), error.message);
            process.exit(1);
        }
    });

// Command: cleanup
program
    .command('cleanup')
    .description('Clean up timed-out ceremonies')
    .option('-f, --force', 'Force cleanup without confirmation')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🧹 Cleaning up timed-out ceremonies'));
            
            const manager = new TrustedSetupCeremonyManager();
            const cleaned = manager.cleanupTimedOutCeremonies();
            
            console.log(chalk.green(`✅ Cleaned up ${cleaned} timed-out ceremonies`));
            
        } catch (error) {
            console.error(chalk.red('❌ Cleanup failed:'), error.message);
            process.exit(1);
        }
    });

// Command: list-circuits
program
    .command('list-circuits')
    .description('List available circuits')
    .action(async () => {
        try {
            console.log(chalk.blue('📋 Available Circuits:'));
            
            const builder = new PokerCircuitBuilder();
            const circuits = builder.getCircuits();
            
            circuits.forEach((circuit, name) => {
                console.log(chalk.gray(`  ${name}:`));
                console.log(chalk.gray(`    Description: ${circuit.description}`));
                console.log(chalk.gray(`    Inputs: ${circuit.nInputs}`));
                console.log(chalk.gray(`    Outputs: ${circuit.nOutputs}`));
                console.log(chalk.gray(`    Constraints: ${circuit.constraints.length}`));
                console.log('');
            });
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to list circuits:'), error.message);
            process.exit(1);
        }
    });

// Command: stats
program
    .command('stats')
    .description('Show ceremony statistics')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 Ceremony Statistics:'));
            
            const manager = new TrustedSetupCeremonyManager();
            const stats = manager.getStatistics();
            
            console.log(chalk.gray(`  Active ceremonies: ${stats.activeCeremonies}`));
            console.log(chalk.gray(`  Completed ceremonies: ${stats.completedCeremonies}`));
            console.log(chalk.gray(`  Failed ceremonies: ${stats.failedCeremonies}`));
            console.log(chalk.gray(`  Total participants: ${stats.totalParticipants}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to get statistics:'), error.message);
            process.exit(1);
        }
    });

// Error handling
program.addHelpText('after', `
Examples:
  # Initialize a ceremony for card shuffling
  trusted-setup init -c cardShuffle -n "Poker Shuffle 2024" -d "Shuffle verification for Texas Hold'em" -i organizer1
  
  # Join a ceremony as a participant
  trusted-setup join -i ceremony-123 -p participant1
  
  # Make a contribution to a ceremony
  trusted-setup contribute -i ceremony-123 -p participant1 --tau abc123 --alpha def456 --beta ghi789 --gamma jkl012 --delta mno345
  
  # Check ceremony status
  trusted-setup status -i ceremony-123
  
  # Export keys after completion
  trusted-setup export-keys -i ceremony-123 -o ./keys
`);

program.parse();