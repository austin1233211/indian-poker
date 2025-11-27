# Indian Poker Server Dockerfile
# Includes groth16-snark for SNARK proof generation
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy and build groth16-snark first (for SNARK proof generation)
COPY indian-poker-github/groth16-snark/package*.json ./groth16-snark/
WORKDIR /app/groth16-snark
RUN npm install

# Copy groth16-snark source (dist is already built and committed)
COPY indian-poker-github/groth16-snark/ ./

# Now set up indian-poker-server
WORKDIR /app/indian-poker-server
COPY indian-poker-github/indian-poker-server/package*.json ./
RUN npm install --omit=dev

# Copy indian-poker-server source
COPY indian-poker-github/indian-poker-server/ ./

# Expose WebSocket port
EXPOSE 8080

# Start the server
CMD ["node", "index.js"]
