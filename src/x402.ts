// x402: HTTP 402 payments in both directions.
//   - Outbound: the agent can pay for x402-gated APIs with its own USDC wallet.
//   - Inbound: other agents pay per call to talk to this agent over A2A.
import type { RequestHandler } from "express";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme as ExactEvmClient } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmServer } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { privateKeyToAccount } from "viem/accounts";
import { guardedFetch } from "./netguard.js";

// Base Sepolia by default so the demo runs on testnet USDC.
export const NETWORK = (process.env.X402_NETWORK ?? "eip155:84532") as `${string}:${string}`;
const FACILITATOR = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const key = process.env.AGENT_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
const account = key ? privateKeyToAccount(key) : null;
export const walletAddress = account?.address ?? null;

const payingFetch = account
  ? wrapFetchWithPaymentFromConfig(guardedFetch, {
      schemes: [{ network: NETWORK, client: new ExactEvmClient(account) }],
    })
  : null;

export type PaidResponse = { status: number; body: string; paid: unknown };

export async function payAndFetch(url: string, init?: RequestInit): Promise<PaidResponse> {
  if (!payingFetch) throw new Error("No agent wallet configured (set AGENT_WALLET_PRIVATE_KEY).");
  const res = await payingFetch(url, init);
  const receipt = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  return {
    status: res.status,
    body: (await res.text()).slice(0, 8000),
    paid: receipt ? decodePaymentResponseHeader(receipt) : null,
  };
}

// Reads the price an x402 endpoint asks for, without paying, so the agent can
// check it against the user's budget first.
export async function quote(url: string, init?: RequestInit): Promise<{ free: boolean; usd: number | null; raw: unknown }> {
  const res = await guardedFetch(url, init);
  if (res.status !== 402) return { free: true, usd: 0, raw: null };
  const header = res.headers.get("PAYMENT-REQUIRED");
  let raw: any = null;
  try {
    raw = header ? JSON.parse(Buffer.from(header, "base64").toString("utf8")) : await res.json();
  } catch {
    return { free: false, usd: null, raw: null };
  }
  // USDC has 6 decimals; "amount" (v2) / "maxAmountRequired" (v1) are atomic units.
  const option = raw?.accepts?.[0];
  const atomic = Number(option?.amount ?? option?.maxAmountRequired);
  return { free: false, usd: Number.isFinite(atomic) ? atomic / 1e6 : null, raw };
}

// Charge other agents for A2A calls. Disabled when X402_PAY_TO is unset.
export function a2aPaywall(): RequestHandler | null {
  const payTo = process.env.X402_PAY_TO;
  if (!payTo) return null;
  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(
    NETWORK,
    new ExactEvmServer(),
  );
  return paymentMiddleware(
    {
      "POST /a2a": {
        accepts: [{ scheme: "exact", price: process.env.A2A_PRICE ?? "$0.01", network: NETWORK, payTo }],
        description: "One task for the Macoma agent over A2A",
        mimeType: "application/json",
      },
    },
    server,
  );
}
