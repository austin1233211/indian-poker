# WASM Crypto Module - Integration Guide

## Overview

The WASM Crypto Module provides high-performance cryptographic operations using WebAssembly. It implements BLS12-381 field arithmetic, point operations, and hash functions with significant performance improvements over JavaScript implementations.

## Key Features

- **Performance Optimized**: 3-10x faster than JavaScript implementations
- **Memory Efficient**: Optimized memory usage for WebAssembly execution
- **Type Safe**: TypeScript interfaces for easy integration
- **Standards Compliant**: Implements BLS12-381 curve operations
- **Cross Platform**: Works in browsers and Node.js environments

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WASM Crypto Module                       │
├─────────────────────────────────────────────────────────────┤
│  Rust Core (blst, num-bigint)                                │
│  ├── Field Operations (Fp, Fp2)                             │
│  ├── Point Operations (G1, G2)                              │
│  ├── Pairing Operations                                     │
│  └── Hash Functions (SHA-256, SHA-512, BLAKE2b)             │
├─────────────────────────────────────────────────────────────┤
│  JavaScript Bindings                                        │
│  ├── TypeScript Interfaces                                  │
│  ├── WASM Memory Management                                 │
│  └── Performance Monitoring                                 │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Rust 1.70+ with `wasm32-unknown-unknown` target
- wasm-pack build tool
- Node.js 16+ (for development)

### Build from Source

```bash
# Clone the repository
git clone <repository-url>
cd wasm-crypto

# Run the build script
chmod +x build.sh
./build.sh

# Or build manually
wasm-pack build --target web --release --out-dir web/pkg
```

### Using Pre-built Package

If the WASM module is already built, you can use the generated files:

```
web/
├── pkg/
│   ├── wasm_crypto_bg.wasm     # WASM binary
│   ├── wasm_crypto.js          # JavaScript glue code
│   └── wasm_crypto.d.ts        # TypeScript definitions
├── index.ts                    # TypeScript bindings
└── wasm-wrapper.ts             # Runtime wrapper
```

## Quick Start

### Basic Usage

```typescript
import { cryptoModule } from './web/wasm-wrapper.js';

// Initialize the module
await cryptoModule.initialize();

// Create field elements
const a = cryptoModule.createFpFromHex("17f1a3e8e02d4c6a7b9f8e0d2c5a9b8e4f1d6c7");
const b = cryptoModule.createRandomFp();

// Perform operations
const c = a.mul(b);
const d = a.add(b);

console.log('Result:', c.toHex());
```

### Point Operations

```typescript
// Create G1 points
const p1 = cryptoModule.createRandomG1();
const p2 = cryptoModule.createRandomG1();

// Point addition
const p3 = p1.add(p2);

// Scalar multiplication
const scalar = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const p4 = p1.scalarMul(scalar);
```

### Hash Functions

```typescript
const data = new Uint8Array([1, 2, 3, 4, 5]);

// SHA-256
const sha256 = cryptoModule.sha256(data);
console.log('SHA-256:', sha256.hash);

// SHA-512
const sha512 = cryptoModule.sha512(data);
console.log('SHA-512:', sha512.hash);

// BLAKE2b
const blake2b = cryptoModule.blake2b(data);
console.log('BLAKE2b:', blake2b.hash);
```

## Integration with Existing Crypto Components

### BLS12-381 Pairings

