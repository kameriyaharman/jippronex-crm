"use client";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { api, inr, dm, isoDate } from "@/lib/api";
import { Modal, Field, ErrorBox, cx, useToast, Spinner } from "./ui";
import { PartyPicker, type Party } from "./pickers";

/** Receive from customer (IN) or pay a supplier (OUT), adjusting against open bills. */
export function ReceivePayment({ partyId, invoiceId, direction: dirProp, onClose, onSaved }: { partyId?: string | null; invoiceId?: string; direction?: "IN" | "OUT"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [party, setParty] = useState<Party | null>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"CASH" | "UPI" | "BANK" | "CHEQUE">("UPI");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (partyId) api(`/parties/${partyId}`).then((l) => { setParty(l.party); }); }, [partyId]);
  useEffect(() => {
    if (!party) return;
    api(`/parties/${party.id}`).then((l) => {
      setLedger(l);
      const due = Math.abs(l.party.balance);
      const bills = party.type === "CUSTOMER" ? l.openBills : l.openPurchases;
      const pre = invoiceId ? bills.find((b: any) => b.id === invoiceId) : null;
      setAmount(String(pre ? pre.balance : due || ""));
    });
  }, [party, invoiceId]);
  const direction = dirProp || (party?.type === "SUPPLIER" ? "OUT" : "IN");
  const bills: any[] = ledger ? (party?.type === "SUPPLIER" ? ledger.openPurchases : ledger.openBills) : [];
  // auto FIFO allocation preview whenever amount changes
  useEffect(() => {
    let left = Number(amount || 0);
    const a: Record<string, number> = {};
    const ordered = invoiceId ? [...bills].sort((x) => (x.id === invoiceId ? -1 : 1)) : bills;
    for (const b of ordered) { if (left <= 0) break; const v = Math.min(left, b.balance); a[b.id] = Math.round(v * 100) / 100; left -= v; }
    setAlloc(a);
  }, [amount, ledger]); // eslint-disable-line

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([id, v]) => (party!.type === "SUPPLIER" ? { purchaseId: id, amount: v } : { invoiceId: id, amount: v }));
      const r = await api("/payments", { body: { direction, partyId: party!.id, amount: Number(amount), mode, reference: reference || undefined, date: new Date(date + "T12:00:00"), allocations } });
      toast(`${r.number} saved`);
      setDone(r);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (done) return (
    <Modal open onClose={onSaved} title={direction === "IN" ? "Payment received ✓" : "Payment recorded ✓"}
      footer={<><button className="btn-outline" onClick={onSaved}>Done</button>{done.party?.phone && <a className="btn-wa" href={done.whatsapp.link} target="_blank" rel="noreferrer" onClick={onSaved}><MessageCircle className="size-4" />Send receipt</a>}</>}>
      <div className="text-center py-2">
        <div className="text-xs font-bold text-muted tracking-widest">{done.number}</div>
        <div className="text-4xl font-extrabold my-2">{inr(done.amount)}</div>
        <div className="text-sm text-muted">{done.amountInWords}</div>
        <div className="text-sm mt-2">{direction === "IN" ? "from" : "to"} <b>{done.party?.name}</b> via {done.mode}{done.against.length ? ` · against ${done.against.join(", ")}` : ""}</div>
        <div className="text-sm mt-1">Balance now <b>{inr(Math.abs(done.party?.balance || 0))}</b></div>
      </div>
    </Modal>
  );

  return (
    <Modal open onClose={onClose} title={direction === "IN" ? "Receive payment" : "Pay supplier"}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!party || !(Number(amount) > 0) || busy} onClick={save}>{busy ? <Spinner className="size-4 text-white" /> : "Save & send receipt"}</button></>}>
      <div className="space-y-3">
        <Field label="Party">{partyId ? <div className="input flex items-center font-semibold">{party?.name || "…"}<span className="ml-auto text-xs text-muted">Bal {inr(Math.abs(party?.balance || 0))}</span></div>
          : <PartyPicker type={dirProp === "OUT" ? "SUPPLIER" : "CUSTOMER"} value={party} onChange={setParty} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><input className="input text-lg font-extrabold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Mode"><div className="grid grid-cols-4 gap-1.5">{(["CASH", "UPI", "BANK", "CHEQUE"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cx("h-9 rounded-full text-sm font-semibold border", mode === m ? "bg-brand text-white border-brand" : "border-line text-muted")}>{m[0] + m.slice(1).toLowerCase()}</button>
        ))}</div></Field>
        {mode !== "CASH" && <Field label="Reference (UTR / cheque no.)"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        {bills.length > 0 && <div>
          <div className="label">Adjust against bills</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {bills.map((b) => (
              <div key={b.id} className={cx("flex items-center justify-between rounded-xl border px-3 py-2", alloc[b.id] ? "border-brand bg-brand-50/40" : "border-line")}>
                <div><div className="text-sm font-semibold font-mono">{b.number}</div><div className="text-xs text-muted">{dm(b.date)} · due {inr(b.balance)}{alloc[b.id] >= b.balance - 0.01 ? " · fully paid" : alloc[b.id] ? " · part paid" : ""}</div></div>
                <div className="font-bold text-sm">{alloc[b.id] ? inr(alloc[b.id]) : "—"}</div>
              </div>
            ))}
          </div>
        </div>}
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}
