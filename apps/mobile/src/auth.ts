/** Metro selects .web/.native; this fallback keeps the shared contract explicit. */
export interface LiveCredentials {
  accessToken: string;
}
export async function loginLive(): Promise<LiveCredentials> {
  throw new Error(
    "Live sign-in requires a supported browser or native development build.",
  );
}
export async function logoutLive(): Promise<void> {}
export function authCapability() {
  return {
    configured: false,
    reason: "Select a web or native platform for Auth0.",
  };
}