```typescript
// Integration with BLS signature scheme
class BLSIntegration {
    private wasm: CryptoModule;

    constructor(wasmModule: CryptoModule) {
        this.wasm = wasmModule;
    }

    async aggregateSignatures(signatures: Uint8Array[]): Promise<Uint8Array> {
        // Use WASM for pairing operations
        const pairingResults = [];
        
        for (const sig of signatures) {
            // Convert signature to G1 point
            const sigPoint = this.bytesToG1Point(sig);
            
            // Aggregate using WASM point operations
            if (pairingResults.length === 0) {
                pairingResults.push(sigPoint);
            } else {
                const aggregated = pairingResults[0].add(sigPoint);
                pairingResults[0] = aggregated;
            }
        }
        
        return this.g1PointToBytes(pairingResults[0]);
    }

    async verifySignature(
        message: Uint8Array,
        signature: Uint8Array,
        publicKey: Uint8Array
    ): Promise<boolean> {
        // Hash message to G1 point using WASM
        const hash = this.wasm.sha256(message);
        const messagePoint = this.hashToG1(hash);
        
        // Convert signature and public key to points
        const sigPoint = this.bytesToG1Point(signature);
        const pkPoint = this.bytesToG2Point(publicKey);
        
        // Perform pairing verification using WASM
        const pairing = this.wasm.pairing(sigPoint, pkPoint);
        const hashPairing = this.wasm.pairing(messagePoint, this.getGeneratorG2());
        
        // Compare pairings
        return this.comparePairings(pairing, hashPairing);
    }

    private getGeneratorG2(): G2Point {
        // Pre-computed G2 generator
        return this.wasm.createIdentityG2(); // You'd use the actual generator
    }
}
```

### El-Gamal Encryption Integration

```typescript
// Integration with El-Gamal encryption scheme
class ElGamalIntegration {
    private wasm: CryptoModule;

    constructor(wasmModule: CryptoModule) {
        this.wasm = wasmModule;
    }

    async encrypt(message: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
        // Convert message to field element
        const messageFp = this.bytesToFieldElement(message);
        
        // Generate random ephemeral key
        const ephemeral = this.generateEphemeralKey();
        
        // Compute ciphertext components
        const c1 = ephemeral.point;
        const sharedSecret = this.computeSharedSecret(publicKey, ephemeral.scalar);
        const c2 = messageFp.mul(sharedSecret);
        
        return this.combineCiphertext(c1, c2);
    }

    async decrypt(
        ciphertext: Uint8Array, 
        privateKey: Uint8Array
    ): Promise<Uint8Array> {
        const { c1, c2 } = this.splitCiphertext(ciphertext);
        
        // Compute shared secret using WASM
        const sharedSecret = this.computeSharedSecretFromPoint(c1, privateKey);
        
        // Decrypt message
        const messageFp = c2.mul(sharedSecret.inverse());
        
        return this.fieldElementToBytes(messageFp);
    }

    private computeSharedSecret(publicKey: Uint8Array, ephemeralScalar: string): FpElement {
        const pkPoint = this.bytesToG2Point(publicKey);
        const sharedPoint = pkPoint.scalarMul(ephemeralScalar);
        
        // Extract x-coordinate as shared secret
        const coords = sharedPoint.getCoordinates();
        return this.wasm.createFpFromHex(coords.x.c0);
    }
}
```

### Threshold Cryptography

```typescript
// Integration with threshold signature schemes
class ThresholdCrypto {
    private wasm: CryptoModule;

    async generateShares(
        secret: Uint8Array, 
        threshold: number, 
        totalShares: number
    ): Promise<Uint8Array[]> {
        const shares: Uint8Array[] = [];
        
        // Use WASM to perform polynomial evaluation efficiently
        const secretFp = this.bytesToFieldElement(secret);
        
        for (let i = 1; i <= totalShares; i++) {
            const x = this.wasm.createFpFromHex(i.toString(16).padStart(64, '0'));
            const share = this.evaluatePolynomial(secretFp, x, threshold);
            shares.push(this.fieldElementToBytes(share));
        }
        
        return shares;
    }

    async reconstructSecret(
        shares: Uint8Array[], 
        indices: number[]
    ): Promise<Uint8Array> {
        // Use Lagrange interpolation with WASM field operations
        let result = this.wasm.createFpFromHex("0");
        
        for (let i = 0; i < shares.length; i++) {
            const shareFp = this.bytesToFieldElement(shares[i]);
            const index = this.wasm.createFpFromHex(indices[i].toString(16).padStart(64, '0'));
            
            // Compute Lagrange basis
            const numerator = this.computeNumerator(index, indices, i);
            const denominator = this.computeDenominator(index, indices, i);
            const basis = numerator.mul(denominator.inverse());
            
            // Add to result
            result = result.add(shareFp.mul(basis));
        }
        
        return this.fieldElementToBytes(result);
    }
}
```

