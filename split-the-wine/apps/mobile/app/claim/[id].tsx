import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, money, type PublicItem, type PublicReceipt } from "../../src/api";
import { colors } from "../../src/theme";
import { useReceiptLive } from "../../src/useReceiptLive";

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [selected, setSelected] = useState<PublicItem | null>(null);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { live, reconnecting } = useReceiptLive(id, setReceipt);

  useEffect(() => {
    api<{ receipt: PublicReceipt }>(`/receipts/${id}`).then((d) =>
      setReceipt(d.receipt)
    );
    AsyncStorage.getItem("stw_name").then((v) => v && setName(v));
    AsyncStorage.getItem("stw_contact").then((v) => v && setContact(v));
  }, [id]);

  const pct = useMemo(() => {
    if (!receipt) return 0;
    const claimed = receipt.items.reduce((s, i) => s + (i.qty - i.remaining), 0);
    const total = receipt.items.reduce((s, i) => s + i.qty, 0);
    return total ? Math.round((claimed / total) * 100) : 0;
  }, [receipt]);

  async function submit() {
    if (!selected || !receipt) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter your name");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<{
        claim: { id: string };
        ownerToken: string;
        receipt: PublicReceipt;
      }>(`/receipts/${receipt.id}/claims`, {
        method: "POST",
        body: JSON.stringify({
          itemId: selected.id,
          personName: trimmed,
          personContact: contact.trim() || undefined,
          units: qty,
        }),
      });
      await AsyncStorage.setItem("stw_name", trimmed);
      await AsyncStorage.setItem("stw_contact", contact.trim());
      const tokens = JSON.parse(
        (await AsyncStorage.getItem("stw_tokens")) || "{}"
      );
      tokens[result.claim.id] = result.ownerToken;
      await AsyncStorage.setItem("stw_tokens", JSON.stringify(tokens));
      setReceipt(result.receipt);
      setSelected(null);
    } catch (e) {
      const err = e as Error & { data?: { error?: string; remaining?: number } };
      if (err.data?.error === "not_enough_remaining") {
        setError(`Only ${err.data.remaining} left`);
        const fresh = await api<{ receipt: PublicReceipt }>(
          `/receipts/${receipt.id}`
        );
        setReceipt(fresh.receipt);
        setSelected(null);
      } else {
        setError(err.message || "Couldn't reach the server, try again");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!receipt) {
    return <View style={styles.container} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.top}>
          <Text style={styles.live}>{live ? "● Live" : reconnecting ? "Reconnecting…" : ""}</Text>
          <Pressable onPress={() => router.push(`/totals/${receipt.id}`)}>
            <Text style={styles.link}>Who owes</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{receipt.restaurant || "Claim your pours"}</Text>
        <Text style={styles.sub}>
          Tap an item, set a whole number, claim. Updates live for everyone.
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.tiny}>{pct}% claimed</Text>

        {receipt.items.map((item) => {
          const claims = receipt.claims.filter((c) => c.itemId === item.id);
          const disabled = !item.remaining || receipt.status !== "open";
          return (
            <Pressable
              key={item.id}
              disabled={disabled}
              style={[styles.row, disabled && { opacity: 0.45 }]}
              onPress={() => {
                setSelected(item);
                setQty(1);
                setError(null);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.muted}>
                  {money(item.totalCents)} · {item.qty} ordered
                </Text>
                <View style={styles.chips}>
                  {claims.map((c) => (
                    <Text key={c.id} style={styles.chip}>
                      {c.personName} ×{c.units}
                      {c.personContact ? ` · ${c.personContact}` : ""}
                    </Text>
                  ))}
                </View>
              </View>
              <View style={[styles.badge, !item.remaining && styles.badgeEmpty]}>
                <Text
                  style={[
                    styles.badgeText,
                    !item.remaining && { color: "#f0a29c" },
                  ]}
                >
                  {item.remaining}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.section}>Fees</Text>
        {receipt.fees.map((f) => (
          <Text key={f.id} style={styles.muted}>
            {f.name} · {money(f.amountCents)}
          </Text>
        ))}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => setSelected(null)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{selected?.name}</Text>
          <Text style={styles.muted}>
            {selected?.remaining} remaining · {money(selected?.totalCents ?? 0)}{" "}
            line
          </Text>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
          <Text style={styles.label}>Contact (optional)</Text>
          <TextInput
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder="@handle or phone"
            placeholderTextColor={colors.inkDim}
          />
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Text style={styles.stepGlyph}>−</Text>
            </Pressable>
            <Text style={styles.qty}>{qty}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() =>
                setQty((q) => Math.min(selected?.remaining ?? 1, q + 1))
              }
            >
              <Text style={styles.stepGlyph}>+</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.btnPrimary, submitting && { opacity: 0.5 }]}
            disabled={submitting}
            onPress={submit}
          >
            <Text style={styles.btnPrimaryText}>Claim</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={[styles.link, { textAlign: "center", marginTop: 12 }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10, paddingBottom: 48 },
  top: { flexDirection: "row", justifyContent: "space-between" },
  live: { color: "#7ddeb0", fontFamily: "DMSans_700Bold", fontSize: 12 },
  link: { color: colors.gold, fontFamily: "DMSans_700Bold" },
  title: { fontFamily: "Fraunces_700Bold", fontSize: 32, color: colors.ink },
  sub: { fontFamily: "DMSans_400Regular", color: colors.inkDim },
  track: {
    height: 6,
    borderRadius: 99,
    backgroundColor: "rgba(246,239,230,0.08)",
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.wine },
  tiny: { color: "rgba(246,239,230,0.38)", fontFamily: "DMSans_400Regular" },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(246,239,230,0.04)",
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  rowTitle: {
    color: colors.ink,
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    marginBottom: 4,
  },
  muted: { color: colors.inkDim, fontFamily: "DMSans_400Regular" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    fontSize: 12,
    color: colors.inkDim,
    backgroundColor: "rgba(246,239,230,0.06)",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    fontFamily: "DMSans_400Regular",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeEmpty: { backgroundColor: "rgba(212,84,74,0.12)" },
  badgeText: { color: colors.gold, fontFamily: "DMSans_700Bold", fontSize: 16 },
  section: {
    marginTop: 12,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(246,239,230,0.38)",
    fontFamily: "DMSans_700Bold",
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#1a1310",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(246,239,230,0.2)",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 24,
    color: colors.ink,
    marginBottom: 4,
  },
  label: {
    marginTop: 12,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(246,239,230,0.38)",
    fontFamily: "DMSans_700Bold",
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(0,0,0,0.25)",
    color: colors.ink,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: "DMSans_400Regular",
    marginTop: 6,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(246,239,230,0.06)",
  },
  stepGlyph: { color: colors.ink, fontSize: 28, fontFamily: "DMSans_500Medium" },
  qty: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 36,
    color: colors.ink,
    minWidth: 48,
    textAlign: "center",
  },
  error: { color: colors.danger, fontFamily: "DMSans_500Medium", marginBottom: 8 },
  btnPrimary: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff7f2", fontFamily: "DMSans_700Bold", fontSize: 16 },
});
