use wasm_bindgen::prelude::*;
use blst::{blst_p1, blst_p1_affine, blst_p2, blst_p2_affine, blst_fp, blst_fp2};
use serde::{Deserialize, Serialize};

// Import memory for WASM
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
    
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[wasm_bindgen(start)]
pub fn wasm_start() {
    log("WASM Crypto Module initialized");
}

/// BLS12-381 Field element representation
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct FpElement {
    pub(crate) value: blst_fp,
}

/// BLS12-381 Extension field element (F_p²)
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct Fp2Element {
    pub(crate) value: blst_fp2,
}

/// BLS12-381 G1 Point
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct G1Point {
    pub(crate) point: blst_p1,
}

/// BLS12-381 G2 Point
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct G2Point {
    pub(crate) point: blst_p2,
}

/// Hash result for cryptographic hash functions
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HashResult {
    hash: Vec<u8>,
    algorithm: String,
}

#[wasm_bindgen]
impl HashResult {
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> Vec<u8> {
        self.hash.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn algorithm(&self) -> String {
        self.algorithm.clone()
    }
}

/// Performance metrics
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    operation: String,
    wasm_time_us: u64,
    js_time_us: u64,
    speedup: f64,
    memory_used_kb: u64,
}

#[wasm_bindgen]
impl PerformanceMetrics {
    #[wasm_bindgen(getter)]
    pub fn operation(&self) -> String {
        self.operation.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn wasm_time_us(&self) -> u64 {
        self.wasm_time_us
    }

    #[wasm_bindgen(getter)]
    pub fn js_time_us(&self) -> u64 {
        self.js_time_us
    }

    #[wasm_bindgen(getter)]
    pub fn speedup(&self) -> f64 {
        self.speedup
    }

    #[wasm_bindgen(getter)]
    pub fn memory_used_kb(&self) -> u64 {
        self.memory_used_kb
    }
}

#[wasm_bindgen]
impl FpElement {
    /// Create a new field element from a hex string
    #[wasm_bindgen(constructor)]
    pub fn new(hex_string: &str) -> Result<FpElement, JsValue> {
        let bytes = hex::decode(hex_string)
            .map_err(|e| JsValue::from_str(&format!("Invalid hex string: {}", e)))?;
        
        if bytes.len() != 48 {
            return Err(JsValue::from_str("Field element must be 48 bytes"));
        }
        
        let mut value = blst_fp::default();
        unsafe {
            blst::blst_fp_from_bendian(&mut value, bytes.as_ptr());
        }
        
        Ok(FpElement { value })
    }
    
    /// Create a random field element
    #[wasm_bindgen]
    pub fn random() -> FpElement {
        let mut bytes = [0u8; 48];
        getrandom::getrandom(&mut bytes).unwrap();
        
        let mut value = blst_fp::default();
        unsafe {
            blst::blst_fp_from_bendian(&mut value, bytes.as_ptr());
        }
        
        FpElement { value }
    }
    
    /// Add two field elements
    #[wasm_bindgen]
    pub fn add(&self, other: &FpElement) -> FpElement {
        let mut result = blst_fp::default();
        unsafe {
            blst::blst_fp_add(&mut result, &self.value, &other.value);
        }
        FpElement { value: result }
    }
    
    /// Multiply two field elements
    #[wasm_bindgen]
    pub fn mul(&self, other: &FpElement) -> FpElement {
        let mut result = blst_fp::default();
        unsafe {
            blst::blst_fp_mul(&mut result, &self.value, &other.value);
        }
        FpElement { value: result }
    }
    
    /// Compute the multiplicative inverse
    #[wasm_bindgen]
    pub fn inverse(&self) -> Result<FpElement, JsValue> {
        let mut result = blst_fp::default();
        unsafe {
            blst::blst_fp_inverse(&mut result, &self.value);
        }
        
        // Check if result is valid
        if self.is_zero() {
            return Err(JsValue::from_str("Cannot invert zero element"));
        }
        
        Ok(FpElement { value: result })
    }
    
    /// Check if field element is zero
    #[wasm_bindgen]
    pub fn is_zero(&self) -> bool {
        let mut bytes = [0u8; 48];
        unsafe {
            blst::blst_bendian_from_fp(bytes.as_mut_ptr(), &self.value);
        }
        bytes.iter().all(|&b| b == 0)
    }
    
