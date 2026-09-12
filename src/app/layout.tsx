import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Fantasy Phishing",
  description: "A closed-league, consent-based phishing-awareness training game.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="field-bg min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
