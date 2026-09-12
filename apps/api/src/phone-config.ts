type Env = NodeJS.ProcessEnv;
export const phoneDemoMode = (env: Env = process.env) => env.APP_MODE === "demo" && env.EMAIL_DELIVERY_MODE === "smtp-demo" && env.PHONE_DELIVERY_MODE === "twilio-demo";
export function publicHttpsOrigin(value?: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.hostname.endsWith(".localhost");
  } catch { return false; }
}
export function phoneVerificationConfiguration(env: Env = process.env) {
  const checks = [
    { code: "phone_mode", ok: phoneDemoMode(env), detail: "Set PHONE_DELIVERY_MODE=twilio-demo within the verified-email smtp-demo." },
    { code: "send_enabled", ok: env.PHONE_DEMO_SEND_ENABLED === "true", detail: "Explicitly enable phone sending with PHONE_DEMO_SEND_ENABLED=true." },
    { code: "verify_enabled", ok: env.PHONE_DEMO_VERIFY_ENABLED === "true", detail: "Enable requested verification texts with PHONE_DEMO_VERIFY_ENABLED=true." },
    { code: "twilio_credentials", ok: /^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? "") && Boolean(env.TWILIO_AUTH_TOKEN?.trim()), detail: "Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on the server." },
    { code: "verify_service", ok: /^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID ?? ""), detail: "Create a Twilio Verify service and set TWILIO_VERIFY_SERVICE_SID." },
    { code: "session_secret", ok: (env.SESSION_SECRET?.length ?? 0) >= 32, detail: "Configure a strong SESSION_SECRET for verification abuse limits." },
  ];
  return { ready: checks.every(check => check.ok), checks };
}
