/**
 * Performance Benchmark for Groth16 SNARK System
 * 
 * This script measures the performance of various operations in the
 * Groth16 SNARK system for poker card dealing verification.
 */

import PokerProofManager from '../src/proofManager';
import Groth16SNARK from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
    operation: string;
    iterations: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    successRate: number;
    details?: any;
}

interface BenchmarkReport {
    timestamp: string;
    system: {
        nodeVersion: string;
        memoryUsage: NodeJS.MemoryUsage;
        platform: string;
    };
    results: BenchmarkResult[];
    summary: {
        totalOperations: number;
        totalTime: number;
        overallSuccessRate: number;
        fastestOperation: string;
        slowestOperation: string;
    };
}

/**
 * Comprehensive Performance Benchmark Suite
 */
export class PerformanceBenchmark {
    private proofManager: PokerProofManager;
    private results: BenchmarkResult[] = [];

    constructor() {
        this.proofManager = new PokerProofManager();
    }

    /**
     * Run all benchmarks
     */
    async runAllBenchmarks(): Promise<BenchmarkReport> {
        console.log('🚀 Starting Performance Benchmark Suite');
        console.log('==========================================');

        await this.proofManager.initialize();

        // Run individual benchmarks
        await this.benchmarkProofGeneration();
        await this.benchmarkProofVerification();
        await this.benchmarkBatchOperations();
        await this.benchmarkConcurrentOperations();
        await this.benchmarkMemoryUsage();
        await this.benchmarkCircuitPerformance();

        // Generate report
        const report = this.generateReport();
        
        console.log('\n📊 Benchmark Results Summary');
        console.log('===========================');
        this.printSummary(report);

        return report;
    }

    /**
     * Benchmark proof generation performance
     */
    private async benchmarkProofGeneration(): Promise<void> {
        console.log('\n🎯 Benchmarking Proof Generation...');

        const iterations = 20;
        const operations = [
            { name: 'deckGeneration', args: ['deck-gen-benchmark'] },
            { name: 'cardCommitment', args: [25, 12345, 'commit-benchmark'] },
            { name: 'cardShuffle', args: [
                Array.from({length: 52}, (_, i) => i),
                Array.from({length: 52}, (_, i) => i).sort(() => Math.random() - 0.5),
                Array.from({length: 52}, (_, i) => i),
                'shuffle-benchmark'
            ]},
            { name: 'cardDealing', args: [
                Array.from({length: 52}, (_, i) => i),
                [0, 1, 2, 3],
                'deal-benchmark'
            ]}
        ];

        for (const operation of operations) {
            const times: number[] = [];
            let successCount = 0;

            for (let i = 0; i < iterations; i++) {
                try {
                    const startTime = performance.now();
                    
                    let result;
                    switch (operation.name) {
                        case 'deckGeneration':
                            result = await this.proofManager.createDeckGenerationProof(operation.args[0]);
                            break;
                        case 'cardCommitment':
                            result = await this.proofManager.createCardCommitmentProof(...operation.args);
                            break;
                        case 'cardShuffle':
                            result = await this.proofManager.createCardShuffleProof(...operation.args);
                            break;
                        case 'cardDealing':
                            result = await this.proofManager.createCardDealingProof(...operation.args);
                            break;
                        default:
                            throw new Error(`Unknown operation: ${operation.name}`);
                    }

                    const endTime = performance.now();
                    
                    if (result.success) {
                        times.push(endTime - startTime);
                        successCount++;
                    }
                } catch (error) {
                    console.warn(`  Iteration ${i + 1} failed for ${operation.name}:`, error.message);
                }
            }

            const result: BenchmarkResult = {
                operation: `generate_${operation.name}`,
                iterations,
                totalTime: times.reduce((a, b) => a + b, 0),
                averageTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
                minTime: times.length > 0 ? Math.min(...times) : 0,
                maxTime: times.length > 0 ? Math.max(...times) : 0,
                successRate: successCount / iterations
            };

            this.results.push(result);
            
            console.log(`  ✅ ${operation.name}: ${result.averageTime.toFixed(2)}ms avg, ${(result.successRate * 100).toFixed(1)}% success`);
        }
    }

