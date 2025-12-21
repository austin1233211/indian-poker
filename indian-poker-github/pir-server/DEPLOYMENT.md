# PIR Server Deployment Guide

## Overview

The PIR (Private Information Retrieval) server provides privacy-preserving card queries for the Indian Poker game. This document covers deployment options, configuration, and health monitoring.

## Prerequisites

- Node.js 18+ or Docker
- Network access between game server and PIR server
- Environment variables configured

## Deployment Options

### Option 1: Docker Compose (Recommended)

The PIR server is already configured in the main `docker-compose.yml`:

```yaml
pir-server:
  build: ./code/code/pir-server
  ports:
    - "3000:3000"
  environment:
    - NODE_ENV=production
    - PIR_SECRET_KEY=${PIR_SECRET_KEY}
```

Deploy with:
```bash
docker-compose up -d pir-server
```

### Option 2: Standalone Docker

Build and run the PIR server independently:

```bash
cd pir-server
docker build -t indian-poker-pir .
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e PIR_SECRET_KEY=your-secret-key \
  indian-poker-pir
```

### Option 3: Direct Node.js

For development or non-containerized deployments:

```bash
cd pir-server
npm install
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `PIR_SECRET_KEY` | Secret key for PIR operations | (required in production) |
| `JWT_SECRET` | JWT signing secret | (auto-generated if not set) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | 60000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Game Server Configuration

Configure the game server to connect to PIR:

```bash
# Game server environment variables
PIR_ENABLED=true
PIR_SERVER_URL=http://pir-server:3000  # Docker network
# or
PIR_SERVER_URL=http://localhost:3000   # Local development

PIR_REQUIRE_FOR_HIDDEN_CARDS=true
PIR_SERVER_EMAIL=gameserver@indianpoker.local
PIR_SERVER_PASSWORD=your-password
```

## Health Monitoring

### Health Check Endpoint

The PIR server exposes a health check endpoint:

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "pir-server",
  "timestamp": "2025-12-21T08:00:00.000Z",
  "uptime": 3600
}
```

### Docker Health Check

The Dockerfile includes a health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Monitoring Integration

For production deployments, integrate with your monitoring system:

```bash
# Prometheus metrics (if enabled)
GET /metrics

# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

# Kubernetes readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Game Server Health Check Integration

The game server monitors PIR server health automatically:

1. **Startup Check**: Game server checks PIR health on startup
2. **Periodic Checks**: Health is verified before each game starts
3. **Fallback Behavior**: If `PIR_REQUIRE_FOR_HIDDEN_CARDS=false`, game continues with local fallback

### Health Check Flow

```
Game Server                    PIR Server
    |                              |
    |------ GET /health ---------->|
    |<----- 200 OK ----------------|
    |                              |
    |------ POST /api/auth/login ->|
    |<----- JWT Token -------------|
    |                              |
    |------ POST /api/pir/query -->|
    |<----- Card Data -------------|
```

## Troubleshooting

### PIR Server Not Responding

1. Check if container is running: `docker ps | grep pir`
2. Check logs: `docker logs pir-server`
3. Verify network connectivity: `curl http://pir-server:3000/health`

### Authentication Failures

1. Verify credentials in game server env vars
2. Check PIR server logs for auth errors
3. Ensure JWT_SECRET is consistent across restarts

### High Latency

1. Check PIR server resource usage
2. Review rate limiting settings
3. Consider horizontal scaling for high load

## Scaling

For high-availability deployments:

```yaml
# docker-compose.yml with replicas
pir-server:
  deploy:
    replicas: 3
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
```

Use a load balancer (nginx, HAProxy, or cloud LB) in front of PIR server replicas.

## Security Considerations

1. **Network Isolation**: PIR server should only be accessible from game server
2. **TLS**: Use HTTPS in production (terminate at load balancer or configure in app)
3. **Secrets Management**: Use proper secrets management (Vault, AWS Secrets Manager, etc.)
4. **Rate Limiting**: Adjust rate limits based on expected load
5. **Logging**: Enable audit logging for compliance requirements
