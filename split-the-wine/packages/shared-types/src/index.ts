export type Fee = {
  id: string;
  name: string;
  amountCents: number;
};

export type ReceiptItem = {
  id: string;
  name: string;
  qty: number;
  totalCents: number;
};

export type Claim = {
  id: string;
  itemId: string;
  personName: string;
  personContact?: string;
  units: number;
  createdAt: string;
};

export type HostInfo = {
  method: string;
  handle: string;
};

export type ReceiptStatus = "draft" | "open" | "finalized";

export type Receipt = {
  id: string;
  restaurant: string;
  imageUrl?: string;
  status: ReceiptStatus;
  items: ReceiptItem[];
  fees: Fee[];
  claims: Claim[];
  hostInfo?: HostInfo;
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

export type ParseResult = {
  restaurant: string;
  items: { name: string; qty: number; total: number }[];
  fees: { name: string; amount: number }[];
};

export type LiveEvent =
  | { type: "receipt_updated"; receipt: Receipt }
  | { type: "claim_added"; claim: Claim; receipt: Receipt }
  | { type: "claim_removed"; claimId: string; receipt: Receipt }
  | { type: "finalized"; receipt: Receipt };

export function dollarsToCents(n: number): number {
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function remainingForItem(
  item: ReceiptItem,
  claims: Claim[]
): number {
  const claimed = claims
    .filter((c) => c.itemId === item.id)
    .reduce((sum, c) => sum + c.units, 0);
  return Math.max(0, item.qty - claimed);
}

export function computePersonTotals(
  receipt: Pick<Receipt, "items" | "fees" | "claims">
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

  for (const claim of receipt.claims) {
    const item = receipt.items.find((i) => i.id === claim.itemId);
    if (!item) continue;
    const unitCents = Math.round(item.totalCents / item.qty);
    const lineCents = unitCents * claim.units;
    const key = claim.personName.trim().toLowerCase();
    const existing = byPerson.get(key) ?? {
      personName: claim.personName.trim(),
      personContact: claim.personContact,
      itemSubtotalCents: 0,
      items: [],
    };
    if (claim.personContact && !existing.personContact) {
      existing.personContact = claim.personContact;
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
  const feesTotal = receipt.fees.reduce((s, f) => s + f.amountCents, 0);

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
