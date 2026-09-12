import { Auth0Client } from "@auth0/auth0-spa-js";
let client: Auth0Client | undefined;
export function authCapability() {
  const configured = Boolean(
    process.env.EXPO_PUBLIC_AUTH0_DOMAIN &&
    (process.env.EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID) &&
    process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
  );
  return {
    configured,
    reason: configured
      ? "Auth0 browser sign-in configured."
      : "Operator must configure the Auth0 SPA application, domain, client ID, and API audience.",
  };
}
function getClient() {
  if (!authCapability().configured) throw new Error(authCapability().reason);
  return (client ??= new Auth0Client({
    domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN!,
    clientId: (process.env.EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID)!,
    authorizationParams: {
      audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
      scope: "openid profile email",
      redirect_uri: window.location.origin,
    },
    cacheLocation: "memory",
  }));
}
export async function loginLive(): Promise<{ accessToken: string }> {
  const auth = getClient();
  await auth.loginWithPopup();
  return { accessToken: await auth.getTokenSilently() };
}
export async function logoutLive(): Promise<void> {
  if (client)
    await client.logout({ logoutParams: { returnTo: window.location.origin } });
}
