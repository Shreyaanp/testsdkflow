import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mercle · testsdkflow",
  description: "Mercle mini-app demo (scaffolded via @mercle/mcp-server)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
