import express from "express";
import { callDownstream, DownstreamError } from "./resilience/http.js";
import { withRetry } from "./resilience/retry.js";
import { CircuitBreaker, CircuitOpenError } from "./resilience/circuitBreaker.js";
import { StaleCache } from "./resilience/fallBack.js";
import { rateLimit } from "./resilience/rateLimit.js";
import { Bulkhead, BulkheadFullError } from "./resilience/bulkhead.js";
import { gracefulShutdown } from "./resilience/shutdown.js";

const app = express();
const DOWNSTREAM_URL = "http://localhost:4000";

const productsBreaker = new CircuitBreaker({
  name: "products",
  failureThreshold: 5,
  windowMs: 10_000,
  cooldownMs: 5_000,
  isFailure: (err) => !(err instanceof BulkheadFullError),
});

const productsBulkhead = new Bulkhead({ name: "products", maxConcurrent: 5 });
const productsCache = new StaleCache({ maxAgeMs: 5 * 60_000 });
const DEFAULT_PRODUCTS = [{ id: 0, name: "Catalog temporarily unavailable" }];

const isRetryable = (err) =>
  err instanceof DownstreamError && (err.status === 502 || err.status === 504);

let shutdownState = { isShuttingDown: () => false };

// Liveness: the process is up and the event loop is responding
app.get("/health/live", (req, res) => res.json({ status: "alive" }));

// Readiness: should the load balancer send traffic here?
app.get("/health/ready", (req, res) => {
  if (shutdownState.isShuttingDown()) {
    return res.status(503).json({ status: "shutting_down" });
  }
  res.json({
    status: "ready",
    // informational only: a flaky dependency must not fail readiness
    dependencies: { products: productsBreaker.snapshot },
    bulkhead: { active: productsBulkhead.active, max: productsBulkhead.maxConcurrent },
  });
});

app.get(
  "/api/products",
  rateLimit({ windowMs: 10_000, max: 30 }),
  async (req, res) => {
    try {
      const data = await productsBreaker.exec(() =>
        productsBulkhead.exec(() =>
          withRetry(
            () => callDownstream(`${DOWNSTREAM_URL}/products`, { timeoutMs: 1000 }),
            { retries: 2, baseDelayMs: 100, maxDelayMs: 1000, shouldRetry: isRetryable }
          )
        )
      );
      productsCache.set("products", data);
      return res.json(data);
    } catch (err) {
      const isKnownFailure =
        err instanceof CircuitOpenError ||
        err instanceof BulkheadFullError ||
        err instanceof DownstreamError;

      if (!isKnownFailure) {
        return res.status(500).json({ error: "Internal error" });
      }

      console.log(`[fallback] serving degraded response (${err.message})`);

      const cached = productsCache.get("products");
      if (cached) {
        res.set("X-Degraded", "stale-cache");
        res.set("X-Cache-Age-Seconds", String(Math.round(cached.ageMs / 1000)));
        return res.json(cached.value);
      }

      res.set("X-Degraded", "default");
      return res.json(DEFAULT_PRODUCTS);
    }
  }
);

const server = app.listen(3000, () => console.log("App on :3000"));
shutdownState = gracefulShutdown(server, { timeoutMs: 10_000 });




// import express from "express";
// import { callDownstream, DownstreamError } from "./resilience/http.js";
// import { withRetry } from "./resilience/retry.js";
// import { CircuitBreaker, CircuitOpenError } from "./resilience/circuitBreaker.js";
// import { StaleCache } from "./resilience/fallBack.js";
// import { rateLimit } from "./resilience/rateLimit.js";
// import { Bulkhead, BulkheadFullError } from "./resilience/bulkhead.js";

// const app = express();
// const DOWNSTREAM_URL = "http://localhost:4000";

// const productsBreaker = new CircuitBreaker({
//   name: "products",
//   failureThreshold: 5,
//   windowMs: 10_000,
//   cooldownMs: 5_000,
//   isFailure: (err) => !(err instanceof BulkheadFullError),
// });

// const productsBulkhead = new Bulkhead({ name: "products", maxConcurrent: 5 });
// const productsCache = new StaleCache({ maxAgeMs: 5 * 60_000 });
// const DEFAULT_PRODUCTS = [{ id: 0, name: "Catalog temporarily unavailable" }];

