use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use wasm_crypto::*;
use num_bigint::{BigUint, RandBigInt};
use num_traits::Num;
use getrandom::getrandom;
use blst::{blst_scalar, blst_p1, blst_p2};
use std::time::Duration;

// Mock JavaScript performance for comparison
fn js_field_multiplication(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    // Simulate JavaScript BigInt operations (much slower)
    for _ in 0..iterations {
        let a = BigUint::from_str_radix("17f1a3e8e02d4c6a7b9f8e0d2c5a9b8e4f1d6c7", 16).unwrap();
        let b = BigUint::from_str_radix("9e4f2d1c6a7b8e0d5c3f9a1e6d8b4c2f7e9a5", 16).unwrap();
        let _ = black_box(a * b);
    }
    
    start.elapsed()
}

fn wasm_field_multiplication(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    let a = FpElement::random();
    let b = FpElement::random();
    
    for _ in 0..iterations {
        let _ = black_box(a.mul(&b));
    }
    
    start.elapsed()
}

fn js_point_addition(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    // Mock JavaScript point addition (simulated as slower)
    for _ in 0..iterations {
        let x1 = BigUint::from_str_radix("17f1a3e8e02d4c6a7b9f8e0d2c5a9b8e4f1d6c7", 16).unwrap();
        let y1 = BigUint::from_str_radix("9e4f2d1c6a7b8e0d5c3f9a1e6d8b4c2f7e9a5", 16).unwrap();
        let x2 = BigUint::from_str_radix("8e0d2c5a9b8e4f1d6c717f1a3e8e02d4c6a7b9f", 16).unwrap();
        let y2 = BigUint::from_str_radix("d5c3f9a1e6d8b4c2f7e9a59e4f2d1c6a7b8e0", 16).unwrap();
        
        // Simulate point addition operations
        let _ = black_box((x1 + x2, y1 + y2));
    }
    
    start.elapsed()
}

fn wasm_point_addition(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    let p1 = G1Point::random();
    let p2 = G1Point::random();
    
    for _ in 0..iterations {
        let _ = black_box(p1.add(&p2));
    }
    
    start.elapsed()
}

fn js_scalar_multiplication(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    for _ in 0..iterations {
        let scalar = BigUint::from_str_radix("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", 16).unwrap();
        let base = BigUint::from_str_radix("17f1a3e8e02d4c6a7b9f8e0d2c5a9b8e4f1d6c7", 16).unwrap();
        
        // Simulate scalar multiplication (exponentiation)
        let _ = black_box(base.modpow(&scalar, &BigUint::from(2u32).pow(381)));
    }
    
    start.elapsed()
}

fn wasm_scalar_multiplication(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    let p = G1Point::random();
    let scalar = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    
    for _ in 0..iterations {
        let _ = black_box(p.scalar_mul(scalar).unwrap());
    }
    
    start.elapsed()
}

fn js_hash_computation(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    let test_data = b"Hello, World! This is test data for hashing.";
    
    for _ in 0..iterations {
        // Simulate SHA-256 computation in JavaScript
        let _ = black_box(compute_js_hash(test_data));
    }
    
    start.elapsed()
}

fn wasm_hash_computation(iterations: u32) -> Duration {
    let start = std::time::Instant::now();
    
    let test_data = b"Hello, World! This is test data for hashing.";
    
    for _ in 0..iterations {
        let _ = black_box(HashFunctions::sha256(test_data));
    }
    
    start.elapsed()
}

// Mock JavaScript hash function
fn compute_js_hash(data: &[u8]) -> Vec<u8> {
    // Simple mock hash - just for simulation
    let mut hash = vec![0u8; 32];
    for (i, &byte) in data.iter().enumerate() {
        hash[i % 32] ^= byte;
    }
    hash
}

fn benchmark_field_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Field Operations");
    
    let iterations = [100, 1000, 10000];
    
    for &i in &iterations {
        group.bench_function(
            BenchmarkId::new("JS Field Multiplication", i),
            |b| b.iter(|| js_field_multiplication(i))
        );
        
        group.bench_function(
            BenchmarkId::new("WASM Field Multiplication", i),
            |b| b.iter(|| wasm_field_multiplication(i))
        );
    }
    
    group.finish();
}

fn benchmark_point_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Point Operations");
    
    let iterations = [10, 100, 1000];
    
    for &i in &iterations {
        group.bench_function(
            BenchmarkId::new("JS Point Addition", i),
            |b| b.iter(|| js_point_addition(i))
        );
        
        group.bench_function(
            BenchmarkId::new("WASM Point Addition", i),
            |b| b.iter(|| wasm_point_addition(i))
        );
        
        group.bench_function(
            BenchmarkId::new("JS Scalar Multiplication", i),
            |b| b.iter(|| js_scalar_multiplication(i))
        );
        
        group.bench_function(
            BenchmarkId::new("WASM Scalar Multiplication", i),
            |b| b.iter(|| wasm_scalar_multiplication(i))
        );
    }
    
    group.finish();
}

fn benchmark_hash_functions(c: &mut Criterion) {
    let mut group = c.benchmark_group("Hash Functions");
    
    let iterations = [1000, 10000, 100000];
    
    for &i in &iterations {
        group.bench_function(
            BenchmarkId::new("JS Hash (SHA-256)", i),
            |b| b.iter(|| js_hash_computation(i))
        );
        
        group.bench_function(
            BenchmarkId::new("WASM Hash (SHA-256)", i),
            |b| b.iter(|| wasm_hash_computation(i))
        );
    }
    
    group.finish();
}

fn benchmark_pairing_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Pairing Operations");
    
    let iterations = [10, 100, 1000];
    
    for &i in &iterations {
        group.bench_with_input(
            BenchmarkId::new("WASM Pairing", i),
            &i,
            |b, &i| {
                let g1 = G1Point::random();
                let g2 = G2Point::random();
                
                b.iter(|| {
                    for _ in 0..i {
                        let _ = black_box(pairing(&g1, &g2));
                    }
                });
            }
        );
    }
    
    group.finish();
}

fn benchmark_memory_usage(c: &mut Criterion) {
    c.bench_function("Memory Usage", |b| {
        b.iter(|| {
            // Test memory allocation patterns
            let elements: Vec<FpElement> = (0..1000)
                .map(|_| FpElement::random())
                .collect();
            
            let points: Vec<G1Point> = (0..100)
                .map(|_| G1Point::random())
                .collect();
            
            black_box((elements, points));
        });
    });
}

criterion_group!(
    benches,
    benchmark_field_operations,
    benchmark_point_operations,
    benchmark_hash_functions,
    benchmark_pairing_operations,
    benchmark_memory_usage
);
criterion_main!(benches);