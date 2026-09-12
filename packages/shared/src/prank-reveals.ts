export const prankPresets = [
  { id: "rickroll", name: "Rickroll", description: "A familiar musical detour.", emoji: "🎵" },
  { id: "gone-fishing", name: "Gone fishing", description: "A little fish with a big reveal.", emoji: "🐟" },
  { id: "rubber-duck", name: "Duck surprise", description: "An unexpectedly important duck.", emoji: "🦆" },
] as const;
export type PrankPresetId = (typeof prankPresets)[number]["id"];
export type PrankRevealChoice = PrankPresetId | "photo";
/** Private image bytes are stored with the cast, never in the public game state. */
export interface PrankReveal {
  choice: PrankRevealChoice;
  revision: string;
  photo?: { base64: string; mime: "image/webp"; width: number; height: number };
}
export interface PrankRevealPublic {
  choice: PrankRevealChoice;
  revision: string;
  imageUrl?: string;
}
