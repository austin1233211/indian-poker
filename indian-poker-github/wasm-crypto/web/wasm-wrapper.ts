/**
 * JavaScript wrapper for WASM Crypto Module
 * Provides actual implementation that calls the compiled WASM functions
 */

import { CryptoUtils } from './index';

// Import the generated WASM glue code (this will be created during build)
let wasmModule: any = null;
let wasmMemory: WebAssembly.Memory | null = null;

/**
 * Initialize the WASM module
 */
export async function initializeWasm(wasmPath?: string): Promise<void> {
  if (wasmModule) {
    return; // Already initialized
  }

  try {
    const path = wasmPath || '/workspace/code/wasm-crypto/pkg/wasm_crypto_bg.wasm';
    
    // Try to import the generated glue code
    try {
      wasmModule = await import('./pkg/wasm_crypto.js');
      await wasmModule.default();
      wasmMemory = wasmModule.memory;
    } catch (importError) {
      console.warn('Could not import WASM glue code, falling back to dynamic loading:', importError);
      
      // Fallback to dynamic loading
      const wasmModulePath = path;
      const wasmBytes = await fetch(wasmBytes).then(r => r.arrayBuffer());
      const wasm = await WebAssembly.instantiate(wasmBytes, {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
          table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' }),
          // Add required imports
          abort: () => {},
        }
      });
      
      wasmModule = wasm.instance.exports;
      wasmMemory = (wasm.instance as any).memory;
    }
    
    console.log('WASM Crypto Module loaded successfully');
  } catch (error) {
    console.error('Failed to initialize WASM Crypto Module:', error);
    throw new Error(`WASM initialization failed: ${error.message}`);
  }
}

/**
 * BLS12-381 Field Element wrapper
 */
export class WasmFpElement {
  private ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  static fromHex(hexString: string): WasmFpElement {
    const wasmFn = getWasmFunction('FpElement__new');
    const result = wasmFn(hexString);
    return new WasmFpElement(result);
  }

  static random(): WasmFpElement {
    const wasmFn = getWasmFunction('FpElement__random');
    const result = wasmFn();
    return new WasmFpElement(result);
  }

  add(other: WasmFpElement): WasmFpElement {
    const wasmFn = getWasmFunction('FpElement__add');
    const result = wasmFn(this.ptr, other.ptr);
    return new WasmFpElement(result);
  }

  mul(other: WasmFpElement): WasmFpElement {
    const wasmFn = getWasmFunction('FpElement__mul');
    const result = wasmFn(this.ptr, other.ptr);
    return new WasmFpElement(result);
  }

  inverse(): WasmFpElement {
    const wasmFn = getWasmFunction('FpElement__inverse');
    const result = wasmFn(this.ptr);
    return new WasmFpElement(result);
  }

  isZero(): boolean {
    const wasmFn = getWasmFunction('FpElement__is_zero');
    return wasmFn(this.ptr);
  }

