# The Secret of Masonic Prosperity — Checkout

Checkout Stripe embedado (US$ 37, público internacional) com Supabase Edge
Functions no back-end e frontend estático no Cloudflare Pages.

Domínio: `thesecretofprosperity.online`

---

## ⚠️ Segurança — leia antes de qualquer push

- A chave **secreta** do Stripe (`sk_...`) **nunca** entra neste repositório.
  Ela mora só nos secrets do Supabase.
- A chave **publicável** (`pk_...`) pode ficar no `public/index.html` — ela é
  pública por design.
- O `.gitignore` já bloqueia `.env` e afins. Não force o commit deles.

---

## Estrutura

```
masonic-checkout/
├── public/                  ← isto vai pro Cloudflare Pages
│   ├── index.html           ← página de checkout
│   └── thank-you.html       ← página de retorno pós-pagamento
├── supabase/functions/      ← backup do código das Edge Functions
│   ├── create-checkout-session/
│   ├── stripe-webhook/
│   └── session-status/
├── sql/
│   └── schema.sql           ← tabelas (rodar no SQL Editor do Supabase)
├── img/                     ← banners e thumb (ver img/LEIA-ME.txt)
├── docs/
│   └── SETUP.md             ← passo a passo completo
├── .env.example             ← lista de secrets (sem valores)
└── .gitignore
```

> As funções em `supabase/functions/` são **backup versionado**. Elas já foram
> criadas pelo editor web do Supabase. Este código é a fonte da verdade caso
> precise recriar ou editar.

---

## Estado atual (o que já está feito)

- [x] Tabelas criadas no Supabase
- [x] 3 Edge Functions no ar (`create-checkout-session`, `stripe-webhook`, `session-status`)
- [x] `stripe-webhook` com Verify JWT **desligado**
- [x] Produto criado no Stripe (modo teste): `price_1TwkitHzghNseMwmXd0AD0IQ`
- [x] Domínio comprado, nameservers apontados pro Cloudflare (propagando)
- [ ] Secrets preenchidos no Supabase
- [ ] Webhook criado no Stripe (falta o `whsec_`)
- [ ] Frontend no Cloudflare Pages
- [ ] Primeira compra de teste

Próximos passos detalhados em `docs/SETUP.md`.

---

## Deploy do frontend (Cloudflare Pages)

1. Suba este repositório pro GitHub.
2. Cloudflare Pages → Create a project → conecta o repositório.
3. Configuração de build:
   - Framework preset: **None**
   - Build command: *(vazio)*
   - Build output directory: **public**
4. Deploy. Depois conecta o domínio `thesecretofprosperity.online`.

Antes de o checkout funcionar, edite o bloco `CONFIG` em `public/index.html` e
`public/thank-you.html` com sua `pk_test` e o ref do projeto Supabase.
