"use client";
import { createContext, useContext } from "react";
export type Me = { admin: { id: string; name: string; email: string; role: "SUPER_ADMIN" | "SALES" | "PARTNER"; sellerId: string | null }; gateway: { razorpay: boolean; live: boolean; lastPaymentAt: string | null } };
export const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;
