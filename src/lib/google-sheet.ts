import crypto from "node:crypto";

const SPREADSHEET_ID = "1AWMJSw6BHI34nfab50LN3sepnv5sHvu5h-V_rRHJJJA";
const SHEET_TITLE = "Aadoro - Frido Stock Report";

const RANGES = ["Purchase!A:I", "Sales!A:I", "'Ready Available in WH'!A:G"] as const;

type Token = { value: string; expiresAt: number };

let tokenCache: Token | null = null;

function serviceAccount(): { clientEmail: string; privateKey: string } {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey) {
    throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.local.");
  }
  return { clientEmail, privateKey };
}

function signJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const key = serviceAccount();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(key.clientEmail, key.privateKey),
    }),
  });
  const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Google rejected the service account.");
  }
  tokenCache = { value: body.access_token, expiresAt: Date.now() + 50 * 60_000 };
  return body.access_token;
}

export async function readStockSheets(): Promise<{ title: string; sheets: Record<string, unknown[][]> }> {
  const token = await accessToken();
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  for (const range of RANGES) params.append("ranges", range);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const body = (await response.json()) as {
    error?: { message?: string };
    valueRanges?: { range?: string; values?: unknown[][] }[];
  };
  if (!response.ok) {
    throw new Error(body.error?.message || "Could not read the Google Sheet.");
  }

  const sheets: Record<string, unknown[][]> = {};
  for (const range of body.valueRanges ?? []) {
    const name = range.range?.split("!")[0]?.replace(/^'|'$/g, "") ?? "";
    sheets[name] = range.values ?? [];
  }
  return { title: SHEET_TITLE, sheets };
}
