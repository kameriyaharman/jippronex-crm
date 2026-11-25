"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, Field, ErrorBox, Loading, useToast } from "@/components/ui";

export default function Settings() {
  const me = useMe();
  const toast = useToast();
  const isSuper = me.admin.role === "SUPER_ADMIN";
  const { data } = useApi<any>("/settings/company");
  const [co, setCo] = useState<any>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data !== undefined) setCo(data || { name: "Jippronex Technologies", gstin: "", address: "", email: "", phone: "" }); }, [data]);
  if (!co) return <Loading />;
  const saveCo = async () => { try { await api("/settings/company", { method: "PUT", body: co }); toast("Company details saved"); } catch (e: any) { setErr(e.message); } };
  const savePw = async () => { try { await api(`/admins/${me.admin.id}/password`, { method: "PUT", body: { password: pw } }); setPw(""); toast("Password changed"); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" sub="Company details on subscription invoices and your admin login" />
      <ErrorBox error={err} />
      {isSuper && <div className="card p-5 space-y-3">
        <div className="flex justify-between items-center"><div className="font-bold">Company (seller on GST invoices)</div><button className="btn-primary btn-sm" onClick={saveCo}><Save className="size-3.5" />Save</button></div>
        <div className="grid md:grid-cols-2 gap-3">
          {[["name", "Company name"], ["gstin", "GSTIN"], ["address", "Address"], ["email", "Billing email"], ["phone", "Support phone"]].map(([k, l]) => (
            <Field key={k} label={l}><input className="input" value={co[k] || ""} onChange={(e) => setCo({ ...co, [k]: e.target.value })} /></Field>))}
        </div>
      </div>}
      <div className="card p-5 space-y-3">
        <div className="font-bold">Your login</div>
        <div className="text-sm text-muted">{me.admin.name} · {me.admin.email}</div>
        <div className="flex gap-2 items-end"><Field label="New password" className="flex-1"><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><button className="btn-primary" disabled={pw.length < 6} onClick={savePw}>Change</button></div>
      </div>
    </div>
  );
}
