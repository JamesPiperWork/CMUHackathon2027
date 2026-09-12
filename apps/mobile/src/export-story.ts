import type { StoryScene } from "./story";
export const canExportStory = () => false;
export async function exportStory(_scenes: StoryScene[], _name: string, _progress: (value: number) => void, _signal: AbortSignal): Promise<void> {
  throw new Error("Video export is available in a supported desktop browser.");
}
