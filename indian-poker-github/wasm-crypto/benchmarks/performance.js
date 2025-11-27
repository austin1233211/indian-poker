/**
 * Performance benchmarking utilities for WASM Crypto Module
 * Compares WASM implementations against JavaScript equivalents
 */

import { cryptoModule, WasmCryptoModule } from './wasm-wrapper';

// JavaScript implementations for comparison
class JSCrypto {
  private static FIELD_SIZE = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

  /**
   * Field multiplication using JavaScript BigInt
   */
  static fieldMul(a: bigint, b: bigint): bigint {
    return (a * b) % this.FIELD_SIZE;
  }

  /**
   * Field addition using JavaScript BigInt
   */
  static fieldAdd(a: bigint, b: bigint): bigint {
    let result = a + b;
    if (result >= this.FIELD_SIZE) {
      result -= this.FIELD_SIZE;
    }
    return result;
  }

  /**
   * SHA-256 using Web Crypto API
   */
  static async sha256(data: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }

  /**
   * Generate random field element
   */
  static randomField(): bigint {
    const bytes = new Uint8Array(48);
    crypto.getRandomValues(bytes);
    
    let value = 0n;
    for (const byte of bytes) {
      value = (value << 8n) + BigInt(byte);
    }
    return value % this.FIELD_SIZE;
  }

  /**
   * Mock point addition for G1 (simplified for comparison)
   */
  static pointAdd(p1: {x: bigint, y: bigint}, p2: {x: bigint, y: bigint}): {x: bigint, y: bigint} {
    return {
      x: (p1.x + p2.x) % this.FIELD_SIZE,
      y: (p1.y + p2.y) % this.FIELD_SIZE
    };
  }

  /**
   * Mock scalar multiplication for G1
   */
  static pointScalarMul(p: {x: bigint, y: bigint}, scalar: bigint): {x: bigint, y: bigint} {
    let result = { x: 0n, y: 1n }; // Point at infinity
    let base = { ...p };
    let exp = scalar;
    
    while (exp > 0n) {
      if (exp & 1n) {
        result = this.pointAdd(result, base);
      }
      base = this.pointAdd(base, base);
      exp >>= 1n;
    }
    
    return result;
  }
}

export interface BenchmarkResult {
  operation: string;
  wasmTime: number;
  jsTime: number;
  speedup: number;
  iterations: number;
  memoryUsage: {
    wasm: number;
    js: number;
  };
}

export interface DetailedMetrics {
  fieldOperations: BenchmarkResult[];
  pointOperations: BenchmarkResult[];
  hashOperations: BenchmarkResult[];
  memoryComparison: BenchmarkResult[];
  summary: {
    averageSpeedup: number;
    bestSpeedup: number;
    worstSpeedup: number;
    totalOperationsTested: number;
  };
}

export class PerformanceBenchmark {
  private wasm: WasmCryptoModule;

  constructor() {
    this.wasm = cryptoModule;
  }

  /**
   * Run comprehensive benchmarks
   */
  async runComprehensiveBenchmarks(): Promise<DetailedMetrics> {
    await this.wasm.initialize();

    const results: DetailedMetrics = {
      fieldOperations: [],
      pointOperations: [],
      hashOperations: [],
      memoryComparison: [],
      summary: {
        averageSpeedup: 0,
        bestSpeedup: 0,
        worstSpeedup: Infinity,
        totalOperationsTested: 0
      }
    };

    console.log('Starting comprehensive performance benchmarks...');

    // Field operations benchmarks
    console.log('Benchmarking field operations...');
    results.fieldOperations = await this.benchmarkFieldOperations();

    // Point operations benchmarks  
    console.log('Benchmarking point operations...');
    results.pointOperations = await this.benchmarkPointOperations();

    // Hash operations benchmarks
    console.log('Benchmarking hash operations...');
    results.hashOperations = await this.benchmarkHashOperations();

    // Memory usage benchmarks
    console.log('Benchmarking memory usage...');
    results.memoryComparison = await this.benchmarkMemoryUsage();

    // Calculate summary statistics
    const allResults = [
      ...results.fieldOperations,
      ...results.pointOperations,
      ...results.hashOperations,
      ...results.memoryComparison
    ];

    results.summary.totalOperationsTested = allResults.length;
    results.summary.averageSpeedup = allResults.reduce((sum, r) => sum + r.speedup, 0) / allResults.length;
    results.summary.bestSpeedup = Math.max(...allResults.map(r => r.speedup));
    results.summary.worstSpeedup = Math.min(...allResults.map(r => r.speedup));

    return results;
  }

