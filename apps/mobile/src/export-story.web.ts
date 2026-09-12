import { SCENE_MS, type StoryScene } from "./story";
import { C } from "./ui";
export const canExportStory = () => typeof document !== "undefined" && typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9");

/** Render the same saved match moments into a real portrait WebM video. */
export async function exportStory(scenes: StoryScene[], name: string, progress: (value: number) => void, signal: AbortSignal): Promise<void> {
  if (!canExportStory()) throw new Error("This browser cannot export WebM. Use a recent Chrome or Edge browser.");
  const canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 2600000 });
  const chunks: Blob[] = [];
  let animation = 0;
  let aborted = false;
  const clean = () => { cancelAnimationFrame(animation); stream.getTracks().forEach(track => track.stop()); signal.removeEventListener("abort", abort); };
  const abort = () => { aborted = true; if (recorder.state !== "inactive") recorder.stop(); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) { clean(); throw new Error("Export cancelled."); }
  const wrap = (text: string, x: number, y: number, width: number, line: number, max = 20) => {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let buffer = "";
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(`${buffer} ${word}`).width > width && buffer) {
          lines.push(buffer); buffer = "";
        }
        buffer += (buffer ? " " : "") + word;
      }
      lines.push(buffer);
    }
    if (lines.length > max) {
      let last = lines[max - 1];
      while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
      lines[max - 1] = `${last.trim()}…`;
    }
    for (const value of lines.slice(0, max)) { ctx.fillText(value, x, y); y += line; }
    return y;
  };
  const draw = (scene: StoryScene, elapsed: number, index: number) => {
    ctx.fillStyle = C.panelDeep; ctx.fillRect(0, 0, 720, 1280);
    const gradient = ctx.createRadialGradient(640, 250, 0, 640, 250, 680);
    gradient.addColorStop(0, `${scene.accent}26`); gradient.addColorStop(1, `${C.panelDeep}00`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = C.muted; ctx.font = "700 17px system-ui"; ctx.fillText("Fantasy Phishing", 52, 75);
    scenes.forEach((_, i) => { ctx.fillStyle = i < index ? scene.accent : C.border; ctx.fillRect(52 + i * (616 / scenes.length), 103, 616 / scenes.length - 7, 5); });
    ctx.fillStyle = scene.accent; ctx.fillRect(52 + index * (616 / scenes.length), 103, (616 / scenes.length - 7) * elapsed, 5);
    ctx.save(); ctx.translate(0, (1 - Math.min(elapsed * 10, 1)) * 18);
    ctx.fillStyle = scene.accent; ctx.font = "800 18px system-ui"; ctx.fillText(scene.kicker, 52, 187);
    ctx.fillStyle = C.text; ctx.font = "800 57px system-ui"; wrap(scene.title, 50, 277, 620, 66, 4);
    ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(40, 464, 640, 460, 24); ctx.fill();
    const sender = (scene.kind === "defense" || scene.kind === "avoidance") ? scene.target || scene.actor : scene.actor;
    const recipient = (scene.kind === "defense" || scene.kind === "avoidance") ? scene.actor : scene.target;
    ctx.fillStyle = scene.accent; ctx.font = "700 19px system-ui"; wrap(`${sender}${recipient ? ` → ${recipient}` : ""}`, 70, 509, 580, 26, 2);
    ctx.fillStyle = C.text; ctx.font = scene.kind === "intro" || scene.kind === "outro" ? "800 37px system-ui" : "500 28px system-ui";
    wrap(scene.text, 70, 594, 575, 40, 7);
    ctx.fillStyle = C.muted; ctx.font = "500 24px system-ui"; wrap(scene.detail, 52, 1002, 610, 35, 4);
    ctx.restore();
    ctx.fillStyle = C.muted; ctx.font = "700 15px system-ui"; ctx.fillText(`Weekly Wrapped                                      ${String(index + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}`, 52, 1224);
  };
  return new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { clean(); reject(new Error("Video recording failed. Please try again.")); };
    recorder.onstop = () => {
      clean();
      if (aborted) { reject(new Error("Export cancelled.")); return; }
      const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${name.replace(/[^a-z0-9-]/gi, "-")}.webm`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000); progress(1); resolve();
    };
    draw(scenes[0], 0, 0); recorder.start(1000);
    const start = performance.now();
    const frame = (now: number) => {
      if (signal.aborted || recorder.state === "inactive") return;
      const time = now - start; const index = Math.min(scenes.length - 1, Math.floor(time / SCENE_MS));
      draw(scenes[index], (time % SCENE_MS) / SCENE_MS, index); progress(Math.min(1, time / (SCENE_MS * scenes.length)));
      if (time >= SCENE_MS * scenes.length) recorder.stop();
      else animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
  });
}
