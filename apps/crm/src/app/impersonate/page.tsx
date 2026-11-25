"use client";
import { useEffect } from "react";
import { auth } from "@/lib/api";
/** Admin "Login as customer" lands here */
export default function Impersonate() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const t = q.get("token");
    if (t) auth.set(t, q.get("business"));
    location.replace("/dashboard");
  }, []);
  return <div className="p-10 text-muted">Opening customer account…</div>;
}
