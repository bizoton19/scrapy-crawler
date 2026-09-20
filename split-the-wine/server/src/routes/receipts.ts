import { Router } from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  createClaim,
  createReceipt,
  deleteClaim,
  finalizeReceipt,
  listReceipts,
  loadReceipt,
  publishReceipt,
  replaceDraftItems,
  setHostInfo,
  totalsFor,
} from "../receipts.js";
import { hasVisionKey, parseReceiptImage } from "../vision/parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "../../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${nanoid(12)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
});

export const receiptsRouter = Router();

receiptsRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    visionConfigured: hasVisionKey(),
    visionMode: hasVisionKey() ? "live" : "demo",
  });
});

receiptsRouter.get("/receipts", (_req, res) => {
  res.json({ receipts: listReceipts() });
});

receiptsRouter.post("/receipts", upload.single("image"), (req, res) => {
  const filename = req.file?.filename ?? null;
  const receipt = createReceipt(filename);
  res.status(201).json({
    receiptId: receipt.id,
    imageUrl: receipt.imageUrl,
    receipt,
  });
});

receiptsRouter.post("/receipts/:id/parse", async (req, res) => {
  const receipt = loadReceipt(req.params.id);
  if (!receipt) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  try {
    let buffer: Buffer | null = null;
    let mime = "image/jpeg";

    if (req.body?.useDemo === true || req.body?.useDemo === "true") {
      const { DEMO_PARSE } = await import("../vision/parse.js");
      replaceDraftItems(
        receipt.id,
        DEMO_PARSE.restaurant,
        DEMO_PARSE.items,
        DEMO_PARSE.fees
      );
      res.json({
        ...DEMO_PARSE,
        source: "demo",
        receipt: loadReceipt(receipt.id),
      });
      return;
    }

    const row = receipt.imageUrl
      ? path.basename(new URL(receipt.imageUrl).pathname)
      : null;
    if (row) {
      const full = path.join(uploadDir, row);
      if (fs.existsSync(full)) {
        buffer = fs.readFileSync(full);
        const ext = path.extname(full).toLowerCase();
        mime =
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg";
      }
    }

    if (!buffer) {
      // No image — fall through to demo sample so review screen is never a dead end
      const { DEMO_PARSE } = await import("../vision/parse.js");
      replaceDraftItems(
        receipt.id,
        DEMO_PARSE.restaurant,
        DEMO_PARSE.items,
        DEMO_PARSE.fees
      );
      res.json({
        ...DEMO_PARSE,
        source: "demo",
        warning: "no_image_using_demo_receipt",
        receipt: loadReceipt(receipt.id),
      });
      return;
    }

    const parsed = await parseReceiptImage(buffer, mime);
    replaceDraftItems(receipt.id, parsed.restaurant, parsed.items, parsed.fees);
    res.json({
      restaurant: parsed.restaurant,
      items: parsed.items,
      fees: parsed.fees,
      source: parsed.source,
      receipt: loadReceipt(receipt.id),
    });
  } catch (err) {
    res.status(502).json({
      error: "parse_failed",
      message: err instanceof Error ? err.message : String(err),
      fallback: "manual_entry",
    });
  }
});

receiptsRouter.put("/receipts/:id/draft", (req, res) => {
  const existing = loadReceipt(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.status !== "draft") {
    res.status(400).json({ error: "already_published" });
    return;
  }
  const { restaurant, items, fees } = req.body ?? {};
  if (!Array.isArray(items)) {
    res.status(400).json({ error: "items_required" });
    return;
  }
  const normalizedItems = items.map(
    (it: { name: string; qty: number; totalCents?: number; total?: number }) => ({
      name: String(it.name ?? "").trim() || "Item",
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      total:
        typeof it.totalCents === "number"
          ? it.totalCents / 100
          : Number(it.total) || 0,
    })
  );
  const normalizedFees = Array.isArray(fees)
    ? fees.map(
        (f: { name: string; amountCents?: number; amount?: number }) => ({
          name: String(f.name ?? "").trim() || "Fee",
          amount:
            typeof f.amountCents === "number"
              ? f.amountCents / 100
              : Number(f.amount) || 0,
        })
      )
    : [];

  replaceDraftItems(
    req.params.id,
    String(restaurant ?? ""),
    normalizedItems,
    normalizedFees
  );
  res.json({ receipt: loadReceipt(req.params.id) });
});

receiptsRouter.put("/receipts/:id", (req, res) => {
  const existing = loadReceipt(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { restaurant, items, fees } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items_required" });
    return;
  }
  const normalizedItems = items.map(
    (it: {
      id?: string;
      name: string;
      qty: number;
      totalCents?: number;
      total?: number;
    }) => ({
      id: it.id,
      name: String(it.name).trim(),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      totalCents:
        typeof it.totalCents === "number"
          ? Math.round(it.totalCents)
          : Math.round(Number(it.total) * 100),
    })
  );
  const normalizedFees = Array.isArray(fees)
    ? fees.map(
        (f: {
          id?: string;
          name: string;
          amountCents?: number;
          amount?: number;
        }) => ({
          id: f.id,
          name: String(f.name).trim(),
          amountCents:
            typeof f.amountCents === "number"
              ? Math.round(f.amountCents)
              : Math.round(Number(f.amount) * 100),
        })
      )
    : [];

  const receipt = publishReceipt(
    req.params.id,
    String(restaurant ?? existing.restaurant ?? ""),
    normalizedItems,
    normalizedFees
  );
  res.json({ receipt, claimUrl: receipt.claimUrl });
});

receiptsRouter.get("/receipts/:id", (req, res) => {
  const receipt = loadReceipt(req.params.id);
  if (!receipt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ receipt });
});

receiptsRouter.post("/receipts/:id/claims", (req, res) => {
  const { itemId, personName, personContact, units } = req.body ?? {};
  const result = createClaim({
    receiptId: req.params.id,
    itemId,
    personName,
    personContact,
    units,
  });
  if (!result.ok) {
    const status = result.error === "not_enough_remaining" ? 409 : 400;
    res.status(status).json({
      error: result.error,
      remaining: result.remaining,
    });
    return;
  }
  res.status(201).json({
    claim: result.claim,
    ownerToken: result.ownerToken,
    receipt: result.receipt,
  });
});

receiptsRouter.delete("/claims/:claimId", (req, res) => {
  const ownerToken =
    (req.headers["x-claim-token"] as string) ||
    (req.body?.ownerToken as string) ||
    "";
  const result = deleteClaim(req.params.claimId, ownerToken);
  if (!result.ok) {
    res
      .status(result.error === "forbidden" ? 403 : 404)
      .json({ error: result.error });
    return;
  }
  res.json({ receipt: result.receipt });
});

receiptsRouter.put("/receipts/:id/host-info", (req, res) => {
  const { method, handle } = req.body ?? {};
  if (!method || !handle) {
    res.status(400).json({ error: "method_and_handle_required" });
    return;
  }
  const receipt = setHostInfo(req.params.id, method, handle);
  if (!receipt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ receipt });
});

receiptsRouter.get("/receipts/:id/totals", (req, res) => {
  const receipt = loadReceipt(req.params.id);
  if (!receipt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ totals: totalsFor(req.params.id), receipt });
});

receiptsRouter.post("/receipts/:id/finalize", (req, res) => {
  const allowUnclaimed = req.body?.allowUnclaimed !== false;
  const result = finalizeReceipt(req.params.id, allowUnclaimed);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ receipt: result.receipt });
});