// const isRetryable = (err) =>
//   err instanceof DownstreamError && (err.status === 502 || err.status === 504);

// app.get("/health", (req, res) => res.json({ status: "ok" }));

// app.get(
//   "/api/products",
//   rateLimit({ windowMs: 10_000, max: 30 }),
//   async (req, res) => {
//     try {
//       const data = await productsBreaker.exec(() =>
//         productsBulkhead.exec(() =>
//           withRetry(
//             () => callDownstream(`${DOWNSTREAM_URL}/products`, { timeoutMs: 1000 }),
//             { retries: 2, baseDelayMs: 100, maxDelayMs: 1000, shouldRetry: isRetryable }
//           )
//         )
//       );
//       productsCache.set("products", data);
//       return res.json(data);
//     } catch (err) {
//       const isKnownFailure =
//         err instanceof CircuitOpenError ||
//         err instanceof BulkheadFullError ||
//         err instanceof DownstreamError;

//       if (!isKnownFailure) {
//         return res.status(500).json({ error: "Internal error" });
//       }

//       console.log(`[fallback] serving degraded response (${err.message})`);

//       const cached = productsCache.get("products");
//       if (cached) {
//         res.set("X-Degraded", "stale-cache");
//         res.set("X-Cache-Age-Seconds", String(Math.round(cached.ageMs / 1000)));
//         return res.json(cached.value);
//       }

//       res.set("X-Degraded", "default");
//       return res.json(DEFAULT_PRODUCTS);
//     }
//   }
// );

// app.listen(3000, () => console.log("App on :3000"));



// import express from "express";
// import { callDownstream, DownstreamError } from "./resilience/http.js";
// import { withRetry } from "./resilience/retry.js";
// import { CircuitBreaker, CircuitOpenError } from "./resilience/circuitBreaker.js";
// import { StaleCache } from "./resilience/fallback.js";

// const app = express();
// const DOWNSTREAM_URL = "http://localhost:4000";

// const productsBreaker = new CircuitBreaker({
//   name: "products",
//   failureThreshold: 5,
//   windowMs: 10_000,
//   cooldownMs: 5_000,
// });

// const productsCache = new StaleCache({ maxAgeMs: 5 * 60_000 });
// const DEFAULT_PRODUCTS = [{ id: 0, name: "Catalog temporarily unavailable" }];

// const isRetryable = (err) =>
//   err instanceof DownstreamError && (err.status === 502 || err.status === 504);

// app.get("/health", (req, res) => res.json({ status: "ok" }));

// app.get("/api/products", async (req, res) => {
//   try {
//     const data = await productsBreaker.exec(() =>
//       withRetry(
//         () => callDownstream(`${DOWNSTREAM_URL}/products`, { timeoutMs: 1000 }),
//         { retries: 2, baseDelayMs: 100, maxDelayMs: 1000, shouldRetry: isRetryable }
//       )
//     );
//     productsCache.set("products", data); // refresh last-known-good
//     return res.json(data);
//   } catch (err) {
//     const isKnownFailure =
//       err instanceof CircuitOpenError || err instanceof DownstreamError;

//     if (!isKnownFailure) {
//       return res.status(500).json({ error: "Internal error" });
//     }

//     console.log(`[fallback] serving degraded response (${err.message})`);

//     const cached = productsCache.get("products");
//     if (cached) {
//       res.set("X-Degraded", "stale-cache");
//       res.set("X-Cache-Age-Seconds", String(Math.round(cached.ageMs / 1000)));
//       return res.json(cached.value);
//     }

//     res.set("X-Degraded", "default");
//     return res.json(DEFAULT_PRODUCTS);
//   }
// });

// app.listen(3000, () => console.log("App on :3000"));


// // import express from "express";
// // import { callDownstream, DownstreamError } from "./resilience/http.js";
// // import { withRetry } from "./resilience/retry.js";
// // import { CircuitBreaker, CircuitOpenError } from "./resilience/circuitBreaker.js";

// // const app = express();
// // const DOWNSTREAM_URL = "http://localhost:4000";

