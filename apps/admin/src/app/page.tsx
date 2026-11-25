"use client";
import { useEffect } from "react";
import { auth } from "@/lib/api";
export default function Home() {
  useEffect(() => { location.replace(auth.token() ? "/dashboard" : "/login"); }, []);
  return null;
}