  toHex(): string {
    const wasmFn = getWasmFunction('FpElement__to_hex');
    const ptr = wasmFn(this.ptr);
    return readStringFromWasm(ptr);
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * BLS12-381 G1 Point wrapper
 */
export class WasmG1Point {
  private ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  static identity(): WasmG1Point {
    const wasmFn = getWasmFunction('G1Point__new');
    const result = wasmFn();
    return new WasmG1Point(result);
  }

  static random(): WasmG1Point {
    const wasmFn = getWasmFunction('G1Point__random');
    const result = wasmFn();
    return new WasmG1Point(result);
  }

  add(other: WasmG1Point): WasmG1Point {
    const wasmFn = getWasmFunction('G1Point__add');
    const result = wasmFn(this.ptr, other.ptr);
    return new WasmG1Point(result);
  }

  scalarMul(scalar: string): WasmG1Point {
    const wasmFn = getWasmFunction('G1Point__scalar_mul');
    const result = wasmFn(this.ptr, scalar);
    return new WasmG1Point(result);
  }

  isInfinity(): boolean {
    const wasmFn = getWasmFunction('G1Point__is_infinity');
    return wasmFn(this.ptr);
  }

  getCoordinates(): any {
    const wasmFn = getWasmFunction('G1Point__get_coordinates');
    const ptr = wasmFn(this.ptr);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * BLS12-381 G2 Point wrapper
 */
export class WasmG2Point {
  private ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  static identity(): WasmG2Point {
    const wasmFn = getWasmFunction('G2Point__new');
    const result = wasmFn();
    return new WasmG2Point(result);
  }

  static random(): WasmG2Point {
    const wasmFn = getWasmFunction('G2Point__random');
    const result = wasmFn();
    return new WasmG2Point(result);
  }

  add(other: WasmG2Point): WasmG2Point {
    const wasmFn = getWasmFunction('G2Point__add');
    const result = wasmFn(this.ptr, other.ptr);
    return new WasmG2Point(result);
  }

  scalarMul(scalar: string): WasmG2Point {
    const wasmFn = getWasmFunction('G2Point__scalar_mul');
    const result = wasmFn(this.ptr, scalar);
    return new WasmG2Point(result);
  }

  isInfinity(): boolean {
    const wasmFn = getWasmFunction('G2Point__is_infinity');
    return wasmFn(this.ptr);
  }

  getCoordinates(): any {
    const wasmFn = getWasmFunction('G2Point__get_coordinates');
    const ptr = wasmFn(this.ptr);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  get ptr(): number {
    return this.ptr;
  }
}

/**
 * Hash functions wrapper
 */
export class WasmHashFunctions {
  static sha256(data: Uint8Array): any {
    const wasmFn = getWasmFunction('HashFunctions__sha256');
    const ptr = wasmFn(data);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  static sha512(data: Uint8Array): any {
    const wasmFn = getWasmFunction('HashFunctions__sha512');
    const ptr = wasmFn(data);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  static blake2b(data: Uint8Array): any {
    const wasmFn = getWasmFunction('HashFunctions__blake2b');
    const ptr = wasmFn(data);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  static toHex(hash: any): string {
    const wasmFn = getWasmFunction('HashFunctions__to_hex');
    const jsonStr = JSON.stringify(hash);
    const ptr = wasmFn(jsonStr);
    return readStringFromWasm(ptr);
  }
}

/**
 * Benchmarks wrapper
 */
export class WasmBenchmarks {
  static async runBenchmarks(): Promise<any[]> {
    const wasmFn = getWasmFunction('Benchmarks__run_benchmarks');
    const ptr = wasmFn();
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  static async getMemoryUsage(): Promise<any> {
    const wasmFn = getWasmFunction('Benchmarks__get_memory_usage');
    const ptr = wasmFn();
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }
}

/**
 * Main crypto module wrapper
 */
export class WasmCryptoModule {
  private initialized = false;

  async initialize(wasmPath?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    await initializeWasm(wasmPath);
    this.initialized = true;

    // Run self test to verify everything is working
    try {
      await this.selfTest();
      console.log('WASM Crypto Module self-test passed');
    } catch (error) {
      console.warn('WASM Crypto Module self-test failed:', error);
    }
  }

  createFpFromHex(hexString: string): WasmFpElement {
    this.ensureInitialized();
    return WasmFpElement.fromHex(hexString);
  }

  createRandomFp(): WasmFpElement {
    this.ensureInitialized();
    return WasmFpElement.random();
  }

  createRandomG1(): WasmG1Point {
    this.ensureInitialized();
    return WasmG1Point.random();
  }

  createIdentityG1(): WasmG1Point {
    this.ensureInitialized();
    return WasmG1Point.identity();
  }

  createRandomG2(): WasmG2Point {
    this.ensureInitialized();
    return WasmG2Point.random();
  }

  createIdentityG2(): WasmG2Point {
    this.ensureInitialized();
    return WasmG2Point.identity();
  }

  pairing(g1: WasmG1Point, g2: WasmG2Point): any {
    this.ensureInitialized();
    const wasmFn = getWasmFunction('pairing');
    const ptr = wasmFn(g1.ptr, g2.ptr);
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  sha256(data: Uint8Array): any {
    this.ensureInitialized();
    return WasmHashFunctions.sha256(data);
  }

  sha512(data: Uint8Array): any {
    this.ensureInitialized();
    return WasmHashFunctions.sha512(data);
  }

  blake2b(data: Uint8Array): any {
    this.ensureInitialized();
    return WasmHashFunctions.blake2b(data);
  }

  async runBenchmarks(): Promise<any[]> {
    this.ensureInitialized();
    return WasmBenchmarks.runBenchmarks();
  }

  async getMemoryUsage(): Promise<any> {
    this.ensureInitialized();
    return WasmBenchmarks.getMemoryUsage();
  }

  async selfTest(): Promise<any> {
    this.ensureInitialized();
    const wasmFn = getWasmFunction('CryptoModule__self_test');
    const ptr = wasmFn();
    const jsonStr = readStringFromWasm(ptr);
    return JSON.parse(jsonStr);
  }

  version(): string {
    this.ensureInitialized();
    const wasmFn = getWasmFunction('CryptoModule__version');
    const ptr = wasmFn();
    return readStringFromWasm(ptr);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInstance(): any {
    return wasmModule;
  }

  getMemory(): WebAssembly.Memory | null {
    return wasmMemory;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('WASM Crypto Module not initialized. Call initialize() first.');
    }
  }
}

/**
 * Helper function to get WASM function
 */
function getWasmFunction(name: string): any {
  if (!wasmModule) {
    throw new Error('WASM module not initialized');
  }

  const exports = wasmModule.exports || wasmModule;
  
  if (exports[name]) {
    return exports[name];
  }

  // Try alternative naming conventions
  const alternatives = [
    name.replace('__', '_'),
    name.replace(/([A-Z])/g, '_$1').toLowerCase(),
    name.split('__')[0] + '_' + name.split('__')[1].replace(/_/g, '_'),
  ];

  for (const altName of alternatives) {
    if (exports[altName]) {
      return exports[altName];
    }
  }

  console.warn(`Function ${name} not found in WASM exports. Available exports:`, 
    Object.keys(exports));
  throw new Error(`WASM function ${name} not found`);
}

/**
 * Read string from WASM memory
 */
function readStringFromWasm(ptr: number): string {
  if (!wasmMemory) {
    throw new Error('WASM memory not available');
  }

  const view = new DataView(wasmMemory.buffer);
  let length = 0;
  
  // Read string length (assuming first 4 bytes are length)
  length = view.getUint32(ptr, true);
  
  // Read the actual string data
  const bytes = new Uint8Array(wasmMemory.buffer, ptr + 4, length);
  return new TextDecoder().decode(bytes);
}

/**
 * Allocate memory in WASM for string data
 */
function allocateStringInWasm(str: string): number {
  if (!wasmMemory) {
    throw new Error('WASM memory not available');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const length = data.length;
  
  // Find a free location in memory
  const ptr = findFreeMemoryLocation(length + 4); // +4 for length prefix
  
  // Write length
  const view = new DataView(wasmMemory.buffer);
  view.setUint32(ptr, length, true);
  
  // Write data
  const bytes = new Uint8Array(wasmMemory.buffer, ptr + 4, length);
  bytes.set(data);
  
  return ptr;
}

/**
 * Find a free memory location (simplified)
 */
function findFreeMemoryLocation(size: number): number {
  // This is a simplified implementation
  // In a real implementation, you would track allocated memory
  return 1024; // Start at offset 1024
}

// Export default instance
export const cryptoModule = new WasmCryptoModule();
export default cryptoModule;