import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { API_URL, api } from "../src/api";
import { colors } from "../src/theme";

export default function CaptureReceipt() {
  const router = useRouter();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo === "1") {
      void runDemo();
    }
  }, [demo]);

  async function runDemo() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ receiptId: string }>("/receipts", {
        method: "POST",
        body: "{}",
      });
      await api(`/receipts/${created.receiptId}/parse`, {
        method: "POST",
        body: JSON.stringify({ useDemo: true }),
      });
      router.replace(`/review?id=${created.receiptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  async function parseFile(uri: string, name: string, type: string) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", { uri, name, type } as unknown as Blob);
      const created = await fetch(`${API_URL}/receipts`, {
        method: "POST",
        body: form,
      }).then((r) => r.json());
      await api(`/receipts/${created.receiptId}/parse`, {
        method: "POST",
        body: "{}",
      });
      router.replace(`/review?id=${created.receiptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setBusy(false);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission needed");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await parseFile(asset.uri, "receipt.jpg", asset.mimeType ?? "image/jpeg");
    }
  }

  async function pickLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission needed");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await parseFile(asset.uri, "receipt.jpg", asset.mimeType ?? "image/jpeg");
    }
  }

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.title}>Reading the tab…</Text>
        <Text style={styles.sub}>
          Vision runs on the server. You’ll review before sharing.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Capture receipt</Text>
      <Text style={styles.sub}>
        Take a photo or choose from your library. Both actions are explicit.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.btnPrimary} onPress={takePhoto}>
        <Text style={styles.btnPrimaryText}>Take Photo</Text>
      </Pressable>
      <Pressable style={styles.btnSecondary} onPress={pickLibrary}>
        <Text style={styles.btnSecondaryText}>Choose from Library</Text>
      </Pressable>
      <Pressable style={styles.btnGhost} onPress={runDemo}>
        <Text style={styles.btnGhostText}>Use demo bar tab instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 32,
    color: colors.ink,
  },
  sub: {
    fontFamily: "NunitoSans_400Regular",
    color: colors.inkDim,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
    textAlign: "center",
  },
  error: { color: colors.danger, fontFamily: "NunitoSans_600SemiBold" },
  btnPrimary: {
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
  btnSecondary: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    color: colors.ink,
    fontFamily: "NunitoSans_800ExtraBold",
    fontSize: 16,
  },
  btnGhost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  btnGhostText: { color: colors.inkDim, fontFamily: "NunitoSans_600SemiBold" },
});
