import Stripe from 'npm:stripe@18';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  try {
    const { session_id } = await req.json().catch(() => ({}));
    if (typeof session_id !== 'string' || !session_id.startsWith('cs_')) {
      return json({ error: 'invalid_session' }, 400, origin);
    }

    const s = await stripe.checkout.sessions.retrieve(session_id);

    return json({
      status: s.status,
      payment_status: s.payment_status,
      email: s.customer_details?.email ?? null,
    }, 200, origin);
  } catch (err) {
    console.error('session_status_error', err instanceof Error ? err.message : err);
    return json({ error: 'unavailable' }, 500, origin);
  }
});
