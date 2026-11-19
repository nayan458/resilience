export class BulkheadFullError extends Error {
  constructor(message = "Bulkhead is full") {
    super(message);
    this.name = "BulkheadFullError";
    this.status = 503;
  }
}

export class Bulkhead {
  constructor({ name = "bulkhead", maxConcurrent = 10 } = {}) {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
  }

  async exec(fn) {
    if (this.active >= this.maxConcurrent) {
      throw new BulkheadFullError(`${this.name} bulkhead is full`);
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
    }
  }
}