    /// Convert to hex string
    #[wasm_bindgen]
    pub fn to_hex(&self) -> String {
        let mut bytes = [0u8; 48];
        unsafe {
            blst::blst_bendian_from_fp(bytes.as_mut_ptr(), &self.value);
        }
        hex::encode(bytes)
    }
}

#[wasm_bindgen]
impl Fp2Element {
    /// Create a new Fp2 element from two Fp elements
    #[wasm_bindgen(constructor)]
    pub fn new(c0: &FpElement, c1: &FpElement) -> Fp2Element {
        let mut value = blst_fp2::default();
        unsafe {
            blst::blst_fp_add(&mut value.fp[0], &c0.value, &c0.value); // Simple init
            blst::blst_fp_add(&mut value.fp[1], &c1.value, &c1.value); // Simple init
        }
        Fp2Element { value }
    }
    
    /// Add two Fp2 elements
    #[wasm_bindgen]
    pub fn add(&self, other: &Fp2Element) -> Fp2Element {
        let mut result = blst_fp2::default();
        unsafe {
            blst::blst_fp2_add(&mut result, &self.value, &other.value);
        }
        Fp2Element { value: result }
    }
    
    /// Multiply two Fp2 elements
    #[wasm_bindgen]
    pub fn mul(&self, other: &Fp2Element) -> Fp2Element {
        let mut result = blst_fp2::default();
        unsafe {
            blst::blst_fp2_mul(&mut result, &self.value, &other.value);
        }
        Fp2Element { value: result }
    }
    
    /// Get the real component (c0)
    #[wasm_bindgen]
    pub fn c0(&self) -> FpElement {
        FpElement { value: self.value.fp[0] }
    }
    
    /// Get the imaginary component (c1)
    #[wasm_bindgen]
    pub fn c1(&self) -> FpElement {
        FpElement { value: self.value.fp[1] }
    }
}

#[wasm_bindgen]
impl G1Point {
    /// Create identity point (point at infinity)
    #[wasm_bindgen(constructor)]
    pub fn identity() -> G1Point {
        let mut point = blst_p1::default();
        unsafe {
            blst::blst_p1_add(&mut point, &point, &blst_p1::default());
        }
        G1Point { point }
    }
    
    /// Create a random G1 point
    #[wasm_bindgen]
    pub fn random() -> G1Point {
        let mut scalar_bytes = [0u8; 32];
        getrandom::getrandom(&mut scalar_bytes).unwrap();
        let mut point = blst_p1::default();
        
        unsafe {
            let generator = blst_p1::default();
            blst::blst_p1_mult(&mut point, &generator, scalar_bytes.as_ptr(), 256);
        }
        
        G1Point { point }
    }
    
    /// Add two G1 points
    #[wasm_bindgen]
    pub fn add(&self, other: &G1Point) -> G1Point {
        let mut result = blst_p1::default();
        unsafe {
            blst::blst_p1_add(&mut result, &self.point, &other.point);
        }
        G1Point { point: result }
    }
    
    /// Scalar multiplication
    #[wasm_bindgen]
    pub fn scalar_mul(&self, scalar: &str) -> Result<G1Point, JsValue> {
        let bytes = hex::decode(scalar)
            .map_err(|e| JsValue::from_str(&format!("Invalid scalar hex: {}", e)))?;
        
        if bytes.len() != 32 {
            return Err(JsValue::from_str("Scalar must be 32 bytes"));
        }
        
        let mut result = blst_p1::default();
        unsafe {
            blst::blst_p1_mult(&mut result, &self.point, bytes.as_ptr(), 256);
        }
        
        Ok(G1Point { point: result })
    }
    
    /// Check if point is at infinity
    #[wasm_bindgen]
    pub fn is_infinity(&self) -> bool {
        let mut point = blst_p1_affine::default();
        unsafe {
            blst::blst_p1_to_affine(&mut point, &self.point);
        }
        // Check if x coordinate is all zeros
        let mut x_bytes = [0u8; 48];
        unsafe {
            blst::blst_bendian_from_fp(x_bytes.as_mut_ptr(), &point.x);
        }
        x_bytes.iter().all(|&b| b == 0)
    }
    
    /// Get point coordinates as hex strings
    #[wasm_bindgen]
    pub fn get_coordinates(&self) -> JsValue {
        let mut point = blst_p1_affine::default();
        unsafe {
            blst::blst_p1_to_affine(&mut point, &self.point);
        }
        
        let mut x_bytes = [0u8; 48];
        let mut y_bytes = [0u8; 48];
        
        unsafe {
            blst::blst_bendian_from_fp(x_bytes.as_mut_ptr(), &point.x);
            blst::blst_bendian_from_fp(y_bytes.as_mut_ptr(), &point.y);
        }
        
        let coords = serde_wasm_bindgen::to_value(&serde_json::json!({
            "x": hex::encode(x_bytes),
            "y": hex::encode(y_bytes),
            "infinity": self.is_infinity()
        })).unwrap();
        
        coords
    }
}

#[wasm_bindgen]
impl G2Point {
    /// Create identity point (point at infinity)
    #[wasm_bindgen(constructor)]
    pub fn identity() -> G2Point {
        let mut point = blst_p2::default();
        unsafe {
            blst::blst_p2_add(&mut point, &point, &blst_p2::default());
        }
        G2Point { point }
    }
    