  /**
   * Benchmark field operations
   */
  private async benchmarkFieldOperations(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const testIterations = [100, 1000, 10000];

    for (const iterations of testIterations) {
      // WASM field multiplication
      const wasmMulTime = await this.measureAsyncOperation(async () => {
        const a = this.wasm.createRandomFp();
        const b = this.wasm.createRandomFp();
        for (let i = 0; i < iterations; i++) {
          a.mul(b);
        }
      });

      // JavaScript field multiplication
      const jsMulTime = await this.measureAsyncOperation(async () => {
        for (let i = 0; i < iterations; i++) {
          const a = JSCrypto.randomField();
          const b = JSCrypto.randomField();
          JSCrypto.fieldMul(a, b);
        }
      });

      results.push({
        operation: `Field Multiplication (${iterations}x)`,
        wasmTime: wasmMulTime,
        jsTime: jsMulTime,
        speedup: jsMulTime / wasmMulTime,
        iterations,
        memoryUsage: { wasm: 0, js: 0 }
      });

      // WASM field addition
      const wasmAddTime = await this.measureAsyncOperation(async () => {
        const a = this.wasm.createRandomFp();
        const b = this.wasm.createRandomFp();
        for (let i = 0; i < iterations; i++) {
          a.add(b);
        }
      });

      // JavaScript field addition
      const jsAddTime = await this.measureAsyncOperation(async () => {
        for (let i = 0; i < iterations; i++) {
          const a = JSCrypto.randomField();
          const b = JSCrypto.randomField();
          JSCrypto.fieldAdd(a, b);
        }
      });

      results.push({
        operation: `Field Addition (${iterations}x)`,
        wasmTime: wasmAddTime,
        jsTime: jsAddTime,
        speedup: jsAddTime / wasmAddTime,
        iterations,
        memoryUsage: { wasm: 0, js: 0 }
      });
    }

    return results;
  }

  /**
   * Benchmark point operations
   */
  private async benchmarkPointOperations(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const testIterations = [10, 100, 1000];

    for (const iterations of testIterations) {
      // WASM G1 point addition
      const wasmPointAddTime = await this.measureAsyncOperation(async () => {
        const p1 = this.wasm.createRandomG1();
        const p2 = this.wasm.createRandomG1();
        for (let i = 0; i < iterations; i++) {
          p1.add(p2);
        }
      });

      // JavaScript mock point addition
      const jsPointAddTime = await this.measureAsyncOperation(async () => {
        for (let i = 0; i < iterations; i++) {
          const p1 = { x: JSCrypto.randomField(), y: JSCrypto.randomField() };
          const p2 = { x: JSCrypto.randomField(), y: JSCrypto.randomField() };
          JSCrypto.pointAdd(p1, p2);
        }
      });

      results.push({
        operation: `G1 Point Addition (${iterations}x)`,
        wasmTime: wasmPointAddTime,
        jsTime: jsPointAddTime,
        speedup: jsPointAddTime / wasmPointAddTime,
        iterations,
        memoryUsage: { wasm: 0, js: 0 }
      });

      // WASM scalar multiplication
      const scalar = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      
      const wasmScalarMulTime = await this.measureAsyncOperation(async () => {
        const p = this.wasm.createRandomG1();
        for (let i = 0; i < iterations; i++) {
          p.scalarMul(scalar);
        }
      });

      // JavaScript mock scalar multiplication
      const jsScalarMulTime = await this.measureAsyncOperation(async () => {
        const scalarBigInt = BigInt('0x' + scalar);
        for (let i = 0; i < iterations; i++) {
          const p = { x: JSCrypto.randomField(), y: JSCrypto.randomField() };
          JSCrypto.pointScalarMul(p, scalarBigInt);
        }
      });

      results.push({
        operation: `G1 Scalar Multiplication (${iterations}x)`,
        wasmTime: wasmScalarMulTime,
        jsTime: jsScalarMulTime,
        speedup: jsScalarMulTime / wasmScalarMulTime,
        iterations,
        memoryUsage: { wasm: 0, js: 0 }
      });
    }

    return results;
  }

  /**
   * Benchmark hash operations
   */
  private async benchmarkHashOperations(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const testIterations = [100, 1000, 10000];
    const testData = new Uint8Array(1024); // 1KB of test data
    crypto.getRandomValues(testData);

    for (const iterations of testIterations) {
      // WASM SHA-256
      const wasmHashTime = await this.measureAsyncOperation(async () => {
        for (let i = 0; i < iterations; i++) {
          this.wasm.sha256(testData);
        }
      });

      // JavaScript SHA-256 using Web Crypto API
      const jsHashTime = await this.measureAsyncOperation(async () => {
        for (let i = 0; i < iterations; i++) {
          await JSCrypto.sha256(testData);
        }
      });

      results.push({
        operation: `SHA-256 Hash (${iterations}x)`,
        wasmTime: wasmHashTime,
        jsTime: jsHashTime,
        speedup: jsHashTime / wasmHashTime,
        iterations,
        memoryUsage: { wasm: 0, js: 0 }
      });
    }

    return results;
  }

