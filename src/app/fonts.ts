import { Instrument_Serif, Instrument_Sans } from "next/font/google";

// Brand type: Argent CF (headings) + Almarena (body/CTA). Both are commercial faces and
// are not bundled. These are the closest open pairings; the Tailwind font stacks list the
// licensed names FIRST so they take over automatically when installed on the machine.
//
// To bundle the licensed files instead: drop them in /public/fonts and swap these two
// exports for next/font/local (see README → Brand).
export const heading = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const body = Instrument_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