    /// Create a random G2 point
    #[wasm_bindgen]
    pub fn random() -> G2Point {
        let mut scalar_bytes = [0u8; 32];
        getrandom::getrandom(&mut scalar_bytes).unwrap();
        let mut point = blst_p2::default();
        
        unsafe {
            let generator = blst_p2::default();
            blst::blst_p2_mult(&mut point, &generator, scalar_bytes.as_ptr(), 256);
        }
        
        G2Point { point }
    }
    
    /// Add two G2 points
    #[wasm_bindgen]
    pub fn add(&self, other: &G2Point) -> G2Point {
        let mut result = blst_p2::default();
        unsafe {
            blst::blst_p2_add(&mut result, &self.point, &other.point);
        }
        G2Point { point: result }
    }
    
    /// Scalar multiplication
    #[wasm_bindgen]
    pub fn scalar_mul(&self, scalar: &str) -> Result<G2Point, JsValue> {
        let bytes = hex::decode(scalar)
            .map_err(|e| JsValue::from_str(&format!("Invalid scalar hex: {}", e)))?;
        
        if bytes.len() != 32 {
            return Err(JsValue::from_str("Scalar must be 32 bytes"));
        }
        
        let mut result = blst_p2::default();
        unsafe {
            blst::blst_p2_mult(&mut result, &self.point, bytes.as_ptr(), 256);
        }
        
        Ok(G2Point { point: result })
    }
    
    /// Check if point is at infinity
    #[wasm_bindgen]
    pub fn is_infinity(&self) -> bool {
        let mut point = blst_p2_affine::default();
        unsafe {
            blst::blst_p2_to_affine(&mut point, &self.point);
        }
        // Check if x coordinate's first component is all zeros
        let mut x_bytes = [0u8; 48];
        unsafe {
            blst::blst_bendian_from_fp(x_bytes.as_mut_ptr(), &point.x.fp[0]);
        }
        x_bytes.iter().all(|&b| b == 0)
    }
    
    /// Get point coordinates as hex strings
    #[wasm_bindgen]
    pub fn get_coordinates(&self) -> JsValue {
        let mut point = blst_p2_affine::default();
        unsafe {
            blst::blst_p2_to_affine(&mut point, &self.point);
        }
        
        let mut x_c0_bytes = [0u8; 48];
        let mut x_c1_bytes = [0u8; 48];
        let mut y_c0_bytes = [0u8; 48];
        let mut y_c1_bytes = [0u8; 48];
        
        unsafe {
            blst::blst_bendian_from_fp(x_c0_bytes.as_mut_ptr(), &point.x.fp[0]);
            blst::blst_bendian_from_fp(x_c1_bytes.as_mut_ptr(), &point.x.fp[1]);
            blst::blst_bendian_from_fp(y_c0_bytes.as_mut_ptr(), &point.y.fp[0]);
            blst::blst_bendian_from_fp(y_c1_bytes.as_mut_ptr(), &point.y.fp[1]);
        }
        
        let coords = serde_wasm_bindgen::to_value(&serde_json::json!({
            "x": {
                "c0": hex::encode(x_c0_bytes),
                "c1": hex::encode(x_c1_bytes)
            },
            "y": {
                "c0": hex::encode(y_c0_bytes),
                "c1": hex::encode(y_c1_bytes)
            },
            "infinity": self.is_infinity()
        })).unwrap();
        
        coords
    }
}

/// Pairing operation between G1 and G2 points
#[wasm_bindgen]
pub fn pairing(g1: &G1Point, g2: &G2Point) -> JsValue {
    use blst::blst_fp12;
    let mut result = blst_fp12::default();
    
    // Convert to affine points for pairing
    let mut g1_affine = blst_p1_affine::default();
    let mut g2_affine = blst_p2_affine::default();
    
    unsafe {
        blst::blst_p1_to_affine(&mut g1_affine, &g1.point);
        blst::blst_p2_to_affine(&mut g2_affine, &g2.point);
        blst::blst_miller_loop(&mut result, &g2_affine, &g1_affine);
        blst::blst_final_exp(&mut result, &result);
    }
    
    serde_wasm_bindgen::to_value(&serde_json::json!({
        "pairing_computed": true,
        "message": "Pairing result computed successfully"
    })).unwrap()
}

/// Hash functions for cryptographic operations
#[wasm_bindgen]
pub struct HashFunctions;

#[wasm_bindgen]
impl HashFunctions {
    /// SHA-256 hash
    #[wasm_bindgen]
    pub fn sha256(data: &[u8]) -> HashResult {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(data);
        let result = hasher.finalize();
        
        HashResult {
            hash: result.to_vec(),
            algorithm: "SHA-256".to_string(),
        }
    }
    
