#!/bin/bash
# Complete build and test script for WASM Crypto Module

set -e

echo "🚀 Building WASM Crypto Module..."
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
echo -e "\n${BLUE}Checking prerequisites...${NC}"

if ! command -v rustc &> /dev/null; then
    print_error "Rust is not installed. Please install from https://rustup.rs/"
    exit 1
fi
print_status "Rust is installed: $(rustc --version)"

if ! command -v wasm-pack &> /dev/null; then
    print_warning "wasm-pack not found. Installing..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    print_status "wasm-pack installed"
else
    print_status "wasm-pack is installed: $(wasm-pack --version)"
fi

if ! command -v node &> /dev/null; then
    print_warning "Node.js not found. Some features may not work."
else
    print_status "Node.js is installed: $(node --version)"
fi

# Check Rust target
echo -e "\n${BLUE}Checking Rust targets...${NC}"
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    print_info "Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
    print_status "WASM target installed"
else
    print_status "wasm32-unknown-unknown target is installed"
fi

# Clean previous builds
echo -e "\n${BLUE}Cleaning previous builds...${NC}"
rm -rf web/pkg/ 2>/dev/null || true
print_status "Cleaned build directory"

# Build the WASM module
echo -e "\n${BLUE}Building WASM module...${NC}"
if wasm-pack build --target web --release --out-dir web/pkg --out-name wasm_crypto; then
    print_status "WASM module built successfully"
else
    print_error "Failed to build WASM module"
    exit 1
fi

# Check build output
echo -e "\n${BLUE}Build output:${NC}"
ls -la web/pkg/

# Run basic tests
echo -e "\n${BLUE}Running basic tests...${NC}"
if node test-runner.js; then
    print_status "All tests passed"
else
    print_error "Tests failed"
    exit 1
fi

# Build JavaScript documentation
echo -e "\n${BLUE}Building documentation...${NC}"
if [ -f "web/pkg/wasm_crypto.d.ts" ]; then
    print_status "TypeScript definitions generated"
else
    print_warning "TypeScript definitions not found (this is normal for some builds)"
fi

# Create final summary
echo -e "\n${GREEN}🎉 Build completed successfully!${NC}"
echo -e "\n${BLUE}Generated files:${NC}"
echo "  📦 web/pkg/wasm_crypto_bg.wasm    - WASM binary"
echo "  📦 web/pkg/wasm_crypto.js         - JavaScript glue code"
echo "  📦 web/pkg/wasm_crypto_bg.wasm.d.ts - TypeScript definitions"

echo -e "\n${BLUE}Next steps:${NC}"
echo "  🌐 Open web/demo.html in a browser to see the demo"
echo "  🧪 Run 'node test-runner.js' to run tests"
echo "  📊 Run 'npm run benchmark' for performance benchmarks"
echo "  📖 Read INTEGRATION.md for integration examples"

echo -e "\n${BLUE}Quick start:${NC}"
echo "  1. Serve the web directory: npx serve web/"
echo "  2. Open http://localhost:3000/demo.html"
echo "  3. Run benchmarks to see performance improvements"

echo -e "\n${GREEN}✨ WASM Crypto Module is ready for production use!${NC}"

# Optional: Run memory check
echo -e "\n${BLUE}Memory usage check:${NC}"
if [ -f "web/pkg/wasm_crypto_bg.wasm" ]; then
    WASM_SIZE=$(stat -f%z "web/pkg/wasm_crypto_bg.wasm" 2>/dev/null || stat -c%s "web/pkg/wasm_crypto_bg.wasm" 2>/dev/null)
    WASM_SIZE_KB=$((WASM_SIZE / 1024))
    print_info "WASM binary size: ${WASM_SIZE_KB}KB"
    
    if [ $WASM_SIZE_KB -lt 500 ]; then
        print_status "WASM binary is compact and efficient"
    elif [ $WASM_SIZE_KB -lt 1000 ]; then
        print_warning "WASM binary size is moderate"
    else
        print_warning "WASM binary is quite large - consider optimization"
    fi
fi

echo -e "\n${GREEN}Build script completed!${NC}"