    /**
     * Benchmark proof verification performance
     */
    private async benchmarkProofVerification(): Promise<void> {
        console.log('\n🔐 Benchmarking Proof Verification...');

        const iterations = 30;
        const proofs: any[] = [];

        // Generate test proofs first
        for (let i = 0; i < iterations; i++) {
            const result = await this.proofManager.createDeckGenerationProof(`verify-bench-${i}`);
            if (result.success && result.proof) {
                proofs.push(result.proof);
            }
        }

        const times: number[] = [];
        let successCount = 0;

        for (const proof of proofs) {
            try {
                const startTime = performance.now();
                const isValid = await this.proofManager.verifyProof(proof);
                const endTime = performance.now();

                if (isValid) {
                    times.push(endTime - startTime);
                    successCount++;
                }
            } catch (error) {
                console.warn('  Verification failed:', error.message);
            }
        }

        const result: BenchmarkResult = {
            operation: 'verify_proof',
            iterations: proofs.length,
            totalTime: times.reduce((a, b) => a + b, 0),
            averageTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
            minTime: times.length > 0 ? Math.min(...times) : 0,
            maxTime: times.length > 0 ? Math.max(...times) : 0,
            successRate: proofs.length > 0 ? successCount / proofs.length : 0
        };

        this.results.push(result);
        console.log(`  ✅ Verification: ${result.averageTime.toFixed(2)}ms avg, ${(result.successRate * 100).toFixed(1)}% success`);
    }

    /**
     * Benchmark batch operations
     */
    private async benchmarkBatchOperations(): Promise<void> {
        console.log('\n📦 Benchmarking Batch Operations...');

        const batchSizes = [5, 10, 20, 50];

        for (const batchSize of batchSizes) {
            const proofs = Array.from({length: batchSize}, (_, i) => ({
                circuitType: 'deckGeneration' as const,
                publicInputs: { seed: `batch-bench-${i}` },
                privateInputs: {},
                metadata: {
                    gameId: `batch-game-${i}`,
                    timestamp: Date.now()
                }
            }));

            const times: number[] = [];
            let totalSuccess = 0;

            // Sequential batch
            const seqStartTime = performance.now();
            const seqResult = await this.proofManager.generateBatchProofs({
                proofs,
                parallel: false,
                verifyImmediately: false
            });
            const seqEndTime = performance.now();

            if (seqResult.success) {
                const seqTime = seqEndTime - seqStartTime;
                times.push(seqTime);
                totalSuccess = seqResult.results.filter(r => r.success).length;
            }

            // Parallel batch
            const parStartTime = performance.now();
            const parResult = await this.proofManager.generateBatchProofs({
                proofs,
                parallel: true,
                verifyImmediately: false
            });
            const parEndTime = performance.now();

            if (parResult.success) {
                const parTime = parEndTime - parStartTime;
                times.push(parTime);
                totalSuccess = parResult.results.filter(r => r.success).length;
            }

            const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
            const successRate = totalSuccess / (batchSize * 2); // 2 batches

            const result: BenchmarkResult = {
                operation: `batch_${batchSize}`,
                iterations: 2,
                totalTime: times.reduce((a, b) => a + b, 0),
                averageTime: avgTime,
                minTime: times.length > 0 ? Math.min(...times) : 0,
                maxTime: times.length > 0 ? Math.max(...times) : 0,
                successRate,
                details: {
                    batchSize,
                    sequentialTime: seqEndTime - seqStartTime,
                    parallelTime: parEndTime - parStartTime,
                    speedup: (seqEndTime - seqStartTime) / (parEndTime - parStartTime) || 1
                }
            };

            this.results.push(result);
            console.log(`  ✅ Batch ${batchSize}: ${avgTime.toFixed(2)}ms avg, ${(successRate * 100).toFixed(1)}% success, ${result.details?.speedup?.toFixed(2)}x speedup`);
        }
    }

    /**
     * Benchmark concurrent operations
     */
    private async benchmarkConcurrentOperations(): Promise<void> {
        console.log('\n⚡ Benchmarking Concurrent Operations...');

        const concurrencyLevels = [2, 5, 10, 20];

        for (const concurrency of concurrencyLevels) {
            const promises = Array.from({length: concurrency}, (_, i) => 
                this.proofManager.createDeckGenerationProof(`concurrent-bench-${i}-${concurrency}`)
            );

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const endTime = performance.now();

            const successCount = results.filter(r => r.success).length;
            const totalTime = endTime - startTime;
            const throughput = concurrency / (totalTime / 1000); // operations per second

            const result: BenchmarkResult = {
                operation: `concurrent_${concurrency}`,
                iterations: concurrency,
                totalTime,
                averageTime: totalTime / concurrency,
                minTime: Math.min(...results.map(r => r.processingTime)),
                maxTime: Math.max(...results.map(r => r.processingTime)),
                successRate: successCount / concurrency,
                details: {
                    concurrency,
                    throughput,
                    totalTime
                }
            };

            this.results.push(result);
            console.log(`  ✅ Concurrency ${concurrency}: ${throughput.toFixed(2)} ops/sec, ${(result.successRate * 100).toFixed(1)}% success`);
        }
    }

    /**
     * Benchmark memory usage
     */
    private async benchmarkMemoryUsage(): Promise<void> {
        console.log('\n💾 Benchmarking Memory Usage...');

        const initialMemory = process.memoryUsage();
        console.log(`  Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

        // Generate many proofs to test memory usage
        const proofCount = 100;
        const proofs: any[] = [];

        const startMemory = process.memoryUsage();

        for (let i = 0; i < proofCount; i++) {
            const result = await this.proofManager.createDeckGenerationProof(`memory-bench-${i}`);
            if (result.success && result.proof) {
                proofs.push(result.proof);
            }

            // Check memory every 10 proofs
            if ((i + 1) % 10 === 0) {
                const currentMemory = process.memoryUsage();
                console.log(`  After ${i + 1} proofs: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            }
        }

        const peakMemory = process.memoryUsage();
        const memoryIncrease = peakMemory.heapUsed - startMemory.heapUsed;
        const memoryPerProof = memoryIncrease / proofCount;

        console.log(`  Peak memory: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Memory per proof: ${(memoryPerProof / 1024).toFixed(2)} KB`);

        // Clear proofs and check if memory is released
        this.proofManager.clearHistory();
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        const finalMemory = process.memoryUsage();
        const memoryAfterCleanup = finalMemory.heapUsed - startMemory.heapUsed;

        console.log(`  Memory after cleanup: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Memory retained: ${(memoryAfterCleanup / 1024 / 1024).toFixed(2)} MB`);

        const result: BenchmarkResult = {
            operation: 'memory_usage',
            iterations: proofCount,
            totalTime: 0,
            averageTime: 0,
            minTime: 0,
            maxTime: 0,
            successRate: 1.0,
            details: {
                proofCount,
                memoryIncrease,
                memoryPerProof,
                memoryRetained: memoryAfterCleanup
            }
        };

