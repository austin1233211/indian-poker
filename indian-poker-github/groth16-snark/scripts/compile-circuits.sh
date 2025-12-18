#!/bin/bash

# Circuit Compilation Script
# This script compiles Circom circuits and generates the necessary files for Groth16 proofs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CIRCUITS_DIR="$PROJECT_DIR/circuits"
BUILD_DIR="$PROJECT_DIR/build"
PTAU_DIR="$PROJECT_DIR/ptau"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Groth16 Circuit Compilation ===${NC}"

# Create build directories
mkdir -p "$BUILD_DIR"
mkdir -p "$PTAU_DIR"

# Download Powers of Tau file if not present (using a small one for development)
PTAU_FILE="$PTAU_DIR/powersOfTau28_hez_final_14.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo -e "${YELLOW}Downloading Powers of Tau file...${NC}"
    curl -L -o "$PTAU_FILE" "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau"
    echo -e "${GREEN}Powers of Tau file downloaded${NC}"
fi

# Function to compile a circuit
compile_circuit() {
    local circuit_name=$1
    local circuit_file="$CIRCUITS_DIR/${circuit_name}.circom"
    local circuit_build_dir="$BUILD_DIR/$circuit_name"
    
    if [ ! -f "$circuit_file" ]; then
        echo -e "${RED}Circuit file not found: $circuit_file${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Compiling circuit: $circuit_name${NC}"
    mkdir -p "$circuit_build_dir"
    
    # Compile circuit to R1CS and WASM
    echo "  - Generating R1CS and WASM..."
    circom "$circuit_file" --r1cs --wasm --sym -o "$circuit_build_dir" 2>/dev/null || {
        echo -e "${RED}Failed to compile circuit: $circuit_name${NC}"
        return 1
    }
    
    # Generate zkey (trusted setup for this circuit)
    echo "  - Generating zkey (Phase 2 trusted setup)..."
    npx snarkjs groth16 setup "$circuit_build_dir/${circuit_name}.r1cs" "$PTAU_FILE" "$circuit_build_dir/${circuit_name}_0000.zkey" 2>/dev/null
    
    # Contribute to the ceremony (single contribution for development)
    echo "  - Contributing to ceremony..."
    npx snarkjs zkey contribute "$circuit_build_dir/${circuit_name}_0000.zkey" "$circuit_build_dir/${circuit_name}_final.zkey" --name="Development Contribution" -v -e="$(head -c 64 /dev/urandom | xxd -p)" 2>/dev/null
    
    # Export verification key
    echo "  - Exporting verification key..."
    npx snarkjs zkey export verificationkey "$circuit_build_dir/${circuit_name}_final.zkey" "$circuit_build_dir/verification_key.json" 2>/dev/null
    
    # Clean up intermediate files
    rm -f "$circuit_build_dir/${circuit_name}_0000.zkey"
    
    echo -e "${GREEN}Circuit $circuit_name compiled successfully${NC}"
    echo "  - WASM: $circuit_build_dir/${circuit_name}_js/${circuit_name}.wasm"
    echo "  - zkey: $circuit_build_dir/${circuit_name}_final.zkey"
    echo "  - Verification key: $circuit_build_dir/verification_key.json"
}

# Compile all circuits
CIRCUITS=("cardCommitment" "shuffleVerify" "dealVerify")

for circuit in "${CIRCUITS[@]}"; do
    compile_circuit "$circuit"
    echo ""
done

echo -e "${GREEN}=== All circuits compiled successfully ===${NC}"
echo ""
echo "Build artifacts are in: $BUILD_DIR"
echo ""
echo "To use these in your application:"
echo "  - Load the .wasm file for proof generation"
echo "  - Load the _final.zkey file for proof generation"
echo "  - Load the verification_key.json for proof verification"
