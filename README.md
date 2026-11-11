# 💈 Barbershop — plataforma para barbearias

Sistema web (SaaS) para barbearias: **agendamento online 24h** para o cliente e **painel de gestão** para a equipe (agenda, serviços, equipe, clientes e estoque). Foi feito para atender **várias barbearias** na mesma instalação (multi-tenant). A **Barbearia Vikings** é a primeira cliente (piloto).

> Escopo completo e requisitos: [docs/escopo-e-requisitos.md](docs/escopo-e-requisitos.md)

---

## Status

| Fase | Conteúdo | Situação |
|------|----------|----------|
| **0 — Fundação** | Multi-tenant, proteção contra double booking, fuso horário, autenticação real, permissões, testes e CI | ✅ Concluída |
| **1 — MVP vendável** | Telas de gestão: agenda (filtros, status, encaixe), serviços, equipe, disponibilidade, clientes, produtos, configurações da barbearia; cancelamento pelo cliente via link; LGPD básica | ✅ Concluída (falta só o CAPTCHA, que precisa de conta no Cloudflare) |
| **2 — Gestão** | Comanda, caixa, comissões, relatórios | ⏳ Próxima |
| **3 — Automação** | WhatsApp (confirmação, lembrete, cancelamento), lista de espera, política de no-show | ⏳ |
| **4 — Plataforma** | Cadastro self-service de barbearias, planos e cobrança, multiunidade, fidelidade, PWA | ⏳ |

### Já funciona

**Para o cliente (site público)**
- Site da barbearia com serviços, equipe, vitrine de produtos, FAQ e contato.
- Agendamento em 4 etapas sem cadastro. Os horários levam em conta a duração do serviço, a grade do barbeiro, folgas e a antecedência mínima e máxima.
- Aceite da política de privacidade (LGPD), com e-mail e observações opcionais.
- Link pessoal (`/agendamento#…`) para ver e cancelar o próprio horário, até o prazo definido pela barbearia.

**Para a equipe (painel `/admin`)**

| Tela | O que faz | Quem vê |
|------|-----------|---------|
| Dashboard | Atendimentos e faturamento do dia, concluídos e faltas do mês, próximos horários, alertas | Todos (barbeiro: só os próprios números) |
| Agenda | Navegar por data, filtrar, confirmar, concluir, marcar falta, cancelar, remarcar, agendar pelo painel e encaixe; atualiza sozinha a cada 30s | Todos (barbeiro: só a própria agenda) |
| Clientes | Busca, recorrentes, histórico, preferências, exclusão de dados (LGPD) | Todos (barbeiro: só quem atendeu) |
| Horários | Grade semanal e folgas/bloqueios/horário especial por profissional | Todos (barbeiro: só o próprio) |
| Equipe | Cadastrar membros, papéis e serviços que cada um atende | Dono e gerente |
| Serviços | Criar, editar preço/duração, desativar | Dono e gerente |
| Produtos | Cadastro, estoque baixo, entrada/saída/ajuste com histórico | Dono, gerente e recepção |
| Configurações | Regras de agendamento, cancelamento, recorrência, fuso | Dono e gerente editam; recepção vê |

O painel funciona no celular: o menu vira uma barra de rolagem lateral e os formulários se ajustam à tela.

---

## Stack

| Camada | Tecnologias |
|--------|-------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 3, React Router 7, TanStack Query, Axios |
| Backend | Node 20+, Express 5, TypeScript, Prisma 6, Zod, JWT |
| Banco | PostgreSQL 15 (Docker em desenvolvimento) |
| Opcional | Redis (rate limit compartilhado entre instâncias) |
| CI | GitHub Actions: migrations, lint, testes e build a cada push/PR |

## Estrutura

```
backend/    API REST (Express + Prisma) — detalhes em backend/README.md
  prisma/     schema, migrations e seed
  src/
    modules/    um módulo por domínio (auth, booking, availability, barber, ...)
    modules/public.routes.ts   toda a superfície pública da API
    utils/time.ts              fuso horário e motor de horários
frontend/   site público + painel (React + Vite)
docs/       escopo e requisitos
```

---

## Como rodar

**Pré-requisitos:** Node.js 20+ e Docker Desktop.

```bash
cp backend/.env.example backend/.env
```

Troque o `JWT_SECRET` no `backend/.env`. Para gerar um:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
docker compose up -d postgres
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

- Site: http://localhost:5173
- Painel: http://localhost:5173/admin
- API: http://localhost:3333/api/health

**Login de desenvolvimento (criado pelo seed):** `admin@vikinges.com` / `admin123` (dono). Barbeiros: `ragnar@`, `bjorn@` e `ivar@vikinges.com` / `barber123`.

> Essas senhas são só para ambiente local. Nunca use o seed em produção.

### Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | API + frontend em modo desenvolvimento |
| `npm test` | Testes do backend (usa o banco do `backend/.env`) |
| `npm run lint` | Checagem de tipos (backend) e ESLint (frontend) |
| `npm run build` | Build de produção |
| `npm run db:migrate` | Aplica/cria migrations |
| `npm run db:seed` | Popula a barbearia de exemplo |
| `npm run db:studio` | Abre o Prisma Studio |

---

## Decisões de arquitetura

- **Multi-tenant em banco único.** Toda tabela de negócio tem `tenant_id`. Nas rotas logadas o tenant vem do **token**; nas públicas, do **slug** na URL (`/api/v1/public/vikings/...`). Nunca vem do corpo da requisição.
- **Double booking impossível.** Uma constraint `EXCLUDE USING gist` no PostgreSQL impede dois agendamentos sobrepostos do mesmo barbeiro, mesmo com muitos acessos simultâneos.
- **Horários em UTC.** O banco usa `timestamptz`. Grade e horários livres são calculados no fuso de cada barbearia, sem depender do fuso do servidor.
- **Dinheiro em centavos.** O agendamento guarda o preço e a duração do momento da reserva, então mudar um serviço não altera o histórico.
- **Sessão segura.** O access token dura 15 min e fica só em memória. O refresh token fica em cookie `httpOnly`, troca a cada uso e, se for reutilizado, todas as sessões daquele login são encerradas.
- **Permissões por papel e por dono do recurso.** Os papéis são Dono, Gerente, Recepção e Barbeiro. O barbeiro só altera a própria agenda e só vê os próprios atendimentos.
- **Pronto para escalar na horizontal.** A API não guarda estado em memória. Com `REDIS_URL`, o rate limit é compartilhado entre instâncias.

## Testes

Os testes de integração rodam contra um PostgreSQL de verdade e cobrem:
- 10 agendamentos simultâneos no mesmo horário: só 1 é aceito;
- o banco recusa sobreposição mesmo sem passar pela API;
- uma barbearia não enxerga dados de outra;
- um barbeiro não altera a agenda de outro (IDOR);
- rotação do refresh token e revogação ao detectar reuso;
- saídas de estoque simultâneas não deixam saldo negativo;
- o motor de horários respeita duração, jornada e fuso.

---

## Histórico

### 2026-11-11 — Fase 1: painel de gestão completo
- **Agenda:**
  - navegar por data, filtrar por barbeiro e status;
  - confirmar, concluir, marcar falta, cancelar e remarcar;
  - agendar pelo painel com sugestão de horários livres e busca do cliente pelo telefone;
  - encaixe ("atender agora") e origem de cada agendamento (online, painel, encaixe).
- **Telas novas:** equipe, horários (grade e folgas), clientes, serviços, produtos com movimentação de estoque e configurações da barbearia.
- **Dashboard** com números reais do dia e do mês.
- **Cliente final:**
  - link para ver e cancelar o agendamento sem login;
  - aceite da política de privacidade e página `/privacidade`;
  - opção de a barbearia confirmar manualmente cada agendamento online.
- **LGPD:** dono e gerente podem apagar os dados pessoais de um cliente. O histórico de atendimentos continua, sem identificar a pessoa.
- **Correções:**
  - o modal não rolava em telas baixas, e o botão de salvar ficava fora da tela no celular;
  - clicar fora do modal não o fechava;
  - o painel não tinha navegação no celular.
- **Testes:** 22 de backend (equipe, encaixe, remarcação, link do cliente, LGPD, configurações, dashboard) e 3 de frontend (formatação de valores e telefone).

### 2026-11-11 — Correção de estilos no frontend
- O Tailwind não gerava as classes quando o servidor era iniciado fora da pasta `frontend`, o que deixava o login e o site desalinhados. A config agora é encontrada a partir do próprio frontend.
- Login com rótulos ligados aos campos, `autocomplete` e mais contraste.

### 2026-11-11 — Fase 0: fundação
- Modelo multi-tenant (`Tenant`, `Membership` com papéis).
- Proteção contra double booking no banco e horários calculados pela duração do serviço.
- Login real, sessão com refresh token rotativo, painel protegido e logout.
- Correções de segurança do código original:
  - um barbeiro podia alterar a agenda de outro;
  - o agendamento sobrescrevia os dados do cliente;
  - a API expunha o e-mail e o telefone da equipe;
  - saídas de estoque simultâneas podiam deixar o saldo negativo.
- Correções de bugs do código original:
  - o agendamento falhava com os dados do seed;
  - toda alteração de disponibilidade dava erro 500.
- Testes de integração e CI no GitHub Actions.

### Base inicial
- Código original importado de [HelderXavierL/Barbearia-Vikinges](https://github.com/HelderXavierL/Barbearia-Vikinges).
