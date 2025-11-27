#!/bin/bash
# Build script for WASM Crypto Module

set -e

echo "Building WASM Crypto Module..."

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "Error: Rust is not installed. Please install Rust first."
    echo "Visit: https://rustup.rs/"
    exit 1
fi

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Navigate to project directory
cd "$(dirname "$0")"

echo "Current directory: $(pwd)"
echo "Checking Rust toolchain..."

rustup toolchain list
rustup target list --installed

# Install WASM target if not installed
echo "Checking WASM target..."
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    echo "Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Build the WASM module
echo "Building WASM module..."
wasm-pack build --target web --release --out-dir web/pkg --out-name wasm_crypto

echo "Build completed successfully!"
echo "Output directory: web/pkg/"
echo "Generated files:"
ls -la web/pkg/

echo ""
echo "To test the build, run:"
echo "  npx serve web/"
echo "Then open http://localhost:3000 in your browser"