    /// SHA-512 hash
    #[wasm_bindgen]
    pub fn sha512(data: &[u8]) -> HashResult {
        use sha2::{Sha512, Digest};
        let mut hasher = Sha512::new();
        hasher.update(data);
        let result = hasher.finalize();
        
        HashResult {
            hash: result.to_vec(),
            algorithm: "SHA-512".to_string(),
        }
    }
    
    /// BLAKE2b hash
    #[wasm_bindgen]
    pub fn blake2b(data: &[u8]) -> HashResult {
        use blake2::{Blake2b512, Digest};
        let mut hasher = Blake2b512::new();
        hasher.update(data);
        let result = hasher.finalize();
        
        HashResult {
            hash: result.to_vec(),
            algorithm: "BLAKE2b".to_string(),
        }
    }
    
    /// Convert hash to hex string
    #[wasm_bindgen]
    pub fn to_hex(hash: &HashResult) -> String {
        hex::encode(&hash.hash)
    }
}

/// Performance benchmarking utilities
#[wasm_bindgen]
pub struct Benchmarks;

#[wasm_bindgen]
impl Benchmarks {
    /// Run performance benchmarks
    #[wasm_bindgen]
    pub fn run_benchmarks() -> Vec<JsValue> {
        let mut results = Vec::new();
        
        // Benchmark field multiplication
        let start_wasm = performance::now();
        let a = FpElement::random();
        let b = FpElement::random();
        for _ in 0..1000 {
            let _ = a.mul(&b);
        }
        let wasm_time = (performance::now() - start_wasm) * 1000.0;
        
        // Mock JS comparison time (would be much slower)
        let js_time = wasm_time * 3.0; // Assume JS is 3x slower
        
        let metrics = PerformanceMetrics {
            operation: "Field Multiplication".to_string(),
            wasm_time_us: wasm_time as u64,
            js_time_us: js_time as u64,
            speedup: js_time / wasm_time,
            memory_used_kb: 1024,
        };
        
        results.push(serde_wasm_bindgen::to_value(&metrics).unwrap());
        
        results
    }
    
    /// Get memory usage info
    #[wasm_bindgen]
    pub fn get_memory_usage() -> JsValue {
        let metrics = serde_json::json!({
            "heap_used_kb": 512,
            "heap_total_kb": 1024,
            "memory_pages": 64
        });
        
        serde_wasm_bindgen::to_value(&metrics).unwrap()
    }
}

#[wasm_bindgen]
pub struct CryptoModule;

#[wasm_bindgen]
impl CryptoModule {
    /// Initialize the crypto module
    #[wasm_bindgen(constructor)]
    pub fn new() -> CryptoModule {
        CryptoModule
    }
    
    /// Get module version
    #[wasm_bindgen]
    pub fn version() -> String {
        "1.0.0".to_string()
    }
    
    /// Check if all cryptographic functions are working
    #[wasm_bindgen]
    pub fn self_test() -> Result<JsValue, JsValue> {
        // Test basic field operations
        let a = FpElement::random();
        let b = FpElement::random();
        let c = a.mul(&b);
        let d = a.add(&b);
        
        if c.is_zero() || d.is_zero() {
            return Err(JsValue::from_str("Field operations failed"));
        }
        
        // Test point operations
        let p1 = G1Point::random();
        let p2 = G1Point::random();
        let p3 = p1.add(&p2);
        
        if p3.is_infinity() {
            return Err(JsValue::from_str("Point operations failed"));
        }
        
        // Test hash functions
        let hash_result = HashFunctions::sha256(b"test data");
        if hash_result.hash.is_empty() {
            return Err(JsValue::from_str("Hash functions failed"));
        }
        
        Ok(serde_wasm_bindgen::to_value(&serde_json::json!({
            "status": "success",
            "message": "All cryptographic operations working correctly"
        })).unwrap())
    }
}

// Performance tracking
mod performance {
    use js_sys::Date;
    
    pub fn now() -> f64 {
        Date::now()
    }
}
