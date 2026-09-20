export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787/api";

export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:8787/live";

export type PublicItem = {
  id: string;
  name: string;
  qty: number;
  totalCents: number;
  remaining: number;
};

export type PublicClaim = {
  id: string;
  itemId: string;
  personName: string;
  personContact?: string;
  units: number;
  createdAt: string;
};

export type PublicReceipt = {
  id: string;
  restaurant: string;
  imageUrl?: string;
  status: "draft" | "open" | "finalized";
  items: PublicItem[];
  fees: { id: string; name: string; amountCents: number }[];
  claims: PublicClaim[];
  hostInfo?: { method: string; handle: string };
  claimUrl: string;
  createdAt: string;
};

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function api<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || res.statusText) as Error & {
      data: unknown;
      status: number;
    };
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data as T;
}
