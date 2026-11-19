# Resilience

A small Express service demonstrating common resilience patterns when calling an unreliable downstream dependency.

## Patterns implemented

- **Retry** (`resilience/retry.js`) — retries retryable downstream failures (502/504).
- **Circuit breaker** (`resilience/circuitBreaker.js`) — opens after a failure threshold within a time window, with a cooldown before probing again.
- **Bulkhead** (`resilience/bulkhead.js`) — limits concurrent in-flight calls to the downstream service.
- **Fallback / stale cache** (`resilience/fallback.js`) — serves a cached or default response when the downstream call fails.
- **Rate limiting** (`resilience/rateLimit.js`) — caps incoming request rate per client.
- **Graceful shutdown** (`resilience/shutdown.js`) — marks the service as not-ready and drains in-flight requests on shutdown.

## Running

```bash
npm install

# in one terminal, start the mock downstream service
node mock-downstream.js

# in another terminal, start the main server
npm start
```

The mock downstream listens on port `4000` and randomly fails or responds slowly to simulate an unreliable dependency.

## Endpoints

- `GET /health/live` — liveness probe.
- `GET /health/ready` — readiness probe (reports circuit breaker and bulkhead state).
- `GET /api/products` — fetches products from the downstream service, protected by rate limiting, retry, circuit breaker, bulkhead, and fallback.
