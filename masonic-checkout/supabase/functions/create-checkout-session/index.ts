import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

type Offer = {
  price: string;
  ui_mode?: 'embedded' | 'hosted';
  locale?: string;
  return_url?: string;
  success_url?: string;
  cancel_url?: string;
  descriptor?: string;
};
const OFFERS: Record<string, Offer> = (() => {
  try { return JSON.parse(Deno.env.get('OFFERS_JSON') ?? '{}'); }
  catch { return {}; }
})();

const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  const ok = !!origin && ALLOWED.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : (ALLOWED[0] ?? '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function clean(v: unknown, max = 200): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  return s.length ? s : undefined;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  try {
    const body = await req.json().catch(() => ({}));

    const offerKey = clean(body.offer, 40) ?? '';
    const offer = OFFERS[offerKey];
    if (!offer?.price) return json({ error: 'offer_not_found' }, 400, origin);

    const embedded = (offer.ui_mode ?? 'embedded') === 'embedded';

    const rawEmail = clean(body.email, 254)?.toLowerCase();
    const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : undefined;

    const utm = {
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      utm_content: clean(body.utm_content),
      utm_term: clean(body.utm_term),
      fbclid: clean(body.fbclid),
    };
    const clickId = clean(body.click_id, 120);

    const metadata: Record<string, string> = { offer: offerKey };
    for (const [k, v] of Object.entries(utm)) if (v) metadata[k] = v;
    if (clickId) metadata.click_id = clickId;

    const params: any = {
      mode: 'payment',
      line_items: [{ price: offer.price, quantity: 1 }],
      locale: offer.locale ?? 'auto',
      customer_email: email,
      customer_creation: 'always',
      metadata,
      payment_intent_data: { metadata },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    };
    if (offer.descriptor) {
      params.payment_intent_data.statement_descriptor_suffix = offer.descriptor;
    }
    if (embedded) {
      params.ui_mode = 'embedded';
      params.return_url = `${offer.return_url}?session_id={CHECKOUT_SESSION_ID}`;
    } else {
      params.success_url = `${offer.success_url}?session_id={CHECKOUT_SESSION_ID}`;
      params.cancel_url = offer.cancel_url;
    }

    const session = await stripe.checkout.sessions.create(params);

    const { error } = await supabase.from('orders').insert({
      stripe_session_id: session.id,
      offer: offerKey,
      email: email ?? null,
      amount_total: session.amount_total,
      currency: session.currency ?? 'usd',
      status: 'pending',
      locale: offer.locale ?? null,
      utm,
      click_id: clickId ?? null,
    });
    if (error) console.error('order_insert_failed', error.message);

    return json(
      embedded ? { clientSecret: session.client_secret } : { url: session.url, id: session.id },
      200, origin,
    );
  } catch (err) {
    console.error('create_session_error', err instanceof Error ? err.message : err);
    return json({ error: 'checkout_unavailable' }, 500, origin);
  }
});
