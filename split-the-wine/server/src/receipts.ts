import { nanoid } from "nanoid";
import { db } from "./db/index.js";
import { broadcast } from "./realtime/hub.js";
import {
  computePersonTotals,
  dollarsToCents,
  type ClaimRow,
  type FeeRow,
  type ItemRow,
  type PublicReceipt,
  type ReceiptRow,
} from "./types.js";

const publicBase = () =>
  (process.env.PUBLIC_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

export function getReceiptRow(id: string): ReceiptRow | undefined {
  return db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as
    | ReceiptRow
    | undefined;
}

export function loadReceipt(id: string): PublicReceipt | null {
  const receipt = getReceiptRow(id);
  if (!receipt) return null;
  const items = db
    .prepare("SELECT * FROM items WHERE receipt_id = ?")
    .all(id) as ItemRow[];
  const fees = db
    .prepare("SELECT * FROM fees WHERE receipt_id = ?")
    .all(id) as FeeRow[];
  const claims = db
    .prepare("SELECT * FROM claims WHERE receipt_id = ? ORDER BY created_at")
    .all(id) as ClaimRow[];

  return {
    id: receipt.id,
    restaurant: receipt.restaurant,
    imageUrl: receipt.image_path
      ? `${publicBase()}/uploads/${receipt.image_path}`
      : undefined,
    status: receipt.status,
    items: items.map((item) => {
      const claimed = claims
        .filter((c) => c.item_id === item.id)
        .reduce((s, c) => s + c.units, 0);
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        totalCents: item.total_cents,
        remaining: Math.max(0, item.qty - claimed),
      };
    }),
    fees: fees.map((f) => ({
      id: f.id,
      name: f.name,
      amountCents: f.amount_cents,
    })),
    claims: claims.map((c) => ({
      id: c.id,
      itemId: c.item_id,
      personName: c.person_name,
      personContact: c.person_contact ?? undefined,
      units: c.units,
      createdAt: c.created_at,
    })),
    hostInfo:
      receipt.host_method && receipt.host_handle
        ? { method: receipt.host_method, handle: receipt.host_handle }
        : undefined,
    claimUrl: `${publicBase()}/r/${receipt.id}`,
    createdAt: receipt.created_at,
  };
}

export function listReceipts(): PublicReceipt[] {
  const rows = db
    .prepare("SELECT id FROM receipts ORDER BY created_at DESC LIMIT 50")
    .all() as { id: string }[];
  return rows.map((r) => loadReceipt(r.id)!).filter(Boolean);
}

export function createReceipt(imagePath: string | null): PublicReceipt {
  const id = nanoid(10);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO receipts (id, restaurant, image_path, status, created_at)
     VALUES (?, '', ?, 'draft', ?)`
  ).run(id, imagePath, createdAt);
  return loadReceipt(id)!;
}

export function replaceDraftItems(
  receiptId: string,
  restaurant: string,
  items: { name: string; qty: number; total: number }[],
  fees: { name: string; amount: number }[]
): PublicReceipt {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM claims WHERE receipt_id = ?").run(receiptId);
    db.prepare("DELETE FROM items WHERE receipt_id = ?").run(receiptId);
    db.prepare("DELETE FROM fees WHERE receipt_id = ?").run(receiptId);
    db.prepare("UPDATE receipts SET restaurant = ? WHERE id = ?").run(
      restaurant,
      receiptId
    );

    const insertItem = db.prepare(
      `INSERT INTO items (id, receipt_id, name, qty, total_cents) VALUES (?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insertItem.run(
        nanoid(10),
        receiptId,
        item.name,
        Math.max(1, Math.round(item.qty)),
        dollarsToCents(item.total)
      );
    }
    const insertFee = db.prepare(
      `INSERT INTO fees (id, receipt_id, name, amount_cents) VALUES (?, ?, ?, ?)`
    );
    for (const fee of fees) {
      insertFee.run(
        nanoid(10),
        receiptId,
        fee.name,
        dollarsToCents(fee.amount)
      );
    }
  });
  tx();
  return loadReceipt(receiptId)!;
}

export function publishReceipt(
  receiptId: string,
  restaurant: string,
  items: { id?: string; name: string; qty: number; totalCents: number }[],
  fees: { id?: string; name: string; amountCents: number }[]
): PublicReceipt {
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE receipts SET restaurant = ?, status = 'open' WHERE id = ?`
    ).run(restaurant, receiptId);
    db.prepare("DELETE FROM claims WHERE receipt_id = ?").run(receiptId);
    db.prepare("DELETE FROM items WHERE receipt_id = ?").run(receiptId);
    db.prepare("DELETE FROM fees WHERE receipt_id = ?").run(receiptId);

    const insertItem = db.prepare(
      `INSERT INTO items (id, receipt_id, name, qty, total_cents) VALUES (?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insertItem.run(
        item.id ?? nanoid(10),
        receiptId,
        item.name,
        Math.max(1, Math.round(item.qty)),
        Math.round(item.totalCents)
      );
    }
    const insertFee = db.prepare(
      `INSERT INTO fees (id, receipt_id, name, amount_cents) VALUES (?, ?, ?, ?)`
    );
    for (const fee of fees) {
      insertFee.run(
        fee.id ?? nanoid(10),
        receiptId,
        fee.name,
        Math.round(fee.amountCents)
      );
    }
  });
  tx();
  const receipt = loadReceipt(receiptId)!;
  broadcast(receiptId, { type: "receipt_updated", receipt });
  return receipt;
}

export function createClaim(input: {
  receiptId: string;
  itemId: string;
  personName: string;
  personContact?: string;
  units: number;
}): { ok: true; claim: PublicReceipt["claims"][0]; ownerToken: string; receipt: PublicReceipt } | { ok: false; error: string; remaining?: number } {
  const units = Math.floor(Number(input.units));
  if (!Number.isInteger(units) || units < 1) {
    return { ok: false, error: "units_must_be_positive_integer" };
  }
  const name = input.personName.trim();
  if (!name) return { ok: false, error: "name_required" };

  const ownerToken = nanoid(24);
  const claimId = nanoid(10);
  const createdAt = new Date().toISOString();

  try {
    const result = db.transaction(() => {
      const receipt = getReceiptRow(input.receiptId);
      if (!receipt) return { kind: "missing" as const };
      if (receipt.status !== "open") return { kind: "closed" as const };

      const item = db
        .prepare("SELECT * FROM items WHERE id = ? AND receipt_id = ?")
        .get(input.itemId, input.receiptId) as ItemRow | undefined;
      if (!item) return { kind: "missing_item" as const };

      const claimed = (
        db
          .prepare(
            "SELECT COALESCE(SUM(units), 0) AS s FROM claims WHERE item_id = ?"
          )
          .get(input.itemId) as { s: number }
      ).s;
      const remaining = item.qty - claimed;
      if (units > remaining) {
        return { kind: "not_enough" as const, remaining };
      }

      db.prepare(
        `INSERT INTO claims (id, receipt_id, item_id, person_name, person_contact, units, owner_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        claimId,
        input.receiptId,
        input.itemId,
        name,
        input.personContact?.trim() || null,
        units,
        ownerToken,
        createdAt
      );
      return { kind: "ok" as const };
    })();

    if (result.kind === "missing") return { ok: false, error: "not_found" };
    if (result.kind === "closed") return { ok: false, error: "receipt_closed" };
    if (result.kind === "missing_item") return { ok: false, error: "item_not_found" };
    if (result.kind === "not_enough") {
      return {
        ok: false,
        error: "not_enough_remaining",
        remaining: result.remaining,
      };
    }

    const receipt = loadReceipt(input.receiptId)!;
    const claim = receipt.claims.find((c) => c.id === claimId)!;
    broadcast(input.receiptId, { type: "claim_added", claim, receipt });
    return { ok: true, claim, ownerToken, receipt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "claim_failed" };
  }
}

export function deleteClaim(claimId: string, ownerToken: string) {
  const claim = db
    .prepare("SELECT * FROM claims WHERE id = ?")
    .get(claimId) as ClaimRow | undefined;
  if (!claim) return { ok: false as const, error: "not_found" };
  if (claim.owner_token !== ownerToken) {
    return { ok: false as const, error: "forbidden" };
  }
  db.prepare("DELETE FROM claims WHERE id = ?").run(claimId);
  const receipt = loadReceipt(claim.receipt_id)!;
  broadcast(claim.receipt_id, {
    type: "claim_removed",
    claimId,
    receipt,
  });
  return { ok: true as const, receipt };
}

export function setHostInfo(
  receiptId: string,
  method: string,
  handle: string
): PublicReceipt | null {
  db.prepare(
    `UPDATE receipts SET host_method = ?, host_handle = ? WHERE id = ?`
  ).run(method.trim(), handle.trim(), receiptId);
  const receipt = loadReceipt(receiptId);
  if (receipt) broadcast(receiptId, { type: "receipt_updated", receipt });
  return receipt;
}

export function finalizeReceipt(receiptId: string, allowUnclaimed = true) {
  const receipt = loadReceipt(receiptId);
  if (!receipt) return { ok: false as const, error: "not_found" };
  if (!allowUnclaimed) {
    const unclaimed = receipt.items.some((i) => i.remaining > 0);
    if (unclaimed) return { ok: false as const, error: "unclaimed_items" };
  }
  db.prepare(`UPDATE receipts SET status = 'finalized' WHERE id = ?`).run(
    receiptId
  );
  const updated = loadReceipt(receiptId)!;
  broadcast(receiptId, { type: "finalized", receipt: updated });
  return { ok: true as const, receipt: updated };
}

export function totalsFor(receiptId: string) {
  const items = db
    .prepare("SELECT * FROM items WHERE receipt_id = ?")
    .all(receiptId) as ItemRow[];
  const fees = db
    .prepare("SELECT * FROM fees WHERE receipt_id = ?")
    .all(receiptId) as FeeRow[];
  const claims = db
    .prepare("SELECT * FROM claims WHERE receipt_id = ?")
    .all(receiptId) as ClaimRow[];
  return computePersonTotals(items, fees, claims);
}
