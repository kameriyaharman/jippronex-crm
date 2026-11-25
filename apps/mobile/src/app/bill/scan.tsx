import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { api, inr } from "@/lib/api";
import { bus } from "@/lib/bus";
import { Btn, C } from "@/components/ui";
import type { Product } from "@/components/Pickers";

/** 08 Barcode scan with camera. mode=bill → adds to bill, mode=lookup → opens product */
export default function Scan() {
  const { mode = "bill" } = useLocalSearchParams<{ mode?: string }>();
  const [perm, request] = useCameraPermissions();
  const [found, setFound] = useState<Product | null>(null);
  const [n, setN] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const busy = useRef(false);
  const last = useRef<string>("");

  const onScan = async ({ data }: { data: string }) => {
    if (busy.current || data === last.current) return;
    busy.current = true; last.current = data;
    try {
      const p = await api<Product>(`/products/barcode/${encodeURIComponent(data)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (mode === "lookup") { router.replace(`/product/${p.id}`); return; }
      setFound(p); setN(1); setMsg(null);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMsg(`No product with barcode ${data}`);
      setTimeout(() => { last.current = ""; }, 1500);
    } finally { busy.current = false; }
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!perm.granted) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: C.bg }}>
      <Feather name="camera" size={40} color={C.brand} />
      <Text style={{ fontSize: 16, fontWeight: "700", textAlign: "center" }}>Allow camera to scan product barcodes</Text>
      <Btn title="Allow camera" onPress={request} style={{ alignSelf: "stretch" }} />
      <Btn title="Cancel" kind="ghost" onPress={() => router.back()} />
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={found ? undefined : onScan}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }} />
      <View style={{ position: "absolute", top: 50, left: 16, right: 16, flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: "#0008", borderRadius: 20, padding: 8 }}><Feather name="x" size={22} color="#fff" /></Pressable>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17, marginLeft: 12 }}>Scan barcode</Text>
      </View>
      <View pointerEvents="none" style={{ position: "absolute", top: "32%", left: "12%", right: "12%", height: 160, borderWidth: 3, borderColor: "#fff", borderRadius: 18 }} />
      {!found && <Text style={{ position: "absolute", top: "58%", alignSelf: "center", color: "#fff", fontWeight: "600" }}>{msg || "Point camera at product barcode"}</Text>}
      {found && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 }}>
          <View><Text style={{ fontSize: 17, fontWeight: "800" }}>{found.name}</Text><Text style={{ color: C.muted }}>{found.barcode} · Stock {found.stock}</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 24, fontWeight: "800" }}>{inr(found.saleRate)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable onPress={() => setN(Math.max(1, n - 1))} style={stepBtn}><Text style={stepTxt}>−</Text></Pressable>
              <Text style={{ fontSize: 20, fontWeight: "800", minWidth: 30, textAlign: "center" }}>{n}</Text>
              <Pressable onPress={() => setN(n + 1)} style={stepBtn}><Text style={stepTxt}>+</Text></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn title="Scan next" kind="outline" style={{ flex: 1 }} onPress={() => { bus.emit("scan:add", { product: found, qty: n }); setFound(null); last.current = ""; }} />
            <Btn title="Add to bill" style={{ flex: 1 }} onPress={() => { bus.emit("scan:add", { product: found, qty: n }); router.back(); }} />
          </View>
        </View>
      )}
    </View>
  );
}
const stepBtn = { width: 40, height: 40, borderRadius: 12, backgroundColor: C.brand50, alignItems: "center" as const, justifyContent: "center" as const };
const stepTxt = { fontSize: 22, fontWeight: "800" as const, color: C.brand };
