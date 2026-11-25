import { useState } from "react";
import { Linking, Pressable, Text, View, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { api, useApi, inr, inr2, dt } from "@/lib/api";
import { invoiceHtml } from "@/lib/invoiceHtml";
import { useSession } from "@/lib/session";
import { Btn, C, Card, Chips, KV, Loading, Screen, Divider, ErrorText, Pill, s } from "@/components/ui";

/** 10 Bill saved · 11 Invoice view · 12 WhatsApp share · 15 Thermal print */
export default function BillView() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const { can } = useSession();
  const { data: inv, error, reload } = useApi<any>(`/invoices/${id}`);
  const [format, setFormat] = useState<"A4" | "A5" | "THERMAL">("A4");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <Screen title="Bill"><ErrorText error={error} /></Screen>;
  if (!inv) return <Screen title="Bill"><Loading /></Screen>;

  const pdf = async () => {
    setBusy("pdf");
    try {
      const { uri } = await Print.printToFileAsync({ html: invoiceHtml(inv, format) });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `${inv.number}.pdf`, UTI: "com.adobe.pdf" });
    } finally { setBusy(null); }
  };
  const print = async () => { setBusy("print"); try { await Print.printAsync({ html: invoiceHtml(inv, format) }); } catch { /* cancelled */ } finally { setBusy(null); } };
  const whatsapp = async () => {
    const ok = await Linking.canOpenURL("whatsapp://send").catch(() => false);
    const phone = inv.customerPhone ? "91" + String(inv.customerPhone).slice(-10) : "";
    await Linking.openURL(ok ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(inv.whatsapp.text)}` : inv.whatsapp.link);
  };
  const convert = async () => {
    try { const n = await api(`/invoices/${id}/convert`, { body: {} }); router.replace(`/bill/${n.id}?saved=1`); }
    catch (e: any) { Alert.alert("Could not convert", e.message); }
  };
  const isInv = inv.kind === "INVOICE";

  return (
    <Screen title={inv.number} sub={inv.customerName} footer={<View style={{ flexDirection: "row", gap: 10 }}>
      <Btn title="PDF" icon="file-text" kind="outline" style={{ flex: 1 }} onPress={pdf} loading={busy === "pdf"} />
      <Btn title="WhatsApp" icon="message-circle" kind="wa" style={{ flex: 1.3 }} onPress={whatsapp} />
      <Btn title="Print" icon="printer" style={{ flex: 1 }} onPress={print} loading={busy === "print"} />
    </View>}>
      {saved && (
        <View style={{ alignItems: "center", paddingVertical: 12, gap: 6 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.ok50, alignItems: "center", justifyContent: "center" }}><Feather name="check" size={34} color={C.ok} /></View>
          <Text style={{ fontSize: 20, fontWeight: "800" }}>{isInv ? "Bill saved!" : "Saved!"}</Text>
          <Text style={s.muted}>{inv.number} · {inv.customerName}</Text>
          <Text style={{ fontSize: 34, fontWeight: "800" }}>{inr(inv.total)}</Text>
          {isInv && inv.balance > 0 && <Text style={{ color: C.bad, fontWeight: "700" }}>Balance {inr(inv.balance)}{inv.dueDate ? ` due ${dt(inv.dueDate).slice(0, 6)}` : ""}</Text>}
          {can("invoice.create") && <Pressable onPress={() => router.replace(isInv ? "/bill/new" : `/bill/new?kind=${inv.kind}`)}><Text style={{ color: C.brand, fontWeight: "800", marginTop: 6 }}>+ New bill</Text></Pressable>}
        </View>
      )}
      <Chips value={format} onChange={setFormat} options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }, { value: "THERMAL", label: "Thermal" }]} />
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View><Text style={{ fontWeight: "800", color: C.brand, fontSize: 16 }}>{inv.business.name.toUpperCase()}</Text><Text style={s.muted}>{inv.business.city}{inv.business.gstin ? ` · GSTIN ${inv.business.gstin}` : ""}</Text></View>
          {isInv && <Pill status={inv.cancelled ? "EXPIRED" : inv.status} label={inv.cancelled ? "Cancelled" : undefined} />}
        </View>
        <Divider />
        <Text style={{ fontWeight: "800", fontSize: 13 }}>{inv.billType === "NON_GST" ? "BILL / CASH MEMO" : inv.kind === "INVOICE" ? "TAX INVOICE" : inv.kind.replace("_", " ")} · {dt(inv.date)}</Text>
        <Text style={s.muted}>Bill to: {inv.customerName}{inv.party?.gstin ? ` · ${inv.party.gstin}` : ""}</Text>
        <Divider />
        {inv.items.map((it: any) => (
          <View key={it.id} style={{ flexDirection: "row", paddingVertical: 4 }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "700" }}>{it.name}</Text><Text style={s.muted}>{it.qty} {it.unit} × {inr2(it.rate)}{inv.billType === "GST" ? ` · GST ${it.gstRate}%` : ""}</Text></View>
            <Text style={{ fontWeight: "700" }}>{inr2(it.amount)}</Text>
          </View>))}
        <Divider />
        <KV k="Taxable" v={`₹${inr2(inv.taxable)}`} />
        {inv.billType === "GST" && (inv.interState ? <KV k="IGST" v={`₹${inr2(inv.igst)}`} /> : <KV k="CGST + SGST" v={`₹${inr2(inv.cgst)} + ₹${inr2(inv.sgst)}`} />)}
        <KV k="Total" v={inr(inv.total)} bold big color={C.brand} />
        {isInv && <><KV k="Received" v={inr(inv.received)} color={C.ok} /><KV k="Balance" v={inr(inv.balance)} color={C.bad} /></>}
        <Text style={[s.muted, { marginTop: 4 }]}>{inv.amountInWords}</Text>
      </Card>
      <Card style={{ backgroundColor: "#E7F6EC", borderColor: "#CDEBD6" }}>
        <Text style={{ fontSize: 13.5, color: C.ink }}>{inv.whatsapp.text}</Text>
        {inv.balance > 0 && <Text style={{ color: C.brand, fontWeight: "800", marginTop: 8 }} onPress={() => Linking.openURL(inv.shareUrl)}>Pay now {inr(inv.balance)} →</Text>}
      </Card>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {isInv && inv.balance > 0 && inv.partyId && !inv.cancelled && <Btn title="Receive payment" icon="download" kind="outline" small style={{ flex: 1 }} onPress={() => router.push(`/receive?partyId=${inv.partyId}&invoiceId=${inv.id}`)} />}
        {!isInv && inv.kind !== "CREDIT_NOTE" && !inv.convertedToId && can("invoice.create") && <Btn title="Convert to bill" icon="repeat" small style={{ flex: 1 }} onPress={convert} />}
        {isInv && !inv.cancelled && can("invoice.edit") && <Btn title="Cancel bill" kind="ghost" small style={{ flex: 1 }} onPress={() => Alert.alert(`Cancel ${inv.number}?`, "Stock will be restored and the amount removed from the ledger.", [{ text: "Keep" }, { text: "Cancel bill", style: "destructive", onPress: async () => { await api(`/invoices/${id}/cancel`, { body: {} }); reload(); } }])} />}
      </View>
    </Screen>
  );
}
