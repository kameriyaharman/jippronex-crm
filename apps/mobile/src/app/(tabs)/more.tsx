import { Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { C, Card, Row, Screen, Divider, Btn, type IconName } from "@/components/ui";

const ITEMS: [IconName, string, string, string, string?][] = [
  ["zap", "Quick cash bill", "Counter billing with top items", "/quick-bill", "invoice.create"],
  ["file", "Quotation / estimate", "Share a quote, convert to bill", "/bill/new?kind=QUOTATION", "invoice.create"],
  ["shopping-cart", "Purchase entry", "Supplier bill — stock goes up", "/purchase", "purchase"],
  ["repeat", "Stock in / out", "Opening, return, damage, transfer", "/stock-adjust", "stock.adjust"],
  ["download", "Receive payment", "From customers", "/receive", "payments"],
  ["credit-card", "Add expense", "Rent, salary, electricity…", "/expense", "payments"],
  ["book-open", "Cash & bank", "Today's money in / out", "/cashbook", "payments"],
  ["bar-chart-2", "Reports", "Sales, stock, outstanding", "/reports"],
  ["percent", "GST & profit", "Output / input GST, P&L", "/gst", "accounts"],
  ["settings", "Settings & subscription", "Plan, business profile, printer", "/settings"],
];

export default function More() {
  const { can, logout, business, me } = useSession();
  return (
    <Screen title="More" back={false}>
      <Card style={{ paddingVertical: 4 }}>
        {ITEMS.filter((i) => !i[4] || can(i[4])).map(([ic, t, sub, href], n) => (
          <View key={t}>{n > 0 && <Divider />}
            <Row left={t} sub={sub} onPress={() => router.push(href as any)} icon={<Feather name={ic} size={19} color={C.brand} />} right="›" rightColor={C.faint} /></View>))}
      </Card>
      <Text style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>{business?.name} · {me?.user.phone}</Text>
      <Btn title="Logout" kind="outline" icon="log-out" onPress={async () => { await logout(); router.replace("/login"); }} />
    </Screen>
  );
}
