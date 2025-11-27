# Frontend Dockerfile for Railway deployment
# Serves static HTML files using a simple Node.js static file server

FROM node:18-alpine

WORKDIR /app

# Install a simple static file server
RUN npm install -g serve

# Copy frontend files
COPY . .

# Railway sets PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Serve the current directory on the PORT
CMD ["sh", "-c", "serve -s . -l $PORT"]
