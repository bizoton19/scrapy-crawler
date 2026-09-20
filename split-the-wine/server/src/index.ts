import cors from "cors";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { subscribe } from "./realtime/hub.js";
import { receiptsRouter } from "./routes/receipts.js";
import { hasVisionKey } from "./vision/parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const uploadDir = path.resolve(root, "../uploads");
const webFallbackDir = path.resolve(root, "../apps/web-fallback");

fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadDir));
app.use("/api", receiptsRouter);

// Lightweight mobile web claim fallback + static shell
app.use(express.static(webFallbackDir));
app.get("/r/:id", (_req, res) => {
  res.sendFile(path.join(webFallbackDir, "index.html"));
});
app.get("/", (_req, res) => {
  res.sendFile(path.join(webFallbackDir, "index.html"));
});

const port = Number(process.env.PORT ?? 8787);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const receiptId = url.searchParams.get("receiptId");
  if (!receiptId) {
    ws.close(1008, "receiptId required");
    return;
  }
  subscribe(ws, receiptId);
  ws.send(JSON.stringify({ type: "subscribed", receiptId }));
});

server.listen(port, () => {
  console.log(`Split the Wine API on http://localhost:${port}`);
  console.log(
    `Vision: ${hasVisionKey() ? "LIVE (API key present)" : "DEMO mode (set ANTHROPIC_API_KEY or OPENAI_API_KEY)"}`
  );
});
