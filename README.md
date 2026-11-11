# 💈 Barbershop — plataforma para barbearias

Sistema web (SaaS) para barbearias: **agendamento online 24h** para o cliente e **painel de gestão** para a equipe (agenda, serviços, equipe, clientes e estoque). Foi feito para atender **várias barbearias** na mesma instalação (multi-tenant). A **Barbearia Vikings** é a primeira cliente (piloto).

> Escopo completo e requisitos: [docs/escopo-e-requisitos.md](docs/escopo-e-requisitos.md)

---

## Status

| Fase | Conteúdo | Situação |
|------|----------|----------|
| **0 — Fundação** | Multi-tenant, proteção contra double booking, fuso horário, autenticação real, permissões, testes e CI | ✅ Concluída |
| **1 — MVP vendável** | Telas de gestão: agenda (filtros, status, encaixe), serviços, equipe, disponibilidade, clientes, produtos, configurações da barbearia; cancelamento pelo cliente via link; LGPD básica | ✅ Concluída (falta só o CAPTCHA, que precisa de conta no Cloudflare) |
| **2 — Gestão** | Comanda, caixa, comissões, relatórios | ✅ Concluída |
| **3 — Automação** | WhatsApp (confirmação, lembrete, cancelamento), lista de espera, política de no-show | ✅ Concluída (o envio real depende da conta na Meta, veja [Ativar o WhatsApp](#ativar-o-whatsapp)) |
| **4 — Plataforma** | Cadastro self-service de barbearias, planos e cobrança, multiunidade, fidelidade, PWA | ⏳ Próxima |

### Já funciona

**Para o cliente (site público)**
- Site da barbearia com serviços, equipe, vitrine de produtos, FAQ e contato.
- Agendamento em 4 etapas sem cadastro. Os horários levam em conta a duração do serviço, a grade do barbeiro, folgas e a antecedência mínima e máxima.
- Aceite da política de privacidade (LGPD), com e-mail e observações opcionais.
- Link pessoal (`/agendamento#…`) para ver e cancelar o próprio horário, até o prazo definido pela barbearia.
- **WhatsApp:** confirmação com o link, lembrete antes do horário e aviso de cancelamento. O cliente pode responder **1** (confirma presença), **2** (cancela) ou **SAIR** (para de receber).
- **Lista de espera:** num dia sem horário livre, o cliente pede para ser avisado. Se alguém cancelar, até 3 pessoas recebem o aviso com o link para agendar.

**Para a equipe (painel `/admin`)**

| Tela | O que faz | Quem vê |
|------|-----------|---------|
| Dashboard | Atendimentos e faturamento do dia, concluídos e faltas do mês, próximos horários, alertas | Todos (barbeiro: só os próprios números) |
| Agenda | Navegar por data, filtrar, confirmar, **cobrar** (fecha a comanda e conclui), marcar falta, cancelar, remarcar, agendar pelo painel e encaixe; atualiza sozinha a cada 30s | Todos (barbeiro: só a própria agenda) |
| Caixa | Abrir com troco, venda avulsa, suprimento, sangria, comandas do caixa, estorno, fechar com conferência do dinheiro; histórico de caixas | Dono, gerente e recepção (estorno e histórico: dono e gerente) |
| Relatórios | Faturamento, ticket médio, formas de pagamento, por profissional, serviços e produtos mais vendidos, por dia, faltas; exportação CSV para o Excel | Dono e gerente |
| Comissões | Comissão a pagar e paga por profissional no período; marcar como paga | Todos (barbeiro: só a própria; marcar pago: dono e gerente) |
| Clientes | Busca, recorrentes, histórico, preferências, exclusão de dados (LGPD) | Todos (barbeiro: só quem atendeu) |
| Horários | Grade semanal e folgas/bloqueios/horário especial por profissional | Todos (barbeiro: só o próprio) |
| Equipe | Cadastrar membros, papéis, serviços que cada um atende e % de comissão | Dono e gerente |
| Serviços | Criar, editar preço/duração, desativar | Dono e gerente |
| Produtos | Cadastro, estoque baixo, entrada/saída/ajuste com histórico | Dono, gerente e recepção |
| Mensagens | Mensagens automáticas: na fila, enviadas, falhas com o motivo; reenviar | Dono e gerente |
| Configurações | Regras de agendamento, cancelamento, recorrência, fuso, lembrete, limite de faltas, número do WhatsApp | Dono e gerente editam; recepção vê |

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
- O `npm run dev` também sobe o **worker de mensagens**. Sem o token da Meta, as mensagens só aparecem no terminal.
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
| `npm run worker` | Só o worker de mensagens (em produção: `npm run start:worker --workspace=backend`) |

---

## Ativar o WhatsApp

O sistema usa a **WhatsApp Cloud API** oficial da Meta. Os passos, uma vez por plataforma:

1. Crie um app do tipo **Business** em developers.facebook.com e adicione o produto **WhatsApp**.
2. No WhatsApp Manager, cadastre e aprove os **modelos de mensagem** (idioma Português/BR), com estes nomes e variáveis na ordem:

| Modelo | Variáveis |
|--------|-----------|
| `agendamento_confirmado` | nome, barbearia, serviço, data, hora, profissional, link |
| `agendamento_recebido` | nome, barbearia, serviço, data, hora, profissional, link |
| `lembrete_agendamento` | nome, barbearia, serviço, data, hora, profissional (termine o texto com "Responda 1 para confirmar ou 2 para cancelar") |
| `agendamento_cancelado` | nome, barbearia, serviço, data, hora |
| `vaga_disponivel` | nome, barbearia, serviço, data, link |

3. Gere um **token permanente** (usuário do sistema) e preencha no `backend/.env`: `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET` (segredo do app) e `WHATSAPP_VERIFY_TOKEN` (uma frase que você escolhe).
4. Configure o webhook do app para `https://SEU-DOMINIO/api/v1/webhooks/whatsapp`, com o mesmo `WHATSAPP_VERIFY_TOKEN`, e assine o campo **messages**.
5. Em cada barbearia, em **Configurações → WhatsApp**, informe o **ID do número de telefone** (fica no painel da Meta).

Até isso estar pronto, tudo funciona igual, só que as mensagens ficam registradas em **Mensagens** e no terminal do worker em vez de sair pelo WhatsApp.

## Decisões de arquitetura

- **Multi-tenant em banco único.** Toda tabela de negócio tem `tenant_id`. Nas rotas logadas o tenant vem do **token**; nas públicas, do **slug** na URL (`/api/v1/public/vikings/...`). Nunca vem do corpo da requisição.
- **Double booking impossível.** Uma constraint `EXCLUDE USING gist` no PostgreSQL impede dois agendamentos sobrepostos do mesmo barbeiro, mesmo com muitos acessos simultâneos.
- **Horários em UTC.** O banco usa `timestamptz`. Grade e horários livres são calculados no fuso de cada barbearia, sem depender do fuso do servidor.
- **Dinheiro em centavos.** O agendamento guarda o preço e a duração do momento da reserva, então mudar um serviço não altera o histórico.
- **Sessão segura.** O access token dura 15 min e fica só em memória. O refresh token fica em cookie `httpOnly`, troca a cada uso e, se for reutilizado, todas as sessões daquele login são encerradas.
- **Permissões por papel e por dono do recurso.** Os papéis são Dono, Gerente, Recepção e Barbeiro. O barbeiro só altera a própria agenda e só vê os próprios atendimentos.
- **Fila de mensagens no próprio PostgreSQL** (`FOR UPDATE SKIP LOCKED`), sem Redis nem serviço extra. Dá para rodar vários workers sem duplicar envio; se um cair no meio, a mensagem volta para a fila sozinha. Mensagem só sai para quem consentiu, e o token do link sai do banco assim que é enviado.
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

### 2026-11-13 — Fase 3: automação e WhatsApp
- **Fila de mensagens** com worker separado. Tem retentativa com espera crescente e marca falha definitiva na 5ª tentativa.
- **Mensagens automáticas:**
  - confirmação com o link do cliente, ou "recebido" quando a barbearia precisa confirmar;
  - lembrete X horas antes, configurável; o lembrete de um horário remarcado ou cancelado é descartado;
  - aviso de cancelamento.
- **WhatsApp Cloud API** por modelo aprovado. O webhook tem assinatura HMAC validada, atualiza falhas de entrega e entende as respostas **1**, **2** e **SAIR**.
- **Lista de espera** no site. Ao cancelar um horário, até 3 pessoas daquele dia recebem o aviso.
- **Política de faltas:** quem passou do limite de faltas em 6 meses agenda online como pendente.
- **LGPD:**
  - mensagem só para quem aceitou;
  - no balcão, a equipe marca se o cliente autorizou;
  - "SAIR" vale para sempre;
  - o log não mostra o token do link nem o telefone completo.
- **Painel:** nova tela de Mensagens e configurações de WhatsApp, lembrete e faltas.
- **Testes:** 4 de textos e respostas, e 11 de integração com a API da Meta simulada (incluindo dois workers ao mesmo tempo). No total, 52 de backend e 3 de frontend.

### 2026-11-12 — Fase 2: gestão financeira
- **Comanda:**
  - itens de serviço e produto, desconto e gorjeta;
  - pagamento misto (Pix, crédito, débito, dinheiro) e cálculo de troco;
  - na agenda, o botão "Cobrar" fecha a comanda e conclui o atendimento ao mesmo tempo.
- **Regras garantidas:**
  - os preços vêm do cadastro, nunca do navegador, e o serviço agendado é cobrado pelo preço reservado;
  - um agendamento não pode ser cobrado duas vezes;
  - a venda de produto baixa o estoque na mesma operação: se faltar produto, nada é gravado.
- **Estorno:** a comanda fica marcada como estornada e devolve o estoque. Não é permitido se a comissão já foi paga.
- **Caixa:**
  - abertura com troco, suprimento, sangria e venda avulsa;
  - fechamento com o dinheiro contado e a diferença (sobra ou falta);
  - só um caixa aberto por barbearia, garantido pelo banco.
- **Comissão:** percentual por profissional para serviços e produtos, calculado sobre o valor pago (com o desconto rateado). Gorjeta é 100% do profissional.
- **Relatórios** do período com exportação CSV, e **comissões** com a opção "marcar como pago".
- **Acessibilidade:** os campos de formulário agora ficam sempre ligados ao rótulo, com ids únicos.
- **Testes:** 4 do cálculo da comanda e 11 de integração (caixa, cobrança, estorno, comissão, relatório). No total, 37 de backend e 3 de frontend.

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
