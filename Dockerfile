# Indian Poker Server Dockerfile
# This Dockerfile builds from the repo root for Railway deployment

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files from the indian-poker-server directory
COPY indian-poker-github/indian-poker-server/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code from the indian-poker-server directory
COPY indian-poker-github/indian-poker-server/ ./

# Expose WebSocket port (Railway will set PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "index.js"]
