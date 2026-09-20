import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, money, type PublicReceipt } from "../src/api";
import { colors } from "../src/theme";

type DraftItem = { name: string; qty: number; totalCents: number };
type DraftFee = { name: string; amountCents: number };

export default function ReviewItems() {
  const router = useRouter();
  const { id, manual, custom } = useLocalSearchParams<{
    id?: string;
    manual?: string;
    custom?: string;
  }>();
  const [receiptId, setReceiptId] = useState(id);
  const [restaurant, setRestaurant] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [fees, setFees] = useState<DraftFee[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCustom = custom === "1" || manual === "1";

  useEffect(() => {
    (async () => {
      if (manual === "1" && !id) {
        const created = await api<{ receiptId: string; receipt: PublicReceipt }>(
          "/receipts",
          { method: "POST", body: "{}" }
        );
        setReceiptId(created.receiptId);
        setItems([{ name: "", qty: 1, totalCents: 0 }]);
        setFees([]);
        setBanner("Add rooms, shares, or anything people should claim.");
        return;
      }
      if (!id) return;
      const { receipt } = await api<{ receipt: PublicReceipt }>(`/receipts/${id}`);
      setRestaurant(receipt.restaurant);
      setItems(
        receipt.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          totalCents: i.totalCents,
        }))
      );
      setFees(
        receipt.fees.map((f) => ({
          name: f.name,
          amountCents: f.amountCents,
        }))
      );
      setBanner(
        custom === "1"
          ? "Edit freely, then create the claim link. Qty = how many spots can be claimed."
          : "Review carefully — vision is good but not perfect. Fix before sharing."
      );
    })();
  }, [id, manual, custom]);

  const subtotal = items.reduce((s, i) => s + i.totalCents, 0);
  const feeTotal = fees.reduce((s, f) => s + f.amountCents, 0);

  async function publish() {
    if (!receiptId) return;
    const clean = items.filter((i) => i.name.trim());
    if (!clean.length) return;
    setBusy(true);
    try {
      const { receipt } = await api<{ receipt: PublicReceipt }>(
        `/receipts/${receiptId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            restaurant,
            items: clean,
            fees: fees.filter((f) => f.name.trim()),
          }),
        }
      );
      router.replace(`/share/${receipt.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{isCustom ? "Review your split" : "Review items"}</Text>
      <Text style={styles.sub}>
        {isCustom
          ? "Guests will claim units from this list."
          : "Fix misreads before anyone claims."}
      </Text>
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}

      <Text style={styles.label}>{isCustom ? "Title" : "Restaurant"}</Text>
      <TextInput
        style={styles.input}
        value={restaurant}
        onChangeText={setRestaurant}
        placeholderTextColor={colors.inkDim}
      />

      <Text style={styles.section}>Line items</Text>
      {items.map((it, idx) => (
        <View key={idx} style={styles.editRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={it.name}
            placeholder="Item"
            placeholderTextColor={colors.inkDim}
            onChangeText={(v) => {
              const next = [...items];
              next[idx] = { ...it, name: v };
              setItems(next);
            }}
          />
          <TextInput
            style={[styles.input, styles.narrow]}
            keyboardType="number-pad"
            value={String(it.qty)}
            onChangeText={(v) => {
              const next = [...items];
              next[idx] = { ...it, qty: Math.max(1, Math.round(Number(v) || 1)) };
              setItems(next);
            }}
          />
          <TextInput
            style={[styles.input, styles.price]}
            keyboardType="decimal-pad"
            value={(it.totalCents / 100).toFixed(2)}
            onChangeText={(v) => {
              const next = [...items];
              next[idx] = { ...it, totalCents: Math.round(Number(v) * 100) || 0 };
              setItems(next);
            }}
          />
        </View>
      ))}
      <Pressable
        onPress={() => setItems([...items, { name: "", qty: 1, totalCents: 0 }])}
      >
        <Text style={styles.link}>+ Add item</Text>
      </Pressable>

      <Text style={styles.section}>Fees</Text>
      {fees.map((f, idx) => (
        <View key={idx} style={styles.editRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={f.name}
            onChangeText={(v) => {
              const next = [...fees];
              next[idx] = { ...f, name: v };
              setFees(next);
            }}
          />
          <TextInput
            style={[styles.input, styles.price]}
            keyboardType="decimal-pad"
            value={(f.amountCents / 100).toFixed(2)}
            onChangeText={(v) => {
              const next = [...fees];
              next[idx] = {
                ...f,
                amountCents: Math.round(Number(v) * 100) || 0,
              };
              setFees(next);
            }}
          />
        </View>
      ))}

      <Text style={styles.muted}>
        Items {money(subtotal)} · Fees {money(feeTotal)} ·{" "}
        <Text style={styles.money}>{money(subtotal + feeTotal)}</Text>
      </Text>

      <Pressable
        style={[styles.btnPrimary, busy && { opacity: 0.5 }]}
        disabled={busy}
        onPress={publish}
      >
        <Text style={styles.btnPrimaryText}>Create claim link</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10, paddingBottom: 48 },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 32, color: colors.ink },
  sub: { fontFamily: "NunitoSans_400Regular", color: colors.inkDim, marginBottom: 8 },
  banner: {
    backgroundColor: "#fffaeb",
    borderColor: "#fedf89",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    color: colors.warn,
    fontFamily: "NunitoSans_600SemiBold",
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#8a9a92",
    fontFamily: "NunitoSans_800ExtraBold",
  },
  section: {
    marginTop: 12,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#8a9a92",
    fontFamily: "NunitoSans_800ExtraBold",
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
    color: colors.ink,
    paddingHorizontal: 12,
    fontFamily: "NunitoSans_400Regular",
    fontSize: 16,
  },
  editRow: { flexDirection: "row", gap: 8 },
  narrow: { width: 56 },
  price: { width: 88 },
  link: { color: colors.primaryDeep, fontFamily: "NunitoSans_800ExtraBold", marginVertical: 6 },
  muted: { color: colors.inkDim, fontFamily: "NunitoSans_400Regular", marginTop: 8 },
  money: { color: colors.ink, fontFamily: "NunitoSans_800ExtraBold" },
  btnPrimary: {
    marginTop: 16,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
  },
});
