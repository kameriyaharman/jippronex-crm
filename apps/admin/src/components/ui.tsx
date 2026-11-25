"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X, LoaderCircle, CircleCheck, CircleAlert } from "lucide-react";
import clsx from "clsx";

export const cx = clsx;

export function Logo({ sub = "Master Admin", small = false }: { sub?: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="JipproBill" width={small ? 34 : 42} height={small ? 34 : 42} className="shrink-0" />
      <div className="leading-tight">
        <div className="font-extrabold text-[17px] tracking-tight text-brand">Jippro<span className="text-[#E8A800]">Bill</span></div>
        {sub && <div className="text-[10.5px] text-muted font-medium">{sub}</div>}
      </div>
    </div>
  );
}

const statusStyle: Record<string, string> = {
  PAID: "bg-ok-50 text-ok", PARTIAL: "bg-warn-50 text-warn", UNPAID: "bg-bad-50 text-bad",
  ACTIVE: "bg-ok-50 text-ok", TRIAL: "bg-brand-50 text-brand", INVITED: "bg-warn-50 text-warn", DISABLED: "bg-canvas text-muted",
  EXPIRED: "bg-bad-50 text-bad", FAILED: "bg-bad-50 text-bad", LOW: "bg-bad-50 text-bad", OUT: "bg-bad-50 text-bad", OK: "bg-ok-50 text-ok",
  CAPTURED: "bg-ok-50 text-ok", TO_DEPOSIT: "bg-warn-50 text-warn", REFUNDED: "bg-canvas text-muted", CREATED: "bg-canvas text-muted",
};
export function Pill({ status, children, className }: { status?: string; children?: ReactNode; className?: string }) {
  const label = children ?? (status ? status[0] + status.slice(1).toLowerCase().replace("_", " ") : "");
  return <span className={cx("pill", statusStyle[status || ""] || "bg-canvas text-muted", className)}><span className="size-1.5 rounded-full bg-current opacity-70" />{label}</span>;
}

export function Kpi({ label, value, sub, subTone, icon, tone = "brand" }: { label: string; value: ReactNode; sub?: ReactNode; subTone?: "ok" | "bad" | "muted"; icon?: ReactNode; tone?: "brand" | "ok" | "warn" | "bad" | "violet" }) {
  const tones = { brand: "bg-brand-50 text-brand", ok: "bg-ok-50 text-ok", warn: "bg-warn-50 text-warn", bad: "bg-bad-50 text-bad", violet: "bg-violet-50 text-violet-600" };
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="kpi-label">{label}</div>
        {icon && <div className={cx("size-7 rounded-lg grid place-items-center shrink-0 [&_svg]:size-4", tones[tone])}>{icon}</div>}
      </div>
      <div className="kpi-value mt-1.5 truncate">{value}</div>
      {sub != null && <div className={cx("text-xs mt-1 font-medium", subTone === "ok" ? "text-ok" : subTone === "bad" ? "text-bad" : "text-muted")}>{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("animate-spin text-brand", className || "size-5")} />;
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm"><Spinner />{label}</div>;
}
export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="font-bold">{title}</div>
      {sub && <div className="text-sm text-muted mt-1">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-xl bg-bad-50 text-bad text-sm px-4 py-3 font-medium">{error}</div>;
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 no-print" onMouseDown={onClose}>
      <div className={cx("card w-full shadow-2xl max-h-[90vh] flex flex-col", wide ? "max-w-3xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="font-bold text-base">{title}</div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted mt-1 block">{hint}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="seg">
      {options.map((o) => <button type="button" key={o.value} data-on={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center justify-between w-full gap-3 py-2.5 text-sm text-left">
      {label && <span className="font-medium">{label}</span>}
      <span className={cx("relative w-10 h-6 rounded-full transition shrink-0", on ? "bg-ok" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

// ── Toasts ──
type Toast = { id: number; msg: string; tone: "ok" | "bad" };
const ToastCtx = createContext<(msg: string, tone?: "ok" | "bad") => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] space-y-2 no-print">
        {list.map((t) => (
          <div key={t.id} className={cx("flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg text-white", t.tone === "ok" ? "bg-ink" : "bg-bad")}>
            {t.tone === "ok" ? <CircleCheck className="size-4 text-green-400" /> : <CircleAlert className="size-4" />}{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const i = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <div className={cx("rounded-full grid place-items-center font-bold text-xs shrink-0", className || "size-9 bg-amber-400 text-white")}>{i}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("overflow-x-auto", className)}><table className="w-full border-collapse">{children}</table></div>;
}

export function Upgrade({ what }: { what: string }) {
  return (
    <div className="card p-10 text-center max-w-lg mx-auto mt-10">
      <div className="text-xl font-extrabold">{what} is not in your plan</div>
      <p className="text-muted mt-2 text-sm">Upgrade your JipproBill plan to unlock it. Your existing data stays safe.</p>
      <a href="/settings?tab=plan" className="btn-primary mt-5">See plans</a>
    </div>
  );
}