        this.results.push(result);
    }

    /**
     * Benchmark individual circuit performance
     */
    private async benchmarkCircuitPerformance(): Promise<void> {
        console.log('\n🔧 Benchmarking Circuit Performance...');

        const snark = new Groth16SNARK();
        await snark.initialize();

        const circuits = [
            'deckGeneration',
            'cardShuffle',
            'cardDealing',
            'cardCommitment'
        ];

        for (const circuitName of circuits) {
            console.log(`  Testing ${circuitName}...`);

            try {
                // Run trusted setup
                const setupStartTime = performance.now();
                await snark.trustedSetup(circuitName);
                const setupEndTime = performance.now();

                const setupTime = setupEndTime - setupStartTime;

                console.log(`    ✅ Trusted setup: ${setupTime.toFixed(2)}ms`);

                const result: BenchmarkResult = {
                    operation: `trusted_setup_${circuitName}`,
                    iterations: 1,
                    totalTime: setupTime,
                    averageTime: setupTime,
                    minTime: setupTime,
                    maxTime: setupTime,
                    successRate: 1.0
                };

                this.results.push(result);
            } catch (error) {
                console.warn(`    ❌ ${circuitName} failed:`, error.message);
            }
        }
    }

    /**
     * Generate benchmark report
     */
    private generateReport(): BenchmarkReport {
        const systemInfo = {
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            platform: process.platform
        };

        const totalOperations = this.results.reduce((sum, r) => sum + r.iterations, 0);
        const totalTime = this.results.reduce((sum, r) => sum + r.totalTime, 0);
        const totalSuccess = this.results.reduce((sum, r) => sum + (r.successRate * r.iterations), 0);
        const overallSuccessRate = totalOperations > 0 ? totalSuccess / totalOperations : 1;

        const fastestOperation = this.results.reduce((fastest, current) => 
            current.averageTime < fastest.averageTime ? current : fastest
        );
        const slowestOperation = this.results.reduce((slowest, current) => 
            current.averageTime > slowest.averageTime ? current : slowest
        );

        return {
            timestamp: new Date().toISOString(),
            system: systemInfo,
            results: this.results,
            summary: {
                totalOperations,
                totalTime,
                overallSuccessRate,
                fastestOperation: fastestOperation.operation,
                slowestOperation: slowestOperation.operation
            }
        };
    }

    /**
     * Print benchmark summary
     */
    private printSummary(report: BenchmarkReport): void {
        console.log(`Total Operations: ${report.summary.totalOperations}`);
        console.log(`Total Time: ${(report.summary.totalTime / 1000).toFixed(2)}s`);
        console.log(`Overall Success Rate: ${(report.summary.overallSuccessRate * 100).toFixed(1)}%`);
        console.log(`Fastest Operation: ${report.summary.fastestOperation}`);
        console.log(`Slowest Operation: ${report.summary.slowestOperation}`);

        console.log('\nDetailed Results:');
        report.results.forEach(result => {
            console.log(`  ${result.operation}:`);
            console.log(`    Average: ${result.averageTime.toFixed(2)}ms`);
            console.log(`    Range: ${result.minTime.toFixed(2)}ms - ${result.maxTime.toFixed(2)}ms`);
            console.log(`    Success: ${(result.successRate * 100).toFixed(1)}%`);
        });
    }

    /**
     * Save benchmark report to file
     */
    async saveReport(report: BenchmarkReport, filename: string = 'benchmark-report.json'): Promise<void> {
        const filepath = path.join('/workspace/code/groth16-snark', 'benchmarks', filename);
        
        // Create directory if it doesn't exist
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Benchmark report saved: ${filepath}`);
    }

    /**
     * Compare benchmark results
     */
    compareReports(report1: BenchmarkReport, report2: BenchmarkReport): void {
        console.log('\n📈 Benchmark Comparison');
        console.log('========================');

        console.log(`Report 1 (${report1.timestamp}):`);
        console.log(`  Total Operations: ${report1.summary.totalOperations}`);
        console.log(`  Total Time: ${(report1.summary.totalTime / 1000).toFixed(2)}s`);
        console.log(`  Success Rate: ${(report1.summary.overallSuccessRate * 100).toFixed(1)}%`);

        console.log(`\nReport 2 (${report2.timestamp}):`);
        console.log(`  Total Operations: ${report2.summary.totalOperations}`);
        console.log(`  Total Time: ${(report2.summary.totalTime / 1000).toFixed(2)}s`);
        console.log(`  Success Rate: ${(report2.summary.overallSuccessRate * 100).toFixed(1)}%`);

        const timeDiff = ((report2.summary.totalTime - report1.summary.totalTime) / report1.summary.totalTime * 100);
        const successDiff = ((report2.summary.overallSuccessRate - report1.summary.overallSuccessRate) / report1.summary.overallSuccessRate * 100);

        console.log(`\nPerformance Changes:`);
        console.log(`  Time: ${timeDiff > 0 ? '+' : ''}${timeDiff.toFixed(1)}%`);
        console.log(`  Success Rate: ${successDiff > 0 ? '+' : ''}${successDiff.toFixed(1)}%`);
    }
}

// Main execution
async function main() {
    const benchmark = new PerformanceBenchmark();
    
    try {
        const report = await benchmark.runAllBenchmarks();
        await benchmark.saveReport(report);
        
        console.log('\n🎉 Benchmark completed successfully!');
    } catch (error) {
        console.error('\n❌ Benchmark failed:', error);
        process.exit(1);
    }
}

// Run benchmark if this file is executed directly
if (require.main === module) {
    main();
}

export default PerformanceBenchmark;