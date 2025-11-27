# Stage 1: Build the WASM bundle
FROM rust:1.80 AS builder

# Install clang (required by blst crate for BLS12-381 cryptography)
RUN apt-get update && apt-get install -y clang curl && rm -rf /var/lib/apt/lists/*

# Install wasm-pack
RUN cargo install wasm-pack

WORKDIR /app

# Copy the wasm-crypto module
COPY . .

# Build the WASM module (outputs to web/pkg)
RUN wasm-pack build --target web --release --out-dir web/pkg --out-name wasm_crypto

# Copy benchmarks directory to web folder (required by demo.html)
RUN cp -r benchmarks web/benchmarks

# Stage 2: Serve static files
FROM node:18-alpine AS runner

WORKDIR /app

# Copy the built web folder from the builder stage
COPY --from=builder /app/web ./web

# Install serve for static file hosting
RUN npm install -g serve

# Railway sets PORT environment variable; default to 3000 for local runs
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Serve the web directory, binding to 0.0.0.0 so Railway can reach it
CMD ["sh", "-c", "serve -s web -l tcp://0.0.0.0:${PORT}"]
