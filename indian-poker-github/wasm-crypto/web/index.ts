/**
 * TypeScript bindings for WASM Crypto Module
 * High-performance cryptographic operations in WebAssembly
 */

export interface PerformanceMetrics {
  operation: string;
  wasm_time_us: number;
  js_time_us: number;
  speedup: number;
  memory_used_kb: number;
}

export interface HashResult {
  hash: number[];
  algorithm: string;
}

export interface PointCoordinates {
  x: string;
  y: string;
  infinity: boolean;
}

export interface G2Coordinates {
  x: {
    c0: string;
    c1: string;
  };
  y: {
    c0: string;
    c1: string;
  };
  infinity: boolean;
}

/**
 * BLS12-381 Field Element (F_p)
 */
export class FpElement {
  private ptr: number;
  private memory: WebAssembly.Memory;
  
  constructor(ptr: number, memory: WebAssembly.Memory) {
    this.ptr = ptr;
    this.memory = memory;
  }

  /**
   * Create a new field element from hex string
   */
  static fromHex(hexString: string): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Create a random field element
   */
  static random(): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Add two field elements
   */
  add(other: FpElement): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Multiply two field elements
   */
  mul(other: FpElement): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Compute the multiplicative inverse
   */
  inverse(): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Check if field element is zero
   */
  isZero(): boolean {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Convert to hex string
   */
  toHex(): string {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get raw pointer for WASM operations
   */
  get ptr(): number {
    return this.ptr;
  }
}

/**
 * BLS12-381 Extension Field Element (F_p²)
 */
export class Fp2Element {
  private ptr: number;
  
  constructor(ptr: number) {
    this.ptr = ptr;
  }

  /**
   * Add two Fp2 elements
   */
  add(other: Fp2Element): Fp2Element {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Multiply two Fp2 elements
   */
  mul(other: Fp2Element): Fp2Element {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get the real component (c0)
   */
  c0(): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get the imaginary component (c1)
   */
  c1(): FpElement {
    throw new Error('Method must be called from WASM context');
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * BLS12-381 G1 Point
 */
export class G1Point {
  private ptr: number;
  
  constructor(ptr: number) {
    this.ptr = ptr;
  }

  /**
   * Create identity point (point at infinity)
   */
  static identity(): G1Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Create a random G1 point
   */
  static random(): G1Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Add two G1 points
   */
  add(other: G1Point): G1Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Scalar multiplication
   */
  scalarMul(scalar: string): G1Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Check if point is at infinity
   */
  isInfinity(): boolean {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get point coordinates as hex strings
   */
  getCoordinates(): PointCoordinates {
    throw new Error('Method must be called from WASM context');
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * BLS12-381 G2 Point
 */
export class G2Point {
  private ptr: number;
  
  constructor(ptr: number) {
    this.ptr = ptr;
  }

  /**
   * Create identity point (point at infinity)
   */
  static identity(): G2Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Create a random G2 point
   */
  static random(): G2Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Add two G2 points
   */
  add(other: G2Point): G2Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Scalar multiplication
   */
  scalarMul(scalar: string): G2Point {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Check if point is at infinity
   */
  isInfinity(): boolean {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get point coordinates as hex strings
   */
  getCoordinates(): G2Coordinates {
    throw new Error('Method must be called from WASM context');
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * Hash function utilities
 */
export class HashFunctions {
  /**
   * SHA-256 hash
   */
  static sha256(data: Uint8Array): HashResult {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * SHA-512 hash
   */
  static sha512(data: Uint8Array): HashResult {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * BLAKE2b hash
   */
  static blake2b(data: Uint8Array): HashResult {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Convert hash to hex string
   */
  static toHex(hash: HashResult): string {
    throw new Error('Method must be called from WASM context');
  }
}

/**
 * Performance benchmarking utilities
 */
export class Benchmarks {
  /**
   * Run performance benchmarks
   */
  static runBenchmarks(): Promise<PerformanceMetrics[]> {
    throw new Error('Method must be called from WASM context');
  }

  /**
   * Get memory usage information
   */
  static getMemoryUsage(): Promise<any> {
    throw new Error('Method must be called from WASM context');
  }
}

/**
 * Main crypto module interface
 */
export class CryptoModule {
  private wasmModule: WebAssembly.Module | null = null;
  private wasmInstance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private initialized = false;

  /**
   * Initialize the crypto module
   */
  async initialize(wasmPath?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const path = wasmPath || '/workspace/code/wasm-crypto/pkg/wasm_crypto_bg.wasm';
      
      // Load WASM module
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load WASM module: ${response.statusText}`);
      }

      const wasmBytes = await response.arrayBuffer();
      
      // Initialize WebAssembly
      const wasmModule = await WebAssembly.compile(wasmBytes);
      
      // Create imports object
      const imports = {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
          table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
        }
      };

      const wasmInstance = await WebAssembly.instantiate(wasmModule, imports);
      
      this.wasmModule = wasmModule;
      this.wasmInstance = wasmInstance;
      this.memory = imports.env.memory;
      this.initialized = true;

      console.log('WASM Crypto Module initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WASM Crypto Module:', error);
      throw error;
    }
  }

  /**
   * Create FpElement from hex string
   */
  createFpFromHex(hexString: string): FpElement {
    this.ensureInitialized();
    
    const func = this.getFunction('FpElement', 'new') as Function;
    return func(hexString);
  }

  /**
   * Create random FpElement
   */
  createRandomFp(): FpElement {
    this.ensureInitialized();
    
    const func = this.getFunction('FpElement', 'random') as Function;
    return func();
  }

  /**
   * Create Fp2Element from two Fp elements
   */
  createFp2FromFp(c0: FpElement, c1: FpElement): Fp2Element {
    this.ensureInitialized();
    
    const func = this.getFunction('Fp2Element', 'new') as Function;
    return func(c0, c1);
  }

  /**
   * Create G1Point from random
   */
  createRandomG1(): G1Point {
    this.ensureInitialized();
    
    const func = this.getFunction('G1Point', 'random') as Function;
    return func();
  }

  /**
   * Create G1Point at infinity
   */
  createIdentityG1(): G1Point {
    this.ensureInitialized();
    
    const func = this.getFunction('G1Point', 'identity') as Function;
    return func();
  }

  /**
   * Create G2Point from random
   */
  createRandomG2(): G2Point {
    this.ensureInitialized();
    
    const func = this.getFunction('G2Point', 'random') as Function;
    return func();
  }

  /**
   * Create G2Point at infinity
   */
  createIdentityG2(): G2Point {
    this.ensureInitialized();
    
    const func = this.getFunction('G2Point', 'identity') as Function;
    return func();
  }

  /**
   * Perform pairing operation
   */
  pairing(g1: G1Point, g2: G2Point): Fp2Element {
    this.ensureInitialized();
    
    const func = this.getFunction('', 'pairing') as Function;
    return func(g1, g2);
  }

  /**
   * SHA-256 hash function
   */
  sha256(data: Uint8Array): HashResult {
    this.ensureInitialized();
    
    const func = this.getFunction('HashFunctions', 'sha256') as Function;
    return func(data);
  }

  /**
   * SHA-512 hash function
   */
  sha512(data: Uint8Array): HashResult {
    this.ensureInitialized();
    
    const func = this.getFunction('HashFunctions', 'sha512') as Function;
    return func(data);
  }

  /**
   * BLAKE2b hash function
   */
  blake2b(data: Uint8Array): HashResult {
    this.ensureInitialized();
    
    const func = this.getFunction('HashFunctions', 'blake2b') as Function;
    return func(data);
  }

  /**
   * Run performance benchmarks
   */
  async runBenchmarks(): Promise<PerformanceMetrics[]> {
    this.ensureInitialized();
    
    const func = this.getFunction('Benchmarks', 'runBenchmarks') as Function;
    return func();
  }

  /**
   * Get memory usage
   */
  async getMemoryUsage(): Promise<any> {
    this.ensureInitialized();
    
    const func = this.getFunction('Benchmarks', 'getMemoryUsage') as Function;
    return func();
  }

  /**
   * Run self test
   */
  async selfTest(): Promise<any> {
    this.ensureInitialized();
    
    const func = this.getFunction('CryptoModule', 'self_test') as Function;
    return func();
  }

  /**
   * Get module version
   */
  version(): string {
    this.ensureInitialized();
    
    const func = this.getFunction('CryptoModule', 'version') as Function;
    return func();
  }

  /**
   * Check if module is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get WASM instance
   */
  getInstance(): WebAssembly.Instance | null {
    return this.wasmInstance;
  }

  /**
   * Get WASM memory
   */
  getMemory(): WebAssembly.Memory | null {
    return this.memory;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('WASM Crypto Module not initialized. Call initialize() first.');
    }
  }

  private getFunction(prefix: string, name: string): any {
    if (!this.wasmInstance) {
      throw new Error('WASM instance not available');
    }

    const exports = this.wasmInstance.exports as any;
    
    // Try different naming conventions
    const possibleNames = [
      `${name}`,
      `${prefix}_${name}`,
      `${prefix}${name}`,
      `wasm_crypto_${name}`,
      `wasm_crypto_${prefix}_${name}`
    ];

    for (const funcName of possibleNames) {
      if (exports[funcName]) {
        return exports[funcName];
      }
    }

    throw new Error(`Function ${name} not found in WASM exports`);
  }
}

/**
 * Utility functions for cryptographic operations
 */
export class CryptoUtils {
  /**
   * Convert Uint8Array to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Convert hex string to Uint8Array
   */
  static hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Generate random bytes
   */
  static generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Check if hex string is valid
   */
  static isValidHex(hex: string): boolean {
    return /^0x[0-9a-fA-F]*$/.test(hex) || /^[0-9a-fA-F]*$/.test(hex);
  }

  /**
   * Convert buffer to base64
   */
  static bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  /**
   * Convert base64 to buffer
   */
  static base64ToBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private startTime: number = 0;
  private startMemory: number = 0;

  /**
   * Start performance measurement
   */
  start(): void {
    this.startTime = performance.now();
    this.startMemory = (performance as any).memory ? 
      (performance as any).memory.usedJSHeapSize : 0;
  }

  /**
   * End performance measurement and return results
   */
  end(operation: string): { operation: string; timeMs: number; memoryDelta?: number } {
    const endTime = performance.now();
    const endMemory = (performance as any).memory ? 
      (performance as any).memory.usedJSHeapSize : 0;

    return {
      operation,
      timeMs: endTime - this.startTime,
      memoryDelta: (performance as any).memory ? endMemory - this.startMemory : undefined
    };
  }

  /**
   * Compare performance between WASM and JavaScript implementations
   */
  static async compareOperations(
    wasmOperation: () => Promise<any>,
    jsOperation: () => Promise<any>,
    iterations: number = 1000
  ): Promise<{ wasmTime: number; jsTime: number; speedup: number }> {
    // Warm up
    await wasmOperation();
    await jsOperation();

    // Measure WASM performance
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await wasmOperation();
    }
    const wasmTime = (performance.now() - wasmStart) / iterations;

    // Measure JS performance
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await jsOperation();
    }
    const jsTime = (performance.now() - jsStart) / iterations;

    return {
      wasmTime,
      jsTime,
      speedup: jsTime / wasmTime
    };
  }
}

// Default export
export default CryptoModule;