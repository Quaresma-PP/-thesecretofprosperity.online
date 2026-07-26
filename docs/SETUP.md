# Setup — passo a passo

## 1. Banco (feito ✅)
`sql/schema.sql` já foi rodado no SQL Editor do Supabase.

## 2. Funções (feito ✅)
As três funções já estão no ar. Verify JWT desligado só na `stripe-webhook`.

## 3. Secrets no Supabase (pendente)
Supabase → Edge Functions → Secrets. Adicione:

| Nome | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | sua `sk_test_...` |
| `OFFERS_JSON` | ver abaixo |
| `ALLOWED_ORIGINS` | `https://thesecretofprosperity.online,https://www.thesecretofprosperity.online` |
| `STRIPE_WEBHOOK_SECRET` | (depois do passo 4) |

`OFFERS_JSON` (modo teste):
```json
{"masonic_prosperity":{"price":"price_1TwkitHzghNseMwmXd0AD0IQ","ui_mode":"embedded","locale":"en","return_url":"https://thesecretofprosperity.online/thank-you","descriptor":"MASONIC"}}
```

## 4. Webhook no Stripe (pendente)
Stripe → Developers → Webhooks → Add endpoint.

Endpoint:
```
https://SEU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Eventos:
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- checkout.session.expired
- charge.refunded
- charge.dispute.created

Copie o `whsec_...` e salve como secret `STRIPE_WEBHOOK_SECRET`.

## 5. Frontend (pendente)
Edite `public/index.html`:
- `publishableKey` → sua `pk_test_...`
- `sessionUrl` → troque `SEU_PROJECT_REF`

Edite `public/thank-you.html`:
- `statusUrl` → troque `SEU_PROJECT_REF`

Suba no Cloudflare Pages (output dir = `public`).

## 6. Teste
Cartão `4242 4242 4242 4242`, validade futura, CVC qualquer.

Confira:
- [ ] Checkout carrega em inglês
- [ ] Pagamento aprovado → cai em /thank-you
- [ ] Venda aparece na tabela `orders` como `paid`
- [ ] Token gerado em `access_tokens`

## 7. Produção (depois)
- Recriar produto em **live mode**, trocar `price_` no `OFFERS_JSON`
- Trocar `pk_test`/`sk_test` por `pk_live`/`sk_live`
- Recriar o webhook em live mode (novo `whsec_`)
- Ajustar o prefixo do descritor no Dashboard (hoje é `SOLIDARITY`)
