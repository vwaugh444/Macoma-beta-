import Stripe from "stripe";

// One Stripe client for billing (Macoma's own revenue) and Connect (owners' invoices).
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const stripeEnabled = Boolean(stripe);
export type { Stripe };
