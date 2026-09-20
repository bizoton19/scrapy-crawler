import assert from "node:assert/strict";
import test from "node:test";
import { computePersonTotals, dollarsToCents, type ClaimRow, type FeeRow, type ItemRow } from "./types.js";

test("proportional fee split by claimed subtotal", () => {
  const items: ItemRow[] = [
    { id: "a", receipt_id: "r", name: "Wine", qty: 2, total_cents: dollarsToCents(100) },
    { id: "b", receipt_id: "r", name: "Juice", qty: 1, total_cents: dollarsToCents(10) },
  ];
  const fees: FeeRow[] = [
    { id: "f1", receipt_id: "r", name: "Tax", amount_cents: dollarsToCents(11) },
  ];
  const claims: ClaimRow[] = [
    {
      id: "c1",
      receipt_id: "r",
      item_id: "a",
      person_name: "Alex",
      person_contact: null,
      units: 2,
      owner_token: "t1",
      created_at: new Date().toISOString(),
    },
    {
      id: "c2",
      receipt_id: "r",
      item_id: "b",
      person_name: "Sam",
      person_contact: null,
      units: 1,
      owner_token: "t2",
      created_at: new Date().toISOString(),
    },
  ];

  const totals = computePersonTotals(items, fees, claims);
  const alex = totals.find((t) => t.personName === "Alex")!;
  const sam = totals.find((t) => t.personName === "Sam")!;

  assert.equal(alex.itemSubtotalCents, 10000);
  assert.equal(sam.itemSubtotalCents, 1000);
  // 100/110 * 11 = 10; 10/110 * 11 = 1
  assert.equal(alex.feeShareCents, 1000);
  assert.equal(sam.feeShareCents, 100);
  assert.equal(alex.totalCents, 11000);
  assert.equal(sam.totalCents, 1100);
});
