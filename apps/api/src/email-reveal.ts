import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Scenario } from "@fp/shared";
import { ApiError, type GameService } from "./service.js";
import { prankRevealHtml } from "./prank-reveals.js";

const rickroll = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const receiptSchema = z.object({ receipt: z.string().max(128) }).strict();

/** GET renders the surprise; only a separate browser receipt records taking the bait. */
export function registerEmailReveal(app: FastifyInstance, service: GameService) {
  const localCapture = service.config.mode === "demo" && service.config.emailCapture === true;
  // Receipts are short lived and invalidated on restart. The emailed token remains stable.
  const secret = randomBytes(32);
  const signature = (token: string, expires: string) => createHmac("sha256", secret).update(`${token}:${expires}`).digest("hex");
  app.post<{ Params: { token: string } }>("/r/:token/open", async (request, reply) => {
    if (request.headers.origin !== new URL(service.config.apiOrigin).origin ||
        (request.headers["sec-fetch-site"] !== "same-origin" && !(localCapture && request.headers["sec-fetch-site"] === undefined)))
      throw new ApiError(403, "Open this link directly from your email.");
    const { receipt } = receiptSchema.parse(request.body);
    const [expires, mac] = receipt.split(".");
    if (!/^\d{13}$/.test(expires ?? "") || !/^[a-f0-9]{64}$/.test(mac ?? "") || Number(expires) < Date.now() ||
        !timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(request.params.token, expires), "hex")))
      throw new ApiError(403, "This browser receipt has expired. Reopen the email link.");
    const { scenario } = await service.challengeToken(request.params.token);
    if (scenario.channel !== "email" || !scenario.isPhishing) throw new ApiError(404, "Email challenge not found.");
    await (await service.forScenario(scenario.id)).decisionFor(scenario.recipientId, scenario.id, "trust");
    return reply.code(204).send();
  });

  return (request: FastifyRequest<{ Params: { token: string } }>, scenario: Scenario) => {
    const preview = /prefetch|prerender/i.test(`${request.headers.purpose ?? ""} ${request.headers["sec-purpose"] ?? ""}`);
    // Local WebViews and pasted links may omit Fetch Metadata. The separate,
    // visible-page POST still owns scoring; GET and HEAD never mutate it.
    const userNavigation = request.method === "GET" && !preview && (localCapture || (request.headers["sec-fetch-user"] === "?1" &&
      request.headers["sec-fetch-mode"] === "navigate" && request.headers["sec-fetch-dest"] === "document"));
    const expires = String(Date.now() + 5 * 60_000);
    const receipt = userNavigation ? `${expires}.${signature(request.params.token, expires)}` : null;
    const endpoint = `/r/${encodeURIComponent(request.params.token)}/open`;
    const reveal = scenario.prankReveal;
    const video = !reveal || reveal.choice === "rickroll";
    const media = video ? "" : reveal.choice === "photo" && reveal.photo
      ? `<img alt="Your opponent’s surprise" src="data:image/webp;base64,${reveal.photo.base64}">`
      : prankRevealHtml(scenario);
    // keepalive lets the receipt finish while YouTube opens, without delaying the surprise.
    const script = `(() => {
      function open() {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', open);
        const receipt = ${JSON.stringify(receipt)};
        if (receipt) fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt }), credentials: 'omit', keepalive: true }).then(response => {
          if (!response.ok) throw new Error('Score update failed');
        }).catch(() => {
          const status = document.getElementById('score-status');
          if (status) status.textContent = 'Score could not be updated. Reopen the email link to try again.';
        });
        ${video ? `window.location.replace(${JSON.stringify(rickroll)});` : ""}
      }
      document.addEventListener('visibilitychange', open);
      open();
    })();`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Your surprise</title><style>html,body{margin:0;min-height:100%;background:#0b1525;color:#faf7ef;font:18px system-ui}body{min-height:100vh;display:grid;place-items:center}img{display:block;max-width:100%;max-height:100vh;object-fit:contain}section{box-sizing:border-box;max-width:560px}#score-status{position:fixed;bottom:12px;padding:12px;font-size:14px;background:#122b34}#score-status:empty{display:none}</style>${video ? `<noscript><meta http-equiv="refresh" content="0;url=${rickroll}"></noscript>` : ""}</head><body>${media}<p id="score-status" role="status" aria-live="polite"></p><script>${script}</script></body></html>`;
  };
}
