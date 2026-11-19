export class CircuitOpenError extends Error {
  constructor(message = "Circuit is open") {
    super(message);
    this.name = "CircuitOpenError";
    this.status = 503;
  }
}

//   constructor({
//     name = "breaker",
//     failureThreshold = 5,
//     windowMs = 10_000,
//     cooldownMs = 5_000,
//     halfOpenMaxCalls = 1,
//     isFailure = () => true, // which errors count against the circuit
//   } = {}) {
//     Object.assign(this, {
//       name,
//       failureThreshold,
//       windowMs,
//       cooldownMs,
//       halfOpenMaxCalls,
//       isFailure,
//     });

export class CircuitBreaker {
  constructor({
    name = "breaker",
    failureThreshold = 5, // failures within the window to trip
    windowMs = 10_000, // rolling window for counting failures
    cooldownMs = 5_000, // how long to stay OPEN
    halfOpenMaxCalls = 1, // trial calls allowed in HALF_OPEN
    isFailure = () => true, // which errors count against the circuit
  } = {}) {
    Object.assign(this, {
      name,
      failureThreshold,
      windowMs,
      cooldownMs,
      halfOpenMaxCalls,
      isFailure,
    });
    this.state = "CLOSED";
    this.failures = []; // timestamps of recent failures
    this.openedAt = 0;
    this.halfOpenInFlight = 0;
  }

  #transition(next) {
    if (this.state !== next) {
      console.log(`[breaker:${this.name}] ${this.state} -> ${next}`);
      this.state = next;
    }
  }

  get snapshot() {
    return {
      name: this.name,
      state: this.state,
      recentFailures: this.failures.filter((t) => Date.now() - t < this.windowMs).length,
    };
  }

  async exec(fn) {
    const now = Date.now();

    if (this.state === "OPEN") {
      if (now - this.openedAt >= this.cooldownMs) {
        this.#transition("HALF_OPEN");
        this.halfOpenInFlight = 0;
      } else {
        throw new CircuitOpenError(`${this.name} circuit is open`);
      }
    }

    if (this.state === "HALF_OPEN") {
      if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
        throw new CircuitOpenError(`${this.name} circuit is half-open (trial in progress)`);
      }
      this.halfOpenInFlight++;
    }

    try {
      const result = await fn();
      this.#onSuccess();
      return result;
    } catch (err) {
      if (this.isFailure(err)) {
        this.#onFailure();
      } else if (this.state === "HALF_OPEN") {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
      throw err;
    }
  }

  #onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.halfOpenInFlight = 0;
      this.failures = [];
      this.#transition("CLOSED");
    }
  }

  #onFailure() {
    const now = Date.now();

    if (this.state === "HALF_OPEN") {
      this.halfOpenInFlight = 0;
      this.openedAt = now;
      this.#transition("OPEN");
      return;
    }

    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);

    if (this.failures.length >= this.failureThreshold) {
      this.openedAt = now;
      this.#transition("OPEN");
    }
  }
}
