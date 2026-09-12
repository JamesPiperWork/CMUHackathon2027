import type Auth0 from "react-native-auth0";
let client: Auth0 | undefined;
export function authCapability() {
  const configured = Boolean(
    process.env.EXPO_PUBLIC_AUTH0_DOMAIN &&
    process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID &&
    process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
  );
  return {
    configured,
    reason: configured
      ? "Auth0 requires an Expo development build."
      : "Operator must configure the native Auth0 application, domain, client ID, and API audience.",
  };
}
async function getClient() {
  if (!authCapability().configured) throw new Error(authCapability().reason);
  if (!client) {
    const { default: NativeAuth0 } = await import("react-native-auth0");
    client = new NativeAuth0({
      domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN!,
      clientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID!,
    });
  }
  return client;
}
export async function loginLive(): Promise<{ accessToken: string }> {
  const auth = await getClient();
  const credentials = await auth.webAuth.authorize(
    {
      scope: "openid profile email",
      audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
    },
    { customScheme: "fantasyphishing" },
  );
  await auth.credentialsManager.saveCredentials(credentials);
  return { accessToken: credentials.accessToken };
}
export async function logoutLive(): Promise<void> {
  if (client) {
    await client.webAuth.clearSession({}, { customScheme: "fantasyphishing" });
    await client.credentialsManager.clearCredentials();
  }
}