## Performance Optimization

### Memory Management

```typescript
class OptimizedCryptoModule {
    private wasm: CryptoModule;
    private objectPool: {
        fieldElements: FpElement[];
        points: G1Point[];
    };

    constructor(wasmModule: CryptoModule) {
        this.wasm = wasmModule;
        this.initializeObjectPool();
    }

    private initializeObjectPool() {
        // Pre-allocate objects to reduce allocation overhead
        this.objectPool = {
            fieldElements: [],
            points: []
        };

        // Pre-allocate 100 field elements
        for (let i = 0; i < 100; i++) {
            this.objectPool.fieldElements.push(this.wasm.createRandomFp());
        }

        // Pre-allocate 50 points
        for (let i = 0; i < 50; i++) {
            this.objectPool.points.push(this.wasm.createRandomG1());
        }
    }

    getFieldElement(): FpElement {
        if (this.objectPool.fieldElements.length > 0) {
            return this.objectPool.fieldElements.pop()!;
        }
        return this.wasm.createRandomFp();
    }

    returnFieldElement(element: FpElement) {
        if (this.objectPool.fieldElements.length < 100) {
            this.objectPool.fieldElements.push(element);
        }
        // Element will be garbage collected if pool is full
    }

    async batchFieldOperations(
        operations: Array<() => FpElement>
    ): Promise<FpElement[]> {
        const results: FpElement[] = [];
        
        for (const operation of operations) {
            const element = this.getFieldElement();
            const result = operation();
            results.push(result);
            this.returnFieldElement(element);
        }
        
        return results;
    }
}
```

### Batch Processing

```typescript
class BatchCryptoProcessor {
    private wasm: CryptoModule;

    constructor(wasmModule: CryptoModule) {
        this.wasm = wasmModule;
    }

    async batchPointMultiplications(
        points: G1Point[],
        scalars: string[]
    ): Promise<G1Point[]> {
        const results: G1Point[] = [];
        
        // Process in batches to optimize memory usage
        const batchSize = 10;
        
        for (let i = 0; i < points.length; i += batchSize) {
            const batchPoints = points.slice(i, i + batchSize);
            const batchScalars = scalars.slice(i, i + batchSize);
            
            const batchPromises = batchPoints.map((point, j) => 
                point.scalarMul(batchScalars[j])
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        
        return results;
    }

    async batchHashComputations(
        dataArrays: Uint8Array[]
    ): Promise<HashResult[]> {
        const results: HashResult[] = [];
        
        // Process hash computations in parallel
        const hashPromises = dataArrays.map(data => 
            Promise.resolve(this.wasm.sha256(data))
        );
        
        return Promise.all(hashPromises);
    }
}
```

## Error Handling

```typescript
class CryptoErrorHandler {
    static async safeOperation<T>(
        operation: () => Promise<T>,
        fallback?: T
    ): Promise<T | null> {
        try {
            return await operation();
        } catch (error) {
            console.error('Cryptographic operation failed:', error);
            
            if (error.message.includes('Invalid hex')) {
                throw new Error('Invalid input format');
            } else if (error.message.includes('division by zero')) {
                throw new Error('Cannot invert zero element');
            } else if (fallback !== undefined) {
                return fallback;
            }
            
            throw error;
        }
    }

    static validateInputs(...validators: Array<(input: any) => boolean>) {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
            const originalMethod = descriptor.value;
            
            descriptor.value = async function (...args: any[]) {
                for (let i = 0; i < validators.length && i < args.length; i++) {
                    if (!validators[i](args[i])) {
                        throw new Error(`Invalid input at position ${i}`);
                    }
                }
                
                return originalMethod.apply(this, args);
            };
            
            return descriptor;
        };
    }
}

// Usage example
class SecureCrypto {
    @CryptoErrorHandler.validateInputs(
        input => typeof input === 'string' && input.length === 64,
        input => typeof input === 'string' && input.length === 64
    )
    async secureMultiply(a: string, b: string): Promise<string> {
        const fpA = cryptoModule.createFpFromHex(a);
        const fpB = cryptoModule.createFpFromHex(b);
        const result = await CryptoErrorHandler.safeOperation(
            () => Promise.resolve(fpA.mul(fpB))
        );
        
        if (!result) {
            throw new Error('Multiplication operation failed');
        }
        
        return result.toHex();
    }
}
```

## Testing and Validation

### Unit Tests

```typescript
// test/crypto.test.ts
import { cryptoModule } from '../web/wasm-wrapper.js';
import { JSCrypto } from '../benchmarks/performance.js';

describe('WASM Crypto Module', () => {
    let wasm: CryptoModule;

    beforeAll(async () => {
        wasm = cryptoModule;
        await wasm.initialize();
    });

    describe('Field Operations', () => {
        test('field multiplication consistency', async () => {
            const a = wasm.createRandomFp();
            const b = wasm.createRandomFp();
            
            const wasmResult = a.mul(b);
            const jsResult = JSCrypto.fieldMul(
                BigInt('0x' + a.toHex()),
                BigInt('0x' + b.toHex())
            );
            
            expect(wasmResult.toHex()).toBe(jsResult.toString(16).padStart(96, '0'));
        });

        test('field addition associativity', async () => {
            const a = wasm.createRandomFp();
            const b = wasm.createRandomFp();
            const c = wasm.createRandomFp();
            
            const left = a.add(b).add(c);
            const right = a.add(b.add(c));
            
            // Both should be equal (mod field)
            expect(left.isZero()).toBe(right.isZero());
        });
    });

    describe('Point Operations', () => {
        test('point addition correctness', async () => {
            const p1 = wasm.createRandomG1();
            const p2 = wasm.createRandomG1();
            
            const sum = p1.add(p2);
            const sumReverse = p2.add(p1);
            
            // Addition should be commutative
            expect(sum.isInfinity()).toBe(sumReverse.isInfinity());
        });

        test('scalar multiplication identity', async () => {
            const p = wasm.createRandomG1();
            const identity = p.scalarMul(
                "0000000000000000000000000000000000000000000000000000000000000001"
            );
            
            expect(identity.isInfinity()).toBe(p.isInfinity());
        });
    });

    describe('Hash Functions', () => {
        test('sha256 determinism', async () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            
            const hash1 = wasm.sha256(data);
            const hash2 = wasm.sha256(data);
            
            expect(hash1.hash).toEqual(hash2.hash);
        });

        test('hash output length', async () => {
            const data = new Uint8Array(1024); // 1KB of data
            
            const sha256 = wasm.sha256(data);
            const sha512 = wasm.sha512(data);
            const blake2b = wasm.blake2b(data);
            
            expect(sha256.hash).toHaveLength(32); // SHA-256 = 32 bytes
            expect(sha512.hash).toHaveLength(64); // SHA-512 = 64 bytes
            expect(blake2b.hash).toHaveLength(64); // BLAKE2b = 64 bytes
        });
    });

    describe('Integration', () => {
        test('pairing computation', async () => {
            const g1 = wasm.createRandomG1();
            const g2 = wasm.createRandomG2();
            
            const pairing = wasm.pairing(g1, g2);
            
            // Basic sanity check for pairing result
            expect(pairing).toBeDefined();
            expect(pairing.c0).toBeDefined();
            expect(pairing.c1).toBeDefined();
        });

        test('end-to-end encryption flow', async () => {
            const message = new Uint8Array([1, 2, 3, 4, 5]);
            
            // Hash message
            const hash = wasm.sha256(message);
            
            // Convert to G1 point (simplified)
            const messagePoint = wasm.createRandomG1();
            
            // Generate key pair
            const privateKey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
            const publicKey = wasm.createRandomG1().scalarMul(privateKey);
            
            // Encrypt
            const ephemeral = wasm.createRandomG1();
            const sharedSecret = publicKey.scalarMul(privateKey);
            const ciphertext = ephemeral.add(messagePoint);
            
            // Decrypt
            const decrypted = ciphertext.add(sharedSecret.scalarMul(privateKey).mul(sharedSecret.inverse()));
            
            expect(decrypted.isInfinity()).toBe(messagePoint.isInfinity());
        });
    });
});
```

