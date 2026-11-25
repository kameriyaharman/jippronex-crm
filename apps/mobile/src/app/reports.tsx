import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Paths, File } from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useApi, short, API_URL, auth, ym } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C, Card, Screen } from "@/components/ui";

const LIST: [string, string][] = [["sales-register", "Sales register"], ["purchase-register", "Purchase register"], ["stock-summary", "Stock summary"], ["low-stock", "Low stock"],
  ["outstanding", "Outstanding"], ["profit-loss", "Profit & Loss"], ["hsn-summary", "GST / HSN report"], ["day-book", "Day book"]];

/** 28 Reports */
export default function Reports() {
  const { can } = useSession();
  const { data: r } = useApi<any>("/reports/overview");
  const open = async (key: string) => {
    if (key === "profit-loss" && can("accounts")) return router.push("/gst");
    if (!can("reports.export")) return Alert.alert("Not allowed", "Reports download is for Owner / Accountant.");
    try {
      const res = await fetch(`${API_URL}/api/reports/${key}.xlsx?month=${ym()}`, { headers: { Authorization: `Bearer ${auth.token}`, "x-business-id": auth.business || "" } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const file = new File(Paths.cache, `${key}-${ym()}.xlsx`);
      if (file.exists) await file.delete();
      await file.write(new Uint8Array(await res.arrayBuffer()));
      await Sharing.shareAsync(file.uri, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } catch (e: any) { Alert.alert("Could not download", e.message); }
  };
  return (
    <Screen title="Reports">
      <Card style={{ backgroundColor: C.brand, borderColor: C.brand }}>
        <Text style={{ color: C.brand300, fontWeight: "700" }}>Sales this month</Text>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800" }}>{short(r?.salesThisMonth)}</Text>
        {r && <Text style={{ color: C.brand300, fontWeight: "600" }}>{r.fy} revenue {short(r.revenue)}{r.revenueChangePct != null ? ` · ${r.revenueChangePct >= 0 ? "↑" : "↓"} ${Math.abs(r.revenueChangePct)}%` : ""}</Text>}
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {LIST.map(([k, l]) => (
          <Pressable key={k} onPress={() => open(k)} style={{ width: "48%", backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 }}>
            <Feather name="file-text" size={20} color={C.ok} /><Text style={{ fontWeight: "700" }}>{l}</Text><Text style={{ color: C.muted, fontSize: 11 }}>Excel · share</Text>
          </Pressable>))}
      </View>
    </Screen>
  );
}
