import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = { title: "JipproBill — Master Admin", description: "GST billing, inventory and accounts for Indian businesses" };
export const viewport: Viewport = { themeColor: "#0b46c4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-[14px]"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
