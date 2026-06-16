import crypto from "node:crypto";

// Explicit HMAC verification for Shopify webhooks.
//
// The @shopify/shopify-app-react-router package already verifies the HMAC
// inside `authenticate.webhook()`, but we run this check first as a visible,
// defense-in-depth guarantee that no unsigned (or wrongly signed) request can
// ever reach our handlers. This is also the check that App Store reviewers
// look for when auditing webhook security.
//
// We must consume the raw request body to compute the HMAC. To keep the body
// available for the downstream `authenticate.webhook()` call, we return a new
// Request whose body is the already-read raw text.
export type VerifyResult =
  | { ok: true; request: Request }
  | { ok: false; reason: string };

export async function verifyWebhookHmacAndRebuild(
  request: Request,
  apiSecret: string,
): Promise<VerifyResult> {
  if (!apiSecret) {
    return { ok: false, reason: "Missing SHOPIFY_API_SECRET" };
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!hmacHeader) {
    return { ok: false, reason: "Missing X-Shopify-Hmac-Sha256 header" };
  }

  const rawBody = await request.text();

  const expected = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const received = Buffer.from(hmacHeader, "utf8");
  const computed = Buffer.from(expected, "utf8");

  if (
    received.length !== computed.length ||
    !crypto.timingSafeEqual(received, computed)
  ) {
    return { ok: false, reason: "Invalid HMAC signature" };
  }

  const rebuilt = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: rawBody,
  });

  return { ok: true, request: rebuilt };
}
