import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { api, type PublicReceipt } from "../../src/api";
import { colors } from "../../src/theme";
import { useReceiptLive } from "../../src/useReceiptLive";

export default function ClaimLinkShare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);

  useEffect(() => {
    api<{ receipt: PublicReceipt }>(`/receipts/${id}`).then((d) =>
      setReceipt(d.receipt)
    );
  }, [id]);

  useReceiptLive(id, setReceipt);

  if (!receipt) {
    return <View style={styles.container} />;
  }

  const claimed = receipt.items.reduce((s, i) => s + (i.qty - i.remaining), 0);
  const total = receipt.items.reduce((s, i) => s + i.qty, 0);
  const pct = total ? Math.round((claimed / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Share the link</Text>
      <Text style={styles.sub}>
        Anyone with the URL can claim — web fallback if they don’t have the app.
      </Text>
      <View style={styles.linkBox}>
        <Text style={styles.link}>{receipt.claimUrl}</Text>
      </View>
      <Pressable
        style={styles.btnPrimary}
        onPress={async () => {
          await Clipboard.setStringAsync(receipt.claimUrl);
        }}
      >
        <Text style={styles.btnPrimaryText}>Copy link</Text>
      </Pressable>
      <Pressable
        style={styles.btnSecondary}
        onPress={() =>
          Share.share({
            message: `Claim what you ordered: ${receipt.claimUrl}`,
            url: receipt.claimUrl,
          })
        }
      >
        <Text style={styles.btnSecondaryText}>Share…</Text>
      </Pressable>
      <Pressable
        style={styles.btnGold}
        onPress={() => router.push(`/claim/${receipt.id}`)}
      >
        <Text style={styles.btnGoldText}>Watch live claims</Text>
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.tiny}>
        {claimed} / {total} units · {pct}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 34, color: colors.ink },
  sub: { fontFamily: "NunitoSans_400Regular", color: colors.inkDim, marginBottom: 8 },
  linkBox: {
    padding: 16,
    borderRadius: 16,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: "rgba(0,163,65,0.35)",
    backgroundColor: colors.primarySoft,
  },
  link: { color: colors.primaryDeep, fontFamily: "NunitoSans_700Bold" },
  btnPrimary: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#ffffff", fontFamily: "NunitoSans_800ExtraBold", fontSize: 16 },
  btnSecondary: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { color: colors.primaryDeep, fontFamily: "NunitoSans_800ExtraBold", fontSize: 16 },
  btnGold: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGoldText: { color: "#ffffff", fontFamily: "NunitoSans_800ExtraBold", fontSize: 16 },
  track: {
    height: 6,
    borderRadius: 99,
    backgroundColor: "#e2efe7",
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: "100%", backgroundColor: colors.primary },
  tiny: { color: "#8a9a92", fontFamily: "NunitoSans_400Regular" },
});
