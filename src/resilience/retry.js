const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(
  fn,
  {
    retries = 2,
    baseDelayMs = 100,
    maxDelayMs = 1000,
    shouldRetry = () => true,
  } = {}
) {
  let attempt = 0;

  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;

      // "Full jitter": random wait between 0 and the exponential cap
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = Math.random() * cap;

      console.log(
        `[retry] attempt ${attempt + 1} failed (${err.message}); retrying in ${Math.round(delay)}ms`
      );
      await sleep(delay);
      attempt++;
    }
  }
}