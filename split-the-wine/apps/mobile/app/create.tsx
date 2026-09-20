import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, money } from "../src/api";
import { colors } from "../src/theme";

type Mode = "equal" | "tiers" | "blank";
type Tier = { name: string; qty: number; amount: string };

export default function CreateCustomSplit() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("tiers");
  const [title, setTitle] = useState("Airbnb weekend");
  const [totalDollars, setTotalDollars] = useState("800");
  const [people, setPeople] = useState("4");
  const [cleaningFee, setCleaningFee] = useState("0");
  const [tiers, setTiers] = useState<Tier[]>([
    { name: "Master bedroom", qty: 1, amount: "350" },
    { name: "Guest room", qty: 1, amount: "250" },
    { name: "Couch", qty: 2, amount: "100" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equalPreview = useMemo(() => {
    const total = Number(totalDollars) || 0;
    const n = Math.max(1, Math.round(Number(people) || 1));
    return { n, each: total / n, total };
  }, [totalDollars, people]);

  const tiersSum = useMemo(
    () =>
      tiers.reduce(
        (s, t) =>
          s + (Number(t.amount) || 0) * Math.max(1, Math.round(Number(t.qty) || 1)),
        0
      ),
    [tiers]
  );

  async function continueToReview() {
    setError(null);
    const fees =
      Number(cleaningFee) > 0
        ? [
            {
              name: "Cleaning / service fee",
              amountCents: Math.round(Number(cleaningFee) * 100),
            },
          ]
        : [];

    let items: { name: string; qty: number; totalCents: number }[] = [];
    if (mode === "equal") {
      const totalCents = Math.round((Number(totalDollars) || 0) * 100);
      const n = Math.max(1, Math.round(Number(people) || 1));
      if (totalCents <= 0) {
        setError("Enter a total amount");
        return;
      }
      items = [{ name: `Equal share (1 of ${n})`, qty: n, totalCents }];
    } else if (mode === "tiers") {
      items = tiers
        .filter((t) => t.name.trim() && Number(t.amount) > 0)
        .map((t) => {
          const qty = Math.max(1, Math.round(Number(t.qty) || 1));
          const eachCents = Math.round(Number(t.amount) * 100);
          return {
            name: t.name.trim(),
            qty,
            totalCents: eachCents * qty,
          };
        });
      if (!items.length) {
        setError("Add at least one rate with a price");
        return;
      }
    } else {
      items = [{ name: "", qty: 1, totalCents: 0 }];
    }

    setBusy(true);
    try {
      const created = await api<{ receiptId: string }>("/receipts", {
        method: "POST",
        body: "{}",
      });
      await api(`/receipts/${created.receiptId}/draft`, {
        method: "PUT",
        body: JSON.stringify({
          restaurant: title.trim() || "Custom split",
          items,
          fees,
        }),
      });
      router.replace(`/review?id=${created.receiptId}&custom=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Create a custom split</Text>
      <Text style={styles.sub}>
        No photo needed — Airbnb, hotel, cabin, or any group cost. Guests claim
        their spot from a link.
      </Text>

      <Text style={styles.label}>What are you splitting?</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Airbnb · Downtown loft"
        placeholderTextColor={colors.inkDim}
      />

      <Text style={styles.label}>How should people claim?</Text>
      {(
        [
          ["equal", "Equal shares", "$800 ÷ 4 = $200 each"],
          ["tiers", "Different rates", "Master bed vs couch"],
          ["blank", "Blank list", "Add your own items"],
        ] as const
      ).map(([key, heading, blurb]) => (
        <Pressable
          key={key}
          style={[styles.modeCard, mode === key && styles.modeCardOn]}
          onPress={() => setMode(key)}
        >
          <Text style={styles.modeTitle}>{heading}</Text>
          <Text style={styles.modeBlurb}>{blurb}</Text>
        </Pressable>
      ))}

      {mode === "equal" ? (
        <>
          <Text style={styles.label}>Total amount</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={totalDollars}
            onChangeText={setTotalDollars}
          />
          <Text style={styles.label}>Number of people / shares</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={people}
            onChangeText={setPeople}
          />
          <Text style={styles.banner}>
            {equalPreview.n} shares × {money(Math.round(equalPreview.each * 100))}{" "}
            = {money(Math.round(equalPreview.total * 100))}
          </Text>
        </>
      ) : null}

      {mode === "tiers" ? (
        <>
          <Text style={styles.label}>Room / rate types</Text>
          <Text style={styles.hint}>
            Qty = claimable spots. Amount = price per spot.
          </Text>
          {tiers.map((t, idx) => (
            <View key={idx} style={styles.tierRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={t.name}
                placeholder="Master bedroom"
                placeholderTextColor={colors.inkDim}
                onChangeText={(v) => {
                  const next = [...tiers];
                  next[idx] = { ...t, name: v };
                  setTiers(next);
                }}
              />
              <TextInput
                style={[styles.input, styles.narrow]}
                keyboardType="number-pad"
                value={String(t.qty)}
                onChangeText={(v) => {
                  const next = [...tiers];
                  next[idx] = {
                    ...t,
                    qty: Math.max(1, Math.round(Number(v) || 1)),
                  };
                  setTiers(next);
                }}
              />
              <TextInput
                style={[styles.input, styles.price]}
                keyboardType="decimal-pad"
                value={t.amount}
                onChangeText={(v) => {
                  const next = [...tiers];
                  next[idx] = { ...t, amount: v };
                  setTiers(next);
                }}
              />
            </View>
          ))}
          <Pressable
            onPress={() =>
              setTiers([...tiers, { name: "", qty: 1, amount: "" }])
            }
          >
            <Text style={styles.link}>+ Add rate</Text>
          </Pressable>
          <Text style={styles.muted}>
            Rates total{" "}
            <Text style={styles.money}>{money(Math.round(tiersSum * 100))}</Text>
          </Text>
        </>
      ) : null}

      {mode !== "blank" ? (
        <>
          <Text style={styles.label}>Extra fee (cleaning…) — optional</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={cleaningFee}
            onChangeText={setCleaningFee}
          />
        </>
      ) : (
        <Text style={styles.banner}>
          You’ll fine-tune line items on the next screen.
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.btnPrimary, busy && { opacity: 0.5 }]}
        disabled={busy}
        onPress={continueToReview}
      >
        <Text style={styles.btnPrimaryText}>✓  Continue to review</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10, paddingBottom: 48 },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 30, color: colors.ink },
  sub: { fontFamily: "NunitoSans_400Regular", color: colors.inkDim, marginBottom: 8 },
  label: {
    marginTop: 8,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#8a9a92",
    fontFamily: "NunitoSans_800ExtraBold",
  },
  hint: { color: colors.inkDim, fontFamily: "NunitoSans_400Regular", fontSize: 13 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
    color: colors.ink,
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: "NunitoSans_400Regular",
  },
  modeCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
  },
  modeCardOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  modeTitle: {
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
    color: colors.ink,
  },
  modeBlurb: {
    fontFamily: "NunitoSans_600SemiBold",
    color: colors.inkDim,
    marginTop: 2,
  },
  banner: {
    backgroundColor: colors.warnBg,
    borderColor: "#fedf89",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    color: colors.warn,
    fontFamily: "NunitoSans_600SemiBold",
  },
  tierRow: { flexDirection: "row", gap: 8 },
  narrow: { width: 56 },
  price: { width: 88 },
  link: {
    color: colors.primaryDeep,
    fontFamily: "NunitoSans_800ExtraBold",
    marginVertical: 4,
  },
  muted: { color: colors.inkDim, fontFamily: "NunitoSans_400Regular" },
  money: { color: colors.primaryDeep, fontFamily: "NunitoSans_800ExtraBold" },
  error: { color: colors.danger, fontFamily: "NunitoSans_600SemiBold" },
  btnPrimary: {
    marginTop: 12,
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