// // const productsBreaker = new CircuitBreaker({
// //   name: "products",
// //   failureThreshold: 5,
// //   windowMs: 10_000,
// //   cooldownMs: 5_000,
// // });

// // const isRetryable = (err) =>
// //   err instanceof DownstreamError && (err.status === 502 || err.status === 504);

// // app.get("/health", (req, res) => res.json({ status: "ok" }));

// // app.get("/api/products", async (req, res) => {
// //   try {
// //     const data = await productsBreaker.exec(() =>
// //       withRetry(
// //         () => callDownstream(`${DOWNSTREAM_URL}/products`, { timeoutMs: 1000 }),
// //         { retries: 2, baseDelayMs: 100, maxDelayMs: 1000, shouldRetry: isRetryable }
// //       )
// //     );
// //     res.json(data);
// //   } catch (err) {
// //     if (err instanceof CircuitOpenError) {
// //       res.set("Retry-After", "5");
// //       return res.status(503).json({ error: err.message });
// //     }
// //     if (err instanceof DownstreamError) {
// //       return res.status(err.status).json({ error: err.message });
// //     }
// //     res.status(500).json({ error: "Internal error" });
// //   }
// // });

// // app.listen(3000, () => console.log("App on :3000"));




// // // import express from "express";
// // // import { withRetry } from "./resilience/retry.js";
// // // import { callDownstream, DownstreamError } from "./resilience/http.js";

// // // const app = express();
// // // const DOWNSTREAM_URL = "http://localhost:4000";

// // // // A 4xx from downstream means our request is wrong; retrying won't help.
// // // // Our helper only produces 502/504 today, but this keeps the rule explicit.
// // // const isRetryable = (err) =>
// // //   err instanceof DownstreamError && (err.status === 502 || err.status === 504);

// // // app.get("/health", (req, res) => res.json({ status: "ok" }));

// // // app.get("/api/products", async (req, res) => {
// // //   try {
// // //     const data = await withRetry(
// // //       () => callDownstream(
// // //               `${DOWNSTREAM_URL}/products`, 
// // //               { 
// // //                 timeoutMs: 1000 
// // //               }
// // //             )
// // //       ,
// // //       { 
// // //         retries: 2, 
// // //         baseDelayMs: 100, 
// // //         maxDelayMs: 1000, 
// // //         shouldRetry: isRetryable 
// // //       }
// // //     );
// // //     res.json(data);
// // //   } catch (err) {
// // //     if (err instanceof DownstreamError) {
// // //       return res.status(err.status).json({ error: err.message });
// // //     }
// // //     res.status(500).json({ error: "Internal error" });
// // //   }
// // // });

// // // app.listen(3000, () => console.log("App on :3000"));


// // // // import express from "express";
// // // // import { callDownstream, DownstreamError } from "./resilience/http.js";

// // // // const app = express();
// // // // const DOWNSTREAM_URL = "http://localhost:4000";

// // // // app.get("/health", (req, res) => res.json({ status: "ok" }));

// // // // app.get("/api/products", async (req, res) => {
// // // //   try {
// // // //     const data = await callDownstream(`${DOWNSTREAM_URL}/products`, {
// // // //       timeoutMs: 1000,
// // // //     });
// // // //     res.json(data);
// // // //   } catch (err) {
// // // //     if (err instanceof DownstreamError) {
// // // //       return res.status(err.status).json({ error: err.message });
// // // //     }
// // // //     res.status(500).json({ error: "Internal error" });
// // // //   }
// // // // });

// // // // app.listen(3000, () => console.log("App on :3000"));



// // // // // import express from "express";

// // // // // const app = express();
// // // // // const DOWNSTREAM_URL = "http://localhost:4000";

// // // // // app.get("/health", (req, res) => res.json({ status: "ok" }));

// // // // // app.get("/api/products", async (req, res) => {
// // // // //   try {
// // // // //     const response = await fetch(`${DOWNSTREAM_URL}/products`);
// // // // //     if (!response.ok) throw new Error(`Downstream ${response.status}`);
// // // // //     res.json(await response.json());
// // // // //   } catch (err) {
// // // // //     res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
// // // // //   }
// // // // // });

// // // // // app.listen(3000, () => console.log("App on :3000"));