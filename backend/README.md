# Backend — API multi-barbearia

Node 20+ · Express 5 · TypeScript · Prisma · PostgreSQL 15 · Zod · JWT

## Rodando local

```bash
cp backend/.env.example backend/.env      # e troque o JWT_SECRET
docker compose up -d postgres             # Postgres na porta 5433
npm install
npm run db:migrate --workspace=backend    # aplica migrations
npm run db:seed --workspace=backend       # tenant "vikings", login admin@vikinges.com / admin123
npm run dev                               # API :3333 + front :5173
npm test                                  # testes (usam o banco do .env)
```

## Regras de arquitetura

- **Multi-tenant**: toda tabela de negócio tem `tenant_id`. Rotas autenticadas pegam o tenant do **token**; rotas públicas, do **slug** na URL. Nunca do body.
- **Double booking** é impedido pelo banco (`EXCLUDE USING gist` em `bookings`), não só pela aplicação.
- **Horários**: o banco guarda UTC (`timestamptz`); grade e slots são calculados no fuso do tenant (`src/utils/time.ts`). Não depende do `TZ` do servidor.
- **Dinheiro** em centavos (`priceCents`). O agendamento guarda preço e duração do momento da reserva.
- **Sessão**: access token JWT (15 min) + refresh token opaco em cookie `httpOnly`, rotativo, com detecção de reuso.
- **API stateless**: com `REDIS_URL` o rate limit é compartilhado entre instâncias.

## Rotas (`/api/v1`)

| Grupo | Acesso | Rotas |
|-------|--------|-------|
| `/auth` | público | `POST /login`, `POST /refresh` (cookie), `POST /logout`, `GET /me` (auth) |
| `/public/:slug` | público | `GET /`, `GET /services`, `GET /barbers?serviceId`, `GET /barbers/:id/slots?date&serviceId`, `GET /products`, `POST /bookings`, `POST /bookings/manage` e `/bookings/manage/cancel` (token no corpo), `POST /waitlist` |
| `/services` | equipe; escrita dono/gerente | `GET /`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id` |
| `/barbers` | equipe; escrita dono/gerente ou o próprio (perfil) | `GET /`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id` |
| `/availability/:barberId` | equipe; escrita dono/gerente ou o próprio | `GET`, `PUT`, `GET/POST /exceptions`, `DELETE /exceptions/:id` |
| `/bookings` | equipe (barbeiro: só os seus) | `GET /?date&barberId&status`, `POST /` (painel ou encaixe com `walkIn`), `GET /:id`, `PATCH /:id/status`, `PATCH /:id/reschedule` |
| `/clients` | equipe (barbeiro: só quem atendeu); escrita recepção+ | `GET /?search&recurring`, `GET /:id`, `PUT /:id`, `POST /:id/anonymize` (dono/gerente, LGPD) |
| `/settings` | recepção+ lê; dono/gerente altera | `GET`, `PUT` |
| `/dashboard` | equipe (barbeiro: só os seus números) | `GET` |
| `/orders` | equipe (barbeiro: só os próprios atendimentos); estorno dono/gerente | `POST` (fechar comanda), `GET ?registerId`, `POST /:id/void` |
| `/register` | recepção+ | `GET` (caixa aberto), `POST /open`, `POST /movements`, `POST /close`, `GET /history` (dono/gerente) |
| `/reports` | dono/gerente | `GET ?from&to` |
| `/commissions` | equipe (barbeiro: só a própria); pagar dono/gerente | `GET ?from&to`, `POST /pay` |
| `/products` | recepção+; cadastro dono/gerente | `GET /`, `GET /low-stock`, `GET /:id`, `POST`, `PUT`, `DELETE`, `POST/GET /:id/stock` |
| `/notifications` | dono/gerente | `GET ?status`, `POST /:id/retry` (o envio é feito pelo worker) |
| `/webhooks/whatsapp` | público, assinado pela Meta | `GET` (verificação), `POST` (status e respostas 1/2/SAIR) |

Toda a superfície pública está em `src/modules/public.routes.ts` — revise esse arquivo ao expor algo novo.

Erros seguem `{ success: false, message, code }`, com `code` estável (`SLOT_TAKEN`, `SLOT_UNAVAILABLE`, `TOKEN_REUSED`, `FORBIDDEN`…).
