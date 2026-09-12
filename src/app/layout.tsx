import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { Logo } from "@/components/Logo";
import { heading, body } from "./fonts";

export const metadata: Metadata = {
  title: "Fantasy Phishing · Mavacy",
  description: "A closed-league, consent-based phishing-awareness training game by Mavacy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-sky/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
            <Logo />
            <p className="max-w-xl font-body text-xs leading-relaxed text-sky/50">
              A phishing-<span className="text-sky/80">awareness</span> training game. Consented league members only.
              Nothing leaves the app. Every link teaches. Landing pages collect nothing.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