  /**
   * Benchmark memory usage
   */
  private async benchmarkMemoryUsage(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Memory usage for field elements
    const wasmFieldMemory = await this.measureMemoryUsage(async () => {
      const elements = [];
      for (let i = 0; i < 1000; i++) {
        elements.push(this.wasm.createRandomFp());
      }
    });

    const jsFieldMemory = await this.measureMemoryUsage(async () => {
      const elements = [];
      for (let i = 0; i < 1000; i++) {
        elements.push(JSCrypto.randomField());
      }
    });

    results.push({
      operation: 'Field Element Memory (1000 elements)',
      wasmTime: 0,
      jsTime: 0,
      speedup: jsFieldMemory / wasmFieldMemory,
      iterations: 1000,
      memoryUsage: { wasm: wasmFieldMemory, js: jsFieldMemory }
    });

    // Memory usage for points
    const wasmPointMemory = await this.measureMemoryUsage(async () => {
      const points = [];
      for (let i = 0; i < 100; i++) {
        points.push(this.wasm.createRandomG1());
      }
    });

    const jsPointMemory = await this.measureMemoryUsage(async () => {
      const points = [];
      for (let i = 0; i < 100; i++) {
        points.push({
          x: JSCrypto.randomField(),
          y: JSCrypto.randomField()
        });
      }
    });

    results.push({
      operation: 'G1 Point Memory (100 points)',
      wasmTime: 0,
      jsTime: 0,
      speedup: jsPointMemory / wasmPointMemory,
      iterations: 100,
      memoryUsage: { wasm: wasmPointMemory, js: jsPointMemory }
    });

    return results;
  }

  /**
   * Measure execution time of async operation
   */
  private async measureAsyncOperation(operation: () => Promise<void>): Promise<number> {
    const startTime = performance.now();
    await operation();
    return performance.now() - startTime;
  }

  /**
   * Measure memory usage of operation
   */
  private async measureMemoryUsage(operation: () => Promise<void>): Promise<number> {
    // Get initial memory if available
    const initialMemory = (performance as any).memory ? 
      (performance as any).memory.usedJSHeapSize : 0;

    await operation();

    // Get final memory
    const finalMemory = (performance as any).memory ? 
      (performance as any).memory.usedJSHeapSize : 0;

    return finalMemory - initialMemory;
  }

  /**
   * Generate benchmark report
   */
  generateReport(results: DetailedMetrics): string {
    let report = '# WASM Crypto Module Performance Report\n\n';
    
    report += `## Summary\n`;
    report += `- Average Speedup: ${results.summary.averageSpeedup.toFixed(2)}x\n`;
    report += `- Best Speedup: ${results.summary.bestSpeedup.toFixed(2)}x\n`;
    report += `- Worst Speedup: ${results.summary.worstSpeedup.toFixed(2)}x\n`;
    report += `- Total Operations Tested: ${results.summary.totalOperationsTested}\n\n`;

    // Field operations
    report += `## Field Operations\n`;
    for (const result of results.fieldOperations) {
      report += `### ${result.operation}\n`;
      report += `- WASM Time: ${result.wasmTime.toFixed(2)}ms\n`;
      report += `- JS Time: ${result.jsTime.toFixed(2)}ms\n`;
      report += `- Speedup: ${result.speedup.toFixed(2)}x\n\n`;
    }

    // Point operations
    report += `## Point Operations\n`;
    for (const result of results.pointOperations) {
      report += `### ${result.operation}\n`;
      report += `- WASM Time: ${result.wasmTime.toFixed(2)}ms\n`;
      report += `- JS Time: ${result.jsTime.toFixed(2)}ms\n`;
      report += `- Speedup: ${result.speedup.toFixed(2)}x\n\n`;
    }

    // Hash operations
    report += `## Hash Operations\n`;
    for (const result of results.hashOperations) {
      report += `### ${result.operation}\n`;
      report += `- WASM Time: ${result.wasmTime.toFixed(2)}ms\n`;
      report += `- JS Time: ${result.jsTime.toFixed(2)}ms\n`;
      report += `- Speedup: ${result.speedup.toFixed(2)}x\n\n`;
    }

    // Memory usage
    report += `## Memory Usage\n`;
    for (const result of results.memoryComparison) {
      report += `### ${result.operation}\n`;
      report += `- WASM Memory: ${(result.memoryUsage.wasm / 1024).toFixed(2)}KB\n`;
      report += `- JS Memory: ${(result.memoryUsage.js / 1024).toFixed(2)}KB\n`;
      report += `- Memory Efficiency: ${result.speedup.toFixed(2)}x\n\n`;
    }

    return report;
  }
}

// Export benchmark utilities
export { JSCrypto };
export default PerformanceBenchmark;