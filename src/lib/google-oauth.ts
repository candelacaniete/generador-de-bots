import { google } from "googleapis";
import { env } from "@/lib/env";
import { normalizeAppUrl } from "@/lib/app-url";

export function getGoogleOAuthClient(redirectUri?: string) {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const appUrl = normalizeAppUrl(env("NEXT_PUBLIC_APP_URL"));

  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el entorno"
    );
  }

  const redirect =
    redirectUri ??
    `${appUrl ?? "http://localhost:3000"}/api/google/oauth/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function getGoogleAuthUrl(businessId: string): string {
  const client = getGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: businessId,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function calendarClientFromRefreshToken(refreshToken: string) {
  const client = getGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: client });
}

export async function getGoogleAccountEmail(refreshToken: string): Promise<string | null> {
  const client = getGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data.email ?? null;
}
