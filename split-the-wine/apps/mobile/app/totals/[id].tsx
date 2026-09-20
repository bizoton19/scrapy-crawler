import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, money, type PublicReceipt } from "../../src/api";
import { colors } from "../../src/theme";

type PersonTotal = {
  personName: string;
  personContact?: string;
  itemSubtotalCents: number;
  feeShareCents: number;
  totalCents: number;
};

export default function WhoOwesWhat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [totals, setTotals] = useState<PersonTotal[]>([]);
  const [method, setMethod] = useState("Venmo");
  const [handle, setHandle] = useState("");

  async function load() {
    const data = await api<{ totals: PersonTotal[]; receipt: PublicReceipt }>(
      `/receipts/${id}/totals`
    );
    setTotals(data.totals);
    setReceipt(data.receipt);
    if (data.receipt.hostInfo) {
      setMethod(data.receipt.hostInfo.method);
      setHandle(data.receipt.hostInfo.handle);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function messageFor(p: PersonTotal) {
    const h = receipt?.hostInfo?.handle || handle || "[your handle]";
    const m = receipt?.hostInfo?.method || method || "Venmo";
    return `Hey ${p.personName}, your share is ${money(p.totalCents)}, send it to ${h} via ${m}`;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Who owes what</Text>
      <Text style={styles.sub}>
        Fees split by each person’s share of the claimed subtotal — never evenly
        by headcount.
      </Text>
      {receipt?.items.some((i) => i.remaining > 0) ? (
        <Text style={styles.banner}>
          Based on claims so far. Unclaimed items aren’t assigned yet, so early
          claimants temporarily carry all fees until others claim.
        </Text>
      ) : null}

      <Text style={styles.label}>Payment method</Text>
      <View style={styles.methods}>
        {["Venmo", "Zelle", "Cash App", "PayPal"].map((m) => (
          <Pressable
            key={m}
            style={[styles.chip, method === m && styles.chipOn]}
            onPress={() => setMethod(m)}
          >
            <Text style={[styles.chipText, method === m && styles.chipTextOn]}>
              {m}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Your handle / details</Text>
      <TextInput
        style={styles.input}
        value={handle}
        onChangeText={setHandle}
        placeholder="@you"
        placeholderTextColor={colors.inkDim}
      />
      <Pressable
        style={styles.btnSecondary}
        onPress={async () => {
          await api(`/receipts/${id}/host-info`, {
            method: "PUT",
            body: JSON.stringify({ method, handle }),
          });
          await load();
        }}
      >
        <Text style={styles.btnSecondaryText}>Save payment info</Text>
      </Pressable>

      <Text style={styles.section}>Per person</Text>
      {totals.map((p) => (
        <View key={p.personName} style={styles.card}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.rowTitle}>{p.personName}</Text>
              <Text style={styles.muted}>
                items {money(p.itemSubtotalCents)} · fees {money(p.feeShareCents)}
              </Text>
            </View>
            <Text style={styles.money}>{money(p.totalCents)}</Text>
          </View>
          <Pressable
            style={styles.btnSecondary}
            onPress={async () => {
              const msg = messageFor(p);
              await Clipboard.setStringAsync(msg);
              const sms = `sms:?body=${encodeURIComponent(msg)}`;
              try {
                await Linking.openURL(sms);
              } catch {
                /* clipboard already has it */
              }
            }}
          >
            <Text style={styles.btnSecondaryText}>Request payment message</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        style={styles.btnGhost}
        onPress={async () => {
          await api(`/receipts/${id}/finalize`, {
            method: "POST",
            body: JSON.stringify({ allowUnclaimed: true }),
          });
          router.back();
        }}
      >
        <Text style={styles.btnGhostText}>Finalize claiming</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10, paddingBottom: 48 },
  title: { fontFamily: "Fraunces_700Bold", fontSize: 32, color: colors.ink },
  sub: { fontFamily: "DMSans_400Regular", color: colors.inkDim, marginBottom: 8 },
  banner: {
    backgroundColor: "rgba(201,162,39,0.1)",
    borderColor: "rgba(201,162,39,0.25)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    color: colors.gold,
    fontFamily: "DMSans_500Medium",
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(246,239,230,0.38)",
    fontFamily: "DMSans_700Bold",
    marginTop: 8,
  },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.goldSoft, borderColor: colors.gold },
  chipText: { color: colors.inkDim, fontFamily: "DMSans_500Medium" },
  chipTextOn: { color: colors.gold, fontFamily: "DMSans_700Bold" },
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
  },
  section: {
    marginTop: 16,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(246,239,230,0.38)",
    fontFamily: "DMSans_700Bold",
  },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(246,239,230,0.04)",
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowTitle: { color: colors.ink, fontFamily: "DMSans_700Bold", fontSize: 16 },
  muted: { color: colors.inkDim, fontFamily: "DMSans_400Regular", marginTop: 4 },
  money: { color: colors.ink, fontFamily: "DMSans_700Bold", fontSize: 18 },
  btnSecondary: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(246,239,230,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { color: colors.ink, fontFamily: "DMSans_700Bold" },
  btnGhost: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  btnGhostText: { color: colors.inkDim, fontFamily: "DMSans_500Medium" },
});
