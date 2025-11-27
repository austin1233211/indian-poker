#!/usr/bin/env node

/**
 * Proof Verification Script
 * 
 * This script provides command-line utilities for verifying
 * Groth16 SNARK proofs for poker card dealing verification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import PokerProofManager from '../src/proofManager';
import Groth16SNARK from '../src/index';

const program = new Command();

program
    .name('verify-proofs')
    .description('Verify Groth16 SNARK proofs for poker verification')
    .version('1.0.0');

// Global options
program
    .option('--json', 'Output results in JSON format')
    .option('--verbose', 'Show detailed verification information')
    .option('--strict', 'Enable strict verification mode')
    .option('--max-age <hours>', 'Maximum age of proofs in hours', '24');

// Command: single
program
    .command('single')
    .description('Verify a single proof')
    .requiredOption('-f, --file <file>', 'Proof JSON file')
    .option('--public-inputs <file>', 'Public inputs JSON file')
    .option('--check-age', 'Check proof age')
    .option('--verify-commitments', 'Verify proof commitments')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔐 Verifying Single Proof'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            // Load proof
            const proofData = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
            
            // Load public inputs if provided
            let publicInputs = {};
            if (options.publicInputs) {
                publicInputs = JSON.parse(fs.readFileSync(options.publicInputs, 'utf-8'));
            }
            
            // Verify proof
            const verificationOptions = {
                strict: options.strict,
                checkTimestamps: options.checkAge,
                maxAgeHours: parseInt(options.maxAge),
                verifyCommitments: options.verifyCommitments,
                logResults: options.verbose
            };
            
            const isValid = await manager.verifyProof(proofData, verificationOptions);
            
            if (options.json) {
                console.log(JSON.stringify({
                    valid: isValid,
                    proofId: proofData.dealId,
                    timestamp: proofData.timestamp,
                    verificationOptions
                }, null, 2));
            } else {
                if (isValid) {
                    console.log(chalk.green('✅ Proof verification successful'));
                } else {
                    console.log(chalk.red('❌ Proof verification failed'));
                }
                
                console.log(chalk.gray(`  Proof ID: ${proofData.dealId}`));
                console.log(chalk.gray(`  Timestamp: ${new Date(proofData.timestamp).toISOString()}`));
                
                if (options.checkAge) {
                    const ageMs = Date.now() - proofData.timestamp;
                    const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(2);
                    console.log(chalk.gray(`  Age: ${ageHours} hours`));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to verify proof:'), error.message);
            process.exit(1);
        }
    });

// Command: batch
program
    .command('batch')
    .description('Verify batch of proofs')
    .requiredOption('-d, --directory <dir>', 'Directory containing proof files')
    .option('-p, --pattern <pattern>', 'File pattern to match', '*.json')
    .option('--parallel', 'Verify proofs in parallel')
    .option('--summary', 'Show summary only')
    .option('--fail-fast', 'Stop on first failure')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📦 Verifying Batch Proofs'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            // Find proof files
            const files = await findProofFiles(options.directory, options.pattern);
            
            if (files.length === 0) {
                console.log(chalk.yellow('No proof files found matching pattern'));
                return;
            }
            
            console.log(chalk.gray(`  Found ${files.length} proof files`));
            
            // Load proofs
            const proofs = [];
            for (const file of files) {
                try {
                    const proofData = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    proofs.push(proofData);
                } catch (error) {
                    console.warn(chalk.yellow(`  Failed to load ${file}: ${error.message}`));
                }
            }
            
            // Verify proofs
            const verificationOptions = {
                strict: options.strict,
                checkTimestamps: true,
                maxAgeHours: parseInt(options.maxAge),
                verifyCommitments: true,
                logResults: options.verbose
            };
            
            const startTime = Date.now();
            const results = await manager.verifyBatchProofs(proofs, verificationOptions);
            const processingTime = Date.now() - startTime;
            
            // Results summary
            if (options.json) {
                console.log(JSON.stringify({
                    total: proofs.length,
                    valid: proofs.length - results.failures.length,
                    failures: results.failures.length,
                    successRate: (proofs.length - results.failures.length) / proofs.length,
                    processingTime,
                    verificationOptions
                }, null, 2));
                
                if (results.failures.length > 0) {
                    console.error(JSON.stringify({
                        failedFiles: results.failures.map(i => files[i])
                    }, null, 2));
                }
            } else {
                console.log(chalk.green(`✅ Batch verification completed`));
                console.log(chalk.gray(`  Total: ${proofs.length}`));
                console.log(chalk.gray(`  Valid: ${proofs.length - results.failures.length}`));
                console.log(chalk.gray(`  Failed: ${results.failures.length}`));
                console.log(chalk.gray(`  Success rate: ${((proofs.length - results.failures.length) / proofs.length * 100).toFixed(1)}%`));
                console.log(chalk.gray(`  Processing time: ${processingTime}ms`));
                console.log(chalk.gray(`  Average per proof: ${(processingTime / proofs.length).toFixed(2)}ms`));
                
                if (results.failures.length > 0 && !options.summary) {
                    console.log(chalk.red('\n  Failed proofs:'));
                    results.failures.forEach(index => {
                        console.log(chalk.red(`    ${files[index]}`));
                    });
                }
                
                if (options.failFast && results.failures.length > 0) {
                    process.exit(1);
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Batch verification failed:'), error.message);
            process.exit(1);
        }
    });

// Command: directory
program
    .command('directory')
    .description('Verify all proofs in a directory recursively')
    .requiredOption('-d, --directory <dir>', 'Directory to scan')
    .option('--max-depth <number>', 'Maximum recursion depth', '3')
    .option('--exclude <patterns>', 'Exclude patterns (comma-separated)')
    .option('--generate-report', 'Generate verification report')
    .option('--report-output <file>', 'Report output file')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📁 Verifying Proofs in Directory'));
            
            const manager = new PokerProofManager();
            await manager.initialize();
            
            const excludePatterns = options.exclude ? options.exclude.split(',') : [];
            const proofFiles = await findProofFilesRecursively(
                options.directory,
                parseInt(options.maxDepth),
                excludePatterns
            );
            
            if (proofFiles.length === 0) {
                console.log(chalk.yellow('No proof files found'));
                return;
            }
            
            console.log(chalk.gray(`  Found ${proofFiles.length} proof files`));
            
            // Load and categorize proofs
            const proofs = [];
            const failures = [];
            
            for (const file of proofFiles) {
                try {
                    const proofData = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    proofs.push({ file, proof: proofData });
                } catch (error) {
                    failures.push({ file, error: error.message });
                }
            }
            
            console.log(chalk.gray(`  Loaded ${proofs.length} valid proof files`));
            console.log(chalk.gray(`  Skipped ${failures.length} invalid files`));
            
            // Verify proofs in batches
            const batchSize = 50;
            const verificationResults = [];
            
            for (let i = 0; i < proofs.length; i += batchSize) {
                const batch = proofs.slice(i, i + batchSize);
                const batchProofs = batch.map(b => b.proof);
                
                console.log(chalk.gray(`  Verifying batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(proofs.length / batchSize)}...`));
                
                const results = await manager.verifyBatchProofs(batchProofs);
                verificationResults.push(...results.failures.map(failureIndex => i + failureIndex));
            }
            
            // Generate report if requested
            if (options.generateReport) {
                await generateVerificationReport(
                    proofFiles,
                    proofs,
                    verificationResults,
                    failures,
                    options.reportOutput || 'verification-report.json'
                );
            }
            
            // Summary
            const validCount = proofs.length - verificationResults.length;
            const successRate = proofs.length > 0 ? validCount / proofs.length : 1;
            
            console.log(chalk.green('✅ Directory verification completed'));
            console.log(chalk.gray(`  Total files scanned: ${proofFiles.length}`));
            console.log(chalk.gray(`  Valid proofs: ${validCount}`));
            console.log(chalk.gray(`  Failed proofs: ${verificationResults.length}`));
            console.log(chalk.gray(`  Success rate: ${(successRate * 100).toFixed(1)}%`));
            
            if (failures.length > 0) {
                console.log(chalk.yellow(`  Files with loading errors: ${failures.length}`));
            }
            
            if (verificationResults.length > 0) {
                console.log(chalk.red('\n  Failed verification:'));
                verificationResults.forEach(index => {
                    console.log(chalk.red(`    ${proofs[index].file}`));
                });
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Directory verification failed:'), error.message);
            process.exit(1);
        }
    });

// Command: validate-format
program
    .command('validate-format')
    .description('Validate proof file format without cryptographic verification')
    .requiredOption('-f, --file <file>', 'Proof JSON file')
    .option('--batch', 'Validate batch of files')
    .option('-d, --directory <dir>', 'Directory for batch validation')
    .option('-p, --pattern <pattern>', 'File pattern for batch', '*.json')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📋 Validating Proof Format'));
            
            if (options.batch || options.directory) {
                const files = options.directory 
                    ? await findProofFiles(options.directory, options.pattern)
                    : [options.file];
                
                const results = [];
                
                for (const file of files) {
                    try {
                        const proofData = JSON.parse(fs.readFileSync(file, 'utf-8'));
                        const validation = validateProofFormat(proofData);
                        results.push({ file, ...validation });
                    } catch (error) {
                        results.push({ file, valid: false, error: error.message });
                    }
                }
                
                const validCount = results.filter(r => r.valid).length;
                
                if (options.json) {
                    console.log(JSON.stringify(results, null, 2));
                } else {
                    console.log(chalk.green(`✅ Format validation completed`));
                    console.log(chalk.gray(`  Valid: ${validCount}/${results.length}`));
                    
                    results.forEach(result => {
                        const status = result.valid ? chalk.green('✓') : chalk.red('✗');
                        console.log(`${status} ${result.file}`);
                        if (!result.valid && result.error) {
                            console.log(chalk.gray(`    Error: ${result.error}`));
                        }
                    });
                }
            } else {
                const proofData = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
                const validation = validateProofFormat(proofData);
                
                if (options.json) {
                    console.log(JSON.stringify(validation, null, 2));
                } else {
                    if (validation.valid) {
                        console.log(chalk.green('✅ Proof format is valid'));
                    } else {
                        console.log(chalk.red('❌ Proof format is invalid'));
                        console.log(chalk.gray(`  Errors: ${validation.errors.join(', ')}`));
                    }
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Format validation failed:'), error.message);
            process.exit(1);
        }
    });

// Command: export-keys
program
    .command('export-keys')
    .description('Export verification keys from proofs')
    .requiredOption('-f, --file <file>', 'Proof JSON file')
    .option('-o, --output <dir>', 'Output directory')
    .option('--name <name>', 'Custom key name')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📤 Exporting Verification Keys'));
            
            const proofData = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
            
            if (!proofData.verificationKey) {
                throw new Error('No verification key found in proof');
            }
            
            const outputDir = options.output || './verification-keys';
            const keyName = options.name || `vk-${proofData.dealId}`;
            
            fs.mkdirSync(outputDir, { recursive: true });
            
            const keyPath = path.join(outputDir, `${keyName}.json`);
            fs.writeFileSync(keyPath, JSON.stringify(proofData.verificationKey, null, 2));
            
            console.log(chalk.green('✅ Verification key exported'));
            console.log(chalk.gray(`  File: ${keyPath}`));
            console.log(chalk.gray(`  Proof ID: ${proofData.dealId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Export failed:'), error.message);
            process.exit(1);
        }
    });

// Command: stats
program
    .command('stats')
    .description('Show verification statistics')
    .option('-d, --directory <dir>', 'Directory to analyze')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
        try {
            if (options.directory) {
                const files = await findProofFiles(options.directory, '*.json');
                const stats = await analyzeProofDirectory(files);
                
                if (options.json) {
                    console.log(JSON.stringify(stats, null, 2));
                } else {
                    console.log(chalk.blue('📊 Proof Directory Statistics:'));
                    console.log(chalk.gray(`  Total files: ${stats.totalFiles}`));
                    console.log(chalk.gray(`  Valid proof files: ${stats.validProofs}`));
                    console.log(chalk.gray(`  Invalid files: ${stats.invalidFiles}`));
                    console.log(chalk.gray(`  Circuit types: ${Object.keys(stats.circuitTypes).length}`));
                    
                    console.log(chalk.gray('\n  Circuit type distribution:'));
                    Object.entries(stats.circuitTypes).forEach(([type, count]) => {
                        console.log(chalk.gray(`    ${type}: ${count}`));
                    });
                    
                    console.log(chalk.gray('\n  Age distribution:'));
                    Object.entries(stats.ageDistribution).forEach(([range, count]) => {
                        console.log(chalk.gray(`    ${range}: ${count}`));
                    });
                }
            } else {
                console.log(chalk.yellow('Directory option required for stats command'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Stats analysis failed:'), error.message);
            process.exit(1);
        }
    });

// Help text
program.addHelpText('after', `
Examples:
  # Verify single proof
  verify-proofs single --file proof.json --check-age --verify-commitments
  
  # Verify batch of proofs
  verify-proofs batch --directory ./proofs --parallel --summary
  
  # Verify directory recursively
  verify-proofs directory --directory ./proofs --max-depth 3 --generate-report
  
  # Validate proof format only
  verify-proofs validate-format --file proof.json
  verify-proofs validate-format --directory ./proofs --pattern "shuffle-*.json"
  
  # Export verification keys
  verify-proofs export-keys --file proof.json --output ./keys
  
  # Show statistics
  verify-proofs stats --directory ./proofs
`);

program.parse();

// Helper functions

async function findProofFiles(directory: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
            const subFiles = await findProofFiles(fullPath, pattern);
            files.push(...subFiles);
        } else if (entry.isFile() && matchesPattern(entry.name, pattern)) {
            files.push(fullPath);
        }
    }
    
    return files;
}

async function findProofFilesRecursively(
    directory: string, 
    maxDepth: number, 
    excludePatterns: string[],
    currentDepth: number = 0
): Promise<string[]> {
    if (currentDepth >= maxDepth) return [];
    
    const files: string[] = [];
    
    try {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            
            // Skip excluded patterns
            if (excludePatterns.some(pattern => matchesPattern(entry.name, pattern))) {
                continue;
            }
            
            if (entry.isDirectory()) {
                const subFiles = await findProofFilesRecursively(
                    fullPath, 
                    maxDepth, 
                    excludePatterns, 
                    currentDepth + 1
                );
                files.push(...subFiles);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        // Skip inaccessible directories
    }
    
    return files;
}

function matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*.json') {
        return filename.endsWith('.json');
    }
    
    // Simple wildcard matching
    const regex = new RegExp(pattern.replace('*', '.*'));
    return regex.test(filename);
}

function validateProofFormat(proofData: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required fields
    if (!proofData.proof) {
        errors.push('Missing proof field');
    } else {
        const proof = proofData.proof;
        if (!proof.pi_a || !Array.isArray(proof.pi_a) || proof.pi_a.length !== 3) {
            errors.push('Invalid pi_a field');
        }
        if (!proof.pi_b || !Array.isArray(proof.pi_b) || proof.pi_b.length !== 3) {
            errors.push('Invalid pi_b field');
        }
        if (!proof.pi_c || !Array.isArray(proof.pi_c) || proof.pi_c.length !== 3) {
            errors.push('Invalid pi_c field');
        }
    }
    
    if (!proofData.publicSignals || !Array.isArray(proofData.publicSignals)) {
        errors.push('Missing or invalid publicSignals field');
    }
    
    if (!proofData.verificationKey) {
        errors.push('Missing verificationKey field');
    }
    
    if (!proofData.dealId) {
        errors.push('Missing dealId field');
    }
    
    if (!proofData.timestamp || typeof proofData.timestamp !== 'number') {
        errors.push('Missing or invalid timestamp field');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

async function generateVerificationReport(
    allFiles: string[],
    proofs: Array<{ file: string; proof: any }>,
    verificationFailures: number[],
    loadingFailures: Array<{ file: string; error: string }>,
    outputPath: string
): Promise<void> {
    const report = {
        generatedAt: new Date().toISOString(),
        totalFiles: allFiles.length,
        validProofs: proofs.length,
        failedVerifications: verificationFailures.length,
        failedLoads: loadingFailures.length,
        successRate: proofs.length > 0 ? (proofs.length - verificationFailures.length) / proofs.length : 0,
        failedVerificationFiles: verificationFailures.map(i => proofs[i]?.file),
        failedLoadFiles: loadingFailures,
        circuitTypes: {},
        ageDistribution: {}
    };
    
    // Analyze circuit types
    proofs.forEach(({ proof }) => {
        // This would analyze the circuit type from the proof data
        const type = 'unknown'; // Simplified
        report.circuitTypes[type] = (report.circuitTypes[type] || 0) + 1;
    });
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`  Report saved to: ${outputPath}`));
}

async function analyzeProofDirectory(files: string[]): Promise<any> {
    const stats = {
        totalFiles: files.length,
        validProofs: 0,
        invalidFiles: 0,
        circuitTypes: {} as { [key: string]: number },
        ageDistribution: {
            '0-1 hours': 0,
            '1-24 hours': 0,
            '1-7 days': 0,
            '7+ days': 0
        }
    };
    
    for (const file of files) {
        try {
            const proofData = JSON.parse(fs.readFileSync(file, 'utf-8'));
            
            if (proofData.proof && proofData.publicSignals && proofData.verificationKey) {
                stats.validProofs++;
                
                // Analyze age
                const ageMs = Date.now() - proofData.timestamp;
                const ageHours = ageMs / (1000 * 60 * 60);
                
                if (ageHours <= 1) {
                    stats.ageDistribution['0-1 hours']++;
                } else if (ageHours <= 24) {
                    stats.ageDistribution['1-24 hours']++;
                } else if (ageHours <= 168) { // 7 days
                    stats.ageDistribution['1-7 days']++;
                } else {
                    stats.ageDistribution['7+ days']++;
                }
            } else {
                stats.invalidFiles++;
            }
        } catch (error) {
            stats.invalidFiles++;
        }
    }
    
    return stats;
}