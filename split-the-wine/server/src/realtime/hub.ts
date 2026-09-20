import type { WebSocket } from "ws";
import type { PublicReceipt } from "../types.js";

type Client = { ws: WebSocket; receiptId: string };

const clients = new Set<Client>();

export function subscribe(ws: WebSocket, receiptId: string) {
  const client: Client = { ws, receiptId };
  clients.add(client);
  ws.on("close", () => clients.delete(client));
}

export function broadcast(receiptId: string, event: { type: string; receipt?: PublicReceipt; claimId?: string; claim?: unknown }) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.receiptId === receiptId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}
