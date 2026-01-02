# Security Logging Guidelines

This document outlines logging best practices for production deployment of the Indian Poker server.

## Current Logging Review

The server uses `console.log`, `console.warn`, and `console.error` for logging. Before production deployment, review the following areas:

### Potentially Sensitive Information Logged

1. **Client IDs** - Logged on connection/disconnection (line 1422, 2994)
   - Risk: Low - UUIDs don't expose user identity
   - Recommendation: Keep for debugging, but ensure logs are secured

2. **Room IDs** - Logged on room creation, game events (lines 1671, 1746, etc.)
   - Risk: Low - UUIDs don't expose game details
   - Recommendation: Keep for debugging

3. **Player Names** - Logged on join, bet, show events (lines 1746, 2170, 2315)
   - Risk: Medium - Could expose user activity patterns
   - Recommendation: Consider hashing or truncating in production

4. **Deck Commitment Hashes** - Partial hashes logged (lines 1837, 2316, 2376)
   - Risk: Low - Only first 16 chars shown, cryptographically safe
   - Recommendation: Keep for verification audit trail

5. **PIR Query Details** - Player ID and card position logged (line 387)
   - Risk: Medium - Could reveal query patterns
   - Recommendation: Remove or reduce verbosity in production

6. **Bet Amounts** - Logged on each bet (line 2170)
   - Risk: Low - Part of game flow
   - Recommendation: Consider reducing verbosity in production

### Recommended Production Configuration

For production deployment, consider implementing structured logging with the following levels:

```javascript
// Recommended logging configuration
const LOG_LEVELS = {
  ERROR: 0,   // Always log errors
  WARN: 1,    // Security warnings, deprecations
  INFO: 2,    // Server lifecycle, connections
  DEBUG: 3,   // Game events, detailed flow
  TRACE: 4    // PIR queries, proof generation
};

// Production: LOG_LEVEL=INFO (or WARN for minimal logging)
// Development: LOG_LEVEL=DEBUG or TRACE
```

### Items to Remove/Modify Before Production

1. **Line 387**: Remove or reduce PIR query logging
   ```javascript
   // Before
   console.log(`PIR Query: Player ${requestingPlayerId} requesting card at position ${position}`);
   
   // After (production)
   // Remove or use DEBUG level only
   ```

2. **Line 2170**: Consider reducing bet logging verbosity
   ```javascript
   // Before
   console.log(`💰 ${player.name} bet ${betAmount} in room ${room.id}`);
   
   // After (production)
   // Use DEBUG level or remove player name
   ```

3. **Demo/Client Logging**: Lines 3240-3453 are for demo purposes
   - These should not run in production server mode
   - Ensure demo code is not included in production builds

### Structured Logging Recommendation

For production, consider migrating to a structured logging library:

```javascript
// Example with Winston or Pino
const logger = require('pino')({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['player.name', 'client.ip'], // Auto-redact sensitive fields
  transport: process.env.NODE_ENV === 'production' 
    ? undefined  // JSON output for log aggregation
    : { target: 'pino-pretty' }  // Pretty print for development
});
```

### Log Retention and Security

1. **Never log**:
   - Encryption keys or secrets
   - Full card data or deck contents
   - Authentication tokens
   - Player passwords or credentials

2. **Secure log storage**:
   - Encrypt logs at rest
   - Restrict access to log files
   - Implement log rotation (max 7-30 days)
   - Use centralized log aggregation (CloudWatch, Datadog, etc.)

3. **Audit logging**:
   - Keep separate audit logs for security events
   - Include: authentication attempts, permission changes, suspicious activity
   - Retain audit logs longer (90+ days)

## Environment Variables for Logging

Add these to your production environment:

```bash
# Logging configuration
LOG_LEVEL=info          # error, warn, info, debug, trace
LOG_FORMAT=json         # json for production, pretty for development
LOG_REDACT_NAMES=true   # Redact player names in logs
```

## Compliance Considerations

If handling real money or operating in regulated jurisdictions:

1. **GDPR**: Ensure player names/IPs can be purged from logs
2. **PCI-DSS**: Never log payment card data
3. **Gaming Regulations**: Maintain audit trail for game outcomes

## Action Items Before Production

- [ ] Set `NODE_ENV=production`
- [ ] Configure `LOG_LEVEL` appropriately
- [ ] Review and test log output for sensitive data
- [ ] Set up log aggregation and monitoring
- [ ] Configure log rotation and retention policies
- [ ] Test that no secrets appear in logs under any error condition
