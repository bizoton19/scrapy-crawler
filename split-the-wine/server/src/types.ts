export type FeeRow = {
  id: string;
  receipt_id: string;
  name: string;
  amount_cents: number;
};

export type ItemRow = {
  id: string;
  receipt_id: string;
  name: string;
  qty: number;
  total_cents: number;
};

export type ClaimRow = {
  id: string;
  receipt_id: string;
  item_id: string;
  person_name: string;
  person_contact: string | null;
  units: number;
  owner_token: string;
  created_at: string;
};

export type ReceiptRow = {
  id: string;
  restaurant: string;
  image_path: string | null;
  status: "draft" | "open" | "finalized";
  host_method: string | null;
  host_handle: string | null;
  created_at: string;
};

export function dollarsToCents(n: number): number {
  return Math.round(Number(n) * 100);
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

export type PersonTotal = {
  personName: string;
  personContact?: string;
  itemSubtotalCents: number;
  feeShareCents: number;
  totalCents: number;
  items: { itemName: string; units: number; lineCents: number }[];
};

export function computePersonTotals(
  items: ItemRow[],
  fees: FeeRow[],
  claims: ClaimRow[]
): PersonTotal[] {
  const byPerson = new Map<
    string,
    {
      personName: string;
      personContact?: string;
      itemSubtotalCents: number;
      items: { itemName: string; units: number; lineCents: number }[];
    }
  >();

  for (const claim of claims) {
    const item = items.find((i) => i.id === claim.item_id);
    if (!item) continue;
    const unitCents = Math.round(item.total_cents / item.qty);
    const lineCents = unitCents * claim.units;
    const key = claim.person_name.trim().toLowerCase();
    const existing = byPerson.get(key) ?? {
      personName: claim.person_name.trim(),
      personContact: claim.person_contact ?? undefined,
      itemSubtotalCents: 0,
      items: [],
    };
    if (claim.person_contact && !existing.personContact) {
      existing.personContact = claim.person_contact;
    }
    existing.itemSubtotalCents += lineCents;
    existing.items.push({
      itemName: item.name,
      units: claim.units,
      lineCents,
    });
    byPerson.set(key, existing);
  }

  const claimedSubtotal = [...byPerson.values()].reduce(
    (s, p) => s + p.itemSubtotalCents,
    0
  );
  const feesTotal = fees.reduce((s, f) => s + f.amount_cents, 0);

  return [...byPerson.values()]
    .map((p) => {
      const feeShareCents =
        claimedSubtotal === 0
          ? 0
          : Math.round((p.itemSubtotalCents / claimedSubtotal) * feesTotal);
      return {
        ...p,
        feeShareCents,
        totalCents: p.itemSubtotalCents + feeShareCents,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}
