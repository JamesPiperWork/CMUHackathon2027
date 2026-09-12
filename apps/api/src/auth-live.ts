import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyInstance } from "fastify";
import type { Database } from "@fp/shared";
import type { Config } from "./config.js";

export interface LiveIdentity {
  sub: string;
  email?: string;
  emailVerified?: boolean;
}
interface AuthService {
  readDb(): Promise<Database>;
  now(db: Database): number;
  ensureLiveMember(identity: LiveIdentity): Promise<string>;
  createSession(
    userId: string,
    role: "player" | "operator",
  ): Promise<{ token: string; csrf: string }>;
}
const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function authConfig() {
  const domain = process.env.AUTH0_DOMAIN,
    audience = process.env.AUTH0_AUDIENCE;
  if (
    process.env.APP_MODE !== "live" ||
    !domain ||
    !/^[a-z0-9.-]+$/i.test(domain) ||
    !audience
  )
    throw new Error("Live Auth0 is not configured.");
  const issuer = `https://${domain}/`;
  let jwks = jwksByDomain.get(domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", issuer), {
      timeoutDuration: 8000,
    });
    jwksByDomain.set(domain, jwks);
  }
  return { domain, audience, issuer, jwks };
}
export async function resolveLiveIdentity(
  token: string,
): Promise<LiveIdentity> {
  const config = authConfig();
  const { payload } = await jwtVerify(token, config.jwks, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat"],
  });
  if (!payload.sub) throw new Error("Identity is missing its subject.");
  const identity: LiveIdentity = { sub: payload.sub };
  // Auth0 /userinfo is used only after validating an access token for this API.
  const response = await fetch(`${config.issuer}userinfo`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.ok) {
    const user = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
    };
    if (user.sub !== payload.sub) throw new Error("Userinfo subject mismatch.");
    if (typeof user.email === "string") {
      identity.email = user.email;
      identity.emailVerified = user.email_verified === true;
    }
  }
  return identity;
}
type LoginState = {
  state: string;
  verifier: string;
  nonce: string;
  challenge: string;
  expiresAt: number;
};
const key = (secret: string) => createHash("sha256").update(secret).digest();
export function sealLoginState(value: LoginState, secret: string) {
  if (secret.length < 32)
    throw new Error("Live sessions require a strong secret.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function openLoginState(
  cookie: string,
  secret: string,
  now = Date.now(),
): LoginState | null {
  try {
    if (secret.length < 32) return null;
    const pieces = cookie.split(".");
    if (pieces.length !== 3) return null;
    const [iv, tag, bytes] = pieces.map((s) => Buffer.from(s, "base64url"));
    const cipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    cipher.setAuthTag(tag);
    const value = JSON.parse(
      Buffer.concat([cipher.update(bytes), cipher.final()]).toString(),
    ) as LoginState;
    if (
      value.expiresAt <= now ||
      value.expiresAt > now + 600000 ||
      ![value.state, value.nonce, value.verifier, value.challenge].every(
        (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{32,128}$/.test(v),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
const cookieOptions = {
  path: "/auth",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: 600,
};
export function registerLiveAuth(
  app: FastifyInstance,
  service: AuthService,
  config: Config,
) {
  const pending = new Map<string, number>();
  app.get<{ Querystring: { challenge?: string } }>(
    "/auth/login",
    async (request, reply) => {
      if (config.mode !== "live")
        return reply
          .code(404)
          .send({ error: "Live login is disabled in demo mode." });
      const challenge = request.query.challenge;
      if (!challenge || !/^[a-zA-Z0-9_-]{32,128}$/.test(challenge))
        return reply
          .code(400)
          .send({ error: "A valid challenge is required." });
      const db = await service.readDb(),
        now = service.now(db),
        hash = createHash("sha256").update(challenge).digest("hex");
      if (
        ![
          { match: db.match, scenarios: db.scenarios },
          ...(db.matchPools ?? []),
        ].some(
          (pool) =>
            pool.match.state === "active" &&
            pool.scenarios.some(
              (s) =>
                s.tokenHash === hash &&
                s.tokenExpiresAt > now &&
                s.releasedAt !== null &&
                s.deliveryStatus !== "cancelled",
            ),
        )
      )
        return reply
          .code(410)
          .send({ error: "Challenge expired or unavailable." });
      const auth = authConfig(),
        clientId = process.env.AUTH0_CLIENT_ID,
        secret = process.env.SESSION_SECRET ?? "";
      if (!clientId || !process.env.AUTH0_CLIENT_SECRET || secret.length < 32)
        return reply
          .code(503)
          .send({ error: "Server-browser Auth0 login is not configured." });
      for (const [state, expires] of pending)
        if (expires <= Date.now()) pending.delete(state);
      if (pending.size >= 1000)
        return reply.code(429).send({ error: "Try signing in again shortly." });
      const transaction: LoginState = {
        state: randomBytes(32).toString("base64url"),
        verifier: randomBytes(32).toString("base64url"),
        nonce: randomBytes(32).toString("base64url"),
        challenge,
        expiresAt: Date.now() + 600000,
      };
      pending.set(transaction.state, transaction.expiresAt);
      const url = new URL("authorize", auth.issuer);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: `${config.apiOrigin}/auth/callback`,
        scope: "openid profile email",
        audience: auth.audience,
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: createHash("sha256")
          .update(transaction.verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      return reply
        .header("Cache-Control", "no-store")
        .setCookie(
          "fp_oauth",
          sealLoginState(transaction, secret),
          cookieOptions,
        )
        .redirect(url.toString());
    },
  );
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/callback",
    async (request, reply) => {
      if (config.mode !== "live")
        return reply.code(404).send({ error: "Live login is disabled." });
      reply
        .clearCookie("fp_oauth", cookieOptions)
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer");
      const transaction = openLoginState(
        request.cookies.fp_oauth ?? "",
        process.env.SESSION_SECRET ?? "",
      );
      if (
        !transaction ||
        !request.query.state ||
        !equal(transaction.state, request.query.state) ||
        !pending.has(transaction.state)
      )
        return reply.code(403).send({
          error: "Login state expired or did not match this browser.",
        });
      pending.delete(transaction.state);
      if (!request.query.code || request.query.error)
        return reply.code(400).send({
          error:
            "Login was cancelled or rejected. Open your challenge again to retry.",
        });
      try {
        const auth = authConfig();
        const response = await fetch(`${auth.issuer}oauth/token`, {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: process.env.AUTH0_CLIENT_ID,
            client_secret: process.env.AUTH0_CLIENT_SECRET,
            code: request.query.code,
            code_verifier: transaction.verifier,
            redirect_uri: `${config.apiOrigin}/auth/callback`,
          }),
        });
        if (!response.ok) throw new Error("Code exchange rejected.");
        const tokens = (await response.json()) as {
          access_token?: string;
          id_token?: string;
        };
        if (!tokens.access_token || !tokens.id_token)
          throw new Error("Missing tokens.");
        const id = await jwtVerify(tokens.id_token, auth.jwks, {
          issuer: auth.issuer,
          audience: process.env.AUTH0_CLIENT_ID,
          algorithms: ["RS256"],
          requiredClaims: ["sub", "exp", "iat", "nonce"],
        });
        if (id.payload.nonce !== transaction.nonce)
          throw new Error("Identity nonce mismatch.");
        const identity = await resolveLiveIdentity(tokens.access_token);
        if (identity.sub !== id.payload.sub)
          throw new Error("Subject mismatch.");
        const userId = await service.ensureLiveMember(identity),
          session = await service.createSession(userId, "player");
        return reply
          .setCookie("fp_session", session.token, {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 12 * 60 * 60,
          })
          .redirect(`/r/${transaction.challenge}`);
      } catch {
        return reply.code(403).send({
          error:
            "Sign-in failed or this identity is not an enrolled league member. Open your challenge again to retry.",
        });
      }
    },
  );
}
