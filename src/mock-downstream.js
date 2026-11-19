import express from "express";

const app = express();

app.get("/products", async (req, res) => {
  const roll = Math.random();

  if (roll < 0.25) {
    return res.status(500).json({ error: "downstream failure" });
  }
  if (roll < 0.45) {
    // slow response: 5s
    await new Promise((r) => setTimeout(r, 5000));
  }
  res.json([
    { id: 1, name: "Keyboard" },
    { id: 2, name: "Mouse" },
  ]);
});

app.listen(4000, () => console.log("Mock downstream on :4000"));