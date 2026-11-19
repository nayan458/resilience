export class DownstreamError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message, { cause });
    this.name = "DownstreamError";
    this.status = status;
  }
}

export async function callDownstream(url, { timeoutMs = 1000 } = {}) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new DownstreamError(`Downstream responded ${response.status}`, {
        status: 502,
      });
    }
    return await response.json();
  } catch (err) {
    if (err instanceof DownstreamError) throw err;
    if (err.name === "TimeoutError") {
      throw new DownstreamError(`Downstream timed out after ${timeoutMs}ms`, {
        status: 504,
        cause: err,
      });
    }
    throw new DownstreamError(`Downstream unreachable: ${err.message}`, {
      status: 502,
      cause: err,
    });
  }
}