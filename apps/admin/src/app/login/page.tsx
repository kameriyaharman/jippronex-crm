"use client";
import { useState } from "react";
import { api, auth } from "@/lib/api";
import { Logo, ErrorBox, Field, Spinner } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await api("/auth/login", { body: { email, password } }); auth.set(r.token); location.href = "/dashboard"; }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={go} className="card p-8 w-full max-w-sm space-y-4 shadow-xl shadow-brand/5">
        <Logo />
        <div><h1 className="text-xl font-extrabold mt-4">Master Admin</h1><p className="text-sm text-muted">Sign in to manage JipproBill customers & subscriptions</p></div>
        <Field label="Email"><input type="email" autoFocus className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={err} />
        <button className="btn-primary w-full h-11" disabled={busy}>{busy ? <Spinner className="size-4 text-white" /> : "Sign in"}</button>
      </form>
    </div>
  );
}
