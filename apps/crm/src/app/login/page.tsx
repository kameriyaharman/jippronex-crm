"use client";
import { useEffect, useRef, useState } from "react";
import { api, auth } from "@/lib/api";
import { Logo, ErrorBox, Spinner } from "@/components/ui";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function Login() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (timer <= 0) return; const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); }, [timer]);

  const send = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/otp/send", { body: { phone } });
      setDevOtp(r.devOtp || null); setStep("otp"); setTimer(r.resendIn || 30);
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/otp/verify", { body: { phone, code: otp, via: "web" } });
      auth.set(r.token, r.businesses?.[0]?.id);
      location.href = r.needsSetup ? "/setup" : "/dashboard";
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-12 relative overflow-hidden">
        <div className="bg-white/95 rounded-2xl px-4 py-3 w-fit"><Logo /></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold leading-tight max-w-md">GST billing, stock & accounts — in one simple app.</h1>
          <p className="text-brand-100 mt-4 max-w-md">Scan barcode, make GST bills, share on WhatsApp, track every rupee your customers owe you.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md text-sm">
            {["GST & non-GST bills", "Live inventory", "Party ledger", "WhatsApp invoices", "GSTR-1 export", "Android app"].map((f) => (
              <div key={f} className="rounded-xl bg-white/10 px-3 py-2.5 font-semibold">{f}</div>
            ))}
          </div>
        </div>
        <div className="text-brand-100 text-sm">Technology That Empowers Business</div>
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full border-[40px] border-white/5" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10"><Logo /></div>
          {step === "phone" ? (
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold">Welcome 👋</h2>
                <p className="text-muted mt-1">Login with your mobile number</p>
              </div>
              <label className="block">
                <span className="label">Mobile number</span>
                <div className="flex">
                  <span className="h-12 px-3 grid place-items-center rounded-l-xl border border-r-0 border-line bg-canvas font-semibold">+91</span>
                  <input autoFocus inputMode="numeric" maxLength={10} className="input h-12 rounded-l-none text-base font-semibold tracking-wide" placeholder="98300 12345"
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                </div>
                <span className="text-xs text-muted mt-1.5 block">We will send a 6-digit OTP on SMS / WhatsApp</span>
              </label>
              <ErrorBox error={err} />
              <button className="btn-primary w-full h-12" disabled={phone.length !== 10 || busy}>{busy ? <Spinner className="size-4 text-white" /> : "Get OTP"}</button>
              <p className="text-xs text-center text-muted">By continuing you agree to Terms & Privacy</p>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-5">
              <button type="button" className="btn-ghost btn-sm -ml-2" onClick={() => setStep("phone")}><ArrowLeft className="size-4" />Back</button>
              <div>
                <h2 className="text-2xl font-extrabold">Verify OTP</h2>
                <p className="text-muted mt-1">Sent to +91 {phone} · <button type="button" className="text-brand font-semibold" onClick={() => setStep("phone")}>Edit</button></p>
              </div>
              <input ref={otpRef} inputMode="numeric" maxLength={6} className="input h-14 text-center text-2xl font-extrabold tracking-[0.6em]" placeholder="••••••"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              {devOtp && <div className="text-xs rounded-lg bg-warn-50 text-warn px-3 py-2 font-semibold">Test mode OTP: {devOtp}</div>}
              <ErrorBox error={err} />
              <button className="btn-primary w-full h-12" disabled={otp.length < 4 || busy}>{busy ? <Spinner className="size-4 text-white" /> : <><ShieldCheck className="size-4" />Verify & continue</>}</button>
              <div className="text-sm text-center text-muted">
                {timer > 0 ? <>Resend OTP in 00:{String(timer).padStart(2, "0")}</> : <button type="button" className="text-brand font-semibold" onClick={send}>Resend OTP</button>}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
