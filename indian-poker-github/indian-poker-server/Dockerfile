# Indian Poker Server Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const ws = new (require('ws'))('ws://localhost:8080'); ws.on('open', () => process.exit(0)); ws.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000);"

# Start the server
CMD ["node", "index.js"]
