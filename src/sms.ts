// SMS transport. Uses Twilio when configured, otherwise logs to the console so
// the whole flow can be exercised locally with curl.
import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;

export const smsEnabled = Boolean(sid && token && from);
const client = smsEnabled ? twilio(sid, token) : null;

// In dev mode every text is also kept here, so tests and evals can check who got what.
export const outbox: { to: string; body: string; at: number }[] = [];

export async function sendSms(to: string, body: string) {
  // Keep replies text-sized; carriers split long bodies into segments anyway.
  const text = body.length > 1500 ? body.slice(0, 1497) + "..." : body;
  if (!client) {
    outbox.push({ to, body: text, at: Date.now() });
    if (outbox.length > 500) outbox.shift();
    if (process.env.QUIET_SMS !== "true") console.log(`\n[sms → ${to}]\n${text}\n`);
    return;
  }
  await client.messages.create({ to, from: from!, body: text });
}

export function verifyTwilio(signature: string | undefined, url: string, params: Record<string, string>) {
  if (!smsEnabled) return true; // dev mode: no signature to check
  return Boolean(signature) && twilio.validateRequest(token!, signature!, url, params);
}

// Accepts "(415) 555-0100", "415.555.0100", "+44 20 7946 0958" ... returns E.164 or null.
export function normalizePhone(raw: string, defaultCountry = process.env.DEFAULT_COUNTRY_CODE ?? "1"): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountry)) return "+" + digits;
  return null;
}
