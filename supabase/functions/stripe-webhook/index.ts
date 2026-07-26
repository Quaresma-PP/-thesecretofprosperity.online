import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fulfill(match: { column: string; value: string }, email: string | null,
                       name: string | null, amountTotal: number | null,
                       paymentIntentId: string | null) {
  if (!email) { console.error('fulfill_no_email', match.value); return; }

  const { data: order } = await supabase.from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      email, customer_name: name, amount_total: amountTotal,
      stripe_payment_intent: paymentIntentId,
    })
    .eq(match.column, match.value)
    .select('id, click_id, offer')
    .maybeSingle();

  if (order?.id) {
    const { data: existing } = await supabase.from('access_tokens')
      .select('id').eq('order_id', order.id).maybeSingle();
    if (existing) { console.log('already_fulfilled', match.value); return; }
  }

  const token = newToken();
  await supabase.from('access_tokens').insert({
    token_hash: await sha256(token),
    order_id: order?.id ?? null,
    email, expires_at: null,
  });
  console.log('fulfilled', match.value, 'token_generated');
}

async function revoke(paymentIntentId: string, newStatus: 'refunded' | 'disputed') {
  const { data: order } = await supabase.from('orders')
    .update({ status: newStatus })
    .eq('stripe_payment_intent', paymentIntentId)
    .select('id').maybeSingle();
  if (order?.id) {
    await supabase.from('access_tokens').update({ revoked: true }).eq('order_id', order.id);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody, signature, WEBHOOK_SECRET, undefined, cryptoProvider,
    );
  } catch (err) {
    console.error('signature_failed', err instanceof Error ? err.message : err);
    return new Response('invalid signature', { status: 400 });
  }

  const { error: dupErr } = await supabase.from('webhook_events')
    .insert({ event_id: event.id, type: event.type });
  if (dupErr && (dupErr as { code?: string }).code === '23505') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status === 'paid') {
          await fulfill(
            { column: 'stripe_session_id', value: s.id },
            s.customer_details?.email ?? s.customer_email ?? null,
            s.customer_details?.name ?? null,
            s.amount_total,
            typeof s.payment_intent === 'string' ? s.payment_intent : null,
          );
        } else {
          await supabase.from('orders')
            .update({ status: 'awaiting_payment', email: s.customer_details?.email ?? null })
            .eq('stripe_session_id', s.id);
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object as Stripe.Checkout.Session;
        await fulfill(
          { column: 'stripe_session_id', value: s.id },
          s.customer_details?.email ?? s.customer_email ?? null,
          s.customer_details?.name ?? null,
          s.amount_total,
          typeof s.payment_intent === 'string' ? s.payment_intent : null,
        );
        break;
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const s = event.data.object as Stripe.Checkout.Session;
        await supabase.from('orders').update({ status: 'failed' }).eq('stripe_session_id', s.id);
        break;
      }
      case 'charge.refunded': {
        const c = event.data.object as Stripe.Charge;
        if (typeof c.payment_intent === 'string') await revoke(c.payment_intent, 'refunded');
        break;
      }
      case 'charge.dispute.created': {
        const d = event.data.object as Stripe.Dispute;
        if (typeof d.payment_intent === 'string') await revoke(d.payment_intent, 'disputed');
        break;
      }
      default: break;
    }
  } catch (err) {
    console.error('handler_error', event.type, err instanceof Error ? err.message : err);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