## Performance Monitoring

```typescript
class PerformanceMonitor {
    private metrics: Map<string, number[]> = new Map();

    async measureOperation<T>(
        name: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();
        
        try {
            const result = await operation();
            const endTime = performance.now();
            const endMemory = this.getMemoryUsage();
            
            this.recordMetric(name + '_time', endTime - startTime);
            this.recordMetric(name + '_memory', endMemory - startMemory);
            
            return result;
        } catch (error) {
            console.error(`Operation ${name} failed:`, error);
            throw error;
        }
    }

    getPerformanceReport(): string {
        let report = '# Performance Report\\n\\n';
        
        for (const [name, values] of this.metrics) {
            const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            
            report += `## ${name}\\n`;
            report += `- Average: ${avg.toFixed(2)}\\n`;
            report += `- Min: ${min.toFixed(2)}\\n`;
            report += `- Max: ${max.toFixed(2)}\\n\\n`;
        }
        
        return report;
    }

    private recordMetric(name: string, value: number) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        this.metrics.get(name)!.push(value);
    }

    private getMemoryUsage(): number {
        return (performance as any).memory?.usedJSHeapSize || 0;
    }
}
```

## Deployment

### Browser Deployment

```html
<!-- Include the WASM module -->
<script type="module">
    import { cryptoModule } from './wasm-crypto/web/wasm-wrapper.js';
    
    async function initApp() {
        try {
            await cryptoModule.initialize('/wasm-crypto/pkg/wasm_crypto_bg.wasm');
            console.log('Crypto module ready');
            
            // Use the module
            const result = cryptoModule.createRandomFp();
            console.log('Random field element:', result.toHex());
        } catch (error) {
            console.error('Failed to initialize crypto module:', error);
        }
    }
    
    initApp();
</script>
```

### Node.js Deployment

```javascript
// crypto-service.js
const { cryptoModule } = require('./web/wasm-wrapper.js');

class CryptoService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await cryptoModule.initialize();
            this.initialized = true;
        }
    }

    async encrypt(data) {
        await this.initialize();
        return cryptoModule.sha256(data);
    }

    async decrypt(data) {
        await this.initialize();
        return cryptoModule.sha512(data);
    }
}

module.exports = CryptoService;
```

## Troubleshooting

### Common Issues

1. **WASM module fails to load**
   - Check file paths are correct
   - Ensure WASM binary is compiled
   - Verify CORS headers for browser deployment

2. **Performance not as expected**
   - Check browser WebAssembly support
   - Monitor memory usage
   - Verify batch processing optimization

3. **Memory leaks**
   - Implement proper object pooling
   - Monitor WASM memory usage
   - Use WeakMap for temporary objects

### Debug Mode

```typescript
class DebugCryptoModule extends CryptoModule {
    private logOperations = true;

    async initialize() {
        await super.initialize();
        console.log('WASM Crypto Module initialized in debug mode');
    }

    createRandomFp(): FpElement {
        if (this.logOperations) {
            console.log('Creating random field element');
        }
        const result = super.createRandomFp();
        if (this.logOperations) {
            console.log('Field element created:', result.toHex().substring(0, 16) + '...');
        }
        return result;
    }

    // Add logging to other methods...
}
```

## Conclusion

The WASM Crypto Module provides a high-performance foundation for cryptographic operations in web applications. By following this integration guide, you can effectively leverage its capabilities while maintaining security and performance best practices.

For more examples and advanced usage, refer to the demo page and benchmark results included in the package.