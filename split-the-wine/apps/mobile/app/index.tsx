import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, money, type PublicReceipt } from "../src/api";
import { colors } from "../src/theme";

export default function HostHome() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<PublicReceipt[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ receipts: PublicReceipt[] }>("/receipts");
      setReceipts(data.receipts.filter((r) => r.status !== "draft"));
    } catch {
      setReceipts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.brand}>Split{"\n"}the Wine</Text>
      <Text style={styles.lede}>
        We'll walk you through the check — claim what you ordered, then see
        exactly what you owe.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
        onPress={() => router.push("/capture?demo=1")}
      >
        <Text style={styles.btnPrimaryText}>✓  Start with a demo receipt</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
        onPress={() => router.push("/capture")}
      >
        <Text style={styles.btnSecondaryText}>Take or upload a photo</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
        onPress={() => router.push("/review?manual=1")}
      >
        <Text style={styles.btnGhostText}>Enter items myself</Text>
      </Pressable>

      <Text style={styles.section}>Recent</Text>
      {receipts.length === 0 ? (
        <Text style={styles.muted}>No open receipts yet.</Text>
      ) : (
        receipts.map((r) => (
          <Pressable
            key={r.id}
            style={styles.row}
            onPress={() => router.push(`/claim/${r.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.restaurant || "Untitled tab"}</Text>
              <Text style={styles.muted}>
                {r.status} · {r.items.length} items ·{" "}
                {money(r.items.reduce((s, i) => s + i.totalCents, 0))}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {r.items.reduce((s, i) => s + i.remaining, 0)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
    gap: 12,
  },
  brand: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 48,
    lineHeight: 46,
    color: colors.ink,
    marginBottom: 8,
  },
  lede: {
    fontFamily: "NunitoSans_400Regular",
    fontSize: 17,
    lineHeight: 24,
    color: colors.inkDim,
    marginBottom: 20,
    maxWidth: 320,
  },
  btnPrimary: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
  },
  btnSecondary: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    color: colors.primaryDeep,
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
  },
  btnGhost: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: {
    color: colors.inkDim,
    fontFamily: "NunitoSans_600SemiBold",
    fontSize: 15,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  section: {
    marginTop: 18,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkDim,
    fontFamily: "NunitoSans_800ExtraBold",
  },
  muted: {
    color: colors.inkDim,
    fontFamily: "NunitoSans_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: {
    color: colors.ink,
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
    marginBottom: 4,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: colors.primaryDeep,
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
  },
});
