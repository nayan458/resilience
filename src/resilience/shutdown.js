export function gracefulShutdown(server, { timeoutMs = 10_000, onShutdown } = {}) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining...`);
    onShutdown?.();

    // Stop accepting new connections; the callback fires once in-flight requests finish
    server.close((err) => {
      if (err) {
        console.error("[shutdown] error while closing", err);
        process.exit(1);
      }
      console.log("[shutdown] drained cleanly, exiting");
      process.exit(0);
    });

    // Close idle keep-alive connections so they don't hold close() open
    server.closeIdleConnections?.();

    // Safety net: force exit if something hangs
    setTimeout(() => {
      console.error(`[shutdown] forced exit after ${timeoutMs}ms`);
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { isShuttingDown: () => shuttingDown };
}