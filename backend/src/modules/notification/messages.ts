// Textos das mensagens. Função pura (testada em messages.test.ts).
//
// No WhatsApp, mensagem que a empresa inicia precisa de TEMPLATE aprovado pela Meta.
// Cadastre no WhatsApp Manager, idioma pt_BR, com estes nomes e variáveis na ordem:
//   agendamento_confirmado  {{1}} nome {{2}} barbearia {{3}} serviço {{4}} data {{5}} hora {{6}} profissional {{7}} link
//   agendamento_recebido    {{1}} nome {{2}} barbearia {{3}} serviço {{4}} data {{5}} hora {{6}} profissional {{7}} link
//   lembrete_agendamento    {{1}} nome {{2}} barbearia {{3}} serviço {{4}} data {{5}} hora {{6}} profissional
//   agendamento_cancelado   {{1}} nome {{2}} barbearia {{3}} serviço {{4}} data {{5}} hora
//   vaga_disponivel         {{1}} nome {{2}} barbearia {{3}} serviço {{4}} data {{5}} link
// Respostas ao cliente (MESSAGE) são texto livre: permitido em até 24h depois da mensagem dele.

export type MessageType = 'CONFIRMATION' | 'REMINDER' | 'CANCELLATION' | 'WAITLIST' | 'MESSAGE';

export interface MessageData {
  type: MessageType;
  clientName: string;
  tenantName: string;
  service?: string;
  barber?: string;
  date?: string; // "14/11"
  time?: string; // "09:30"
  link?: string;
  /** Confirmação de agendamento que ainda depende da barbearia */
  pending?: boolean;
  /** Texto livre (MESSAGE) */
  text?: string;
}

export interface RenderedMessage {
  template: string | null;
  params: string[];
  text: string;
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function renderMessage(d: MessageData): RenderedMessage {
  const nome = first(d.clientName);
  const [s, dt, h, b, link] = [d.service ?? '', d.date ?? '', d.time ?? '', d.barber ?? '', d.link ?? ''];

  switch (d.type) {
    case 'CONFIRMATION':
      return d.pending
        ? {
            template: 'agendamento_recebido',
            params: [nome, d.tenantName, s, dt, h, b, link],
            text: `Olá, ${nome}! Recebemos seu pedido na ${d.tenantName}: ${s} com ${b} em ${dt} às ${h}. A barbearia vai confirmar em breve. Ver ou cancelar: ${link}`,
          }
        : {
            template: 'agendamento_confirmado',
            params: [nome, d.tenantName, s, dt, h, b, link],
            text: `Olá, ${nome}! Seu horário na ${d.tenantName} está confirmado: ${s} com ${b} em ${dt} às ${h}. Ver ou cancelar: ${link}`,
          };
    case 'REMINDER':
      return {
        template: 'lembrete_agendamento',
        params: [nome, d.tenantName, s, dt, h, b],
        text: `Lembrete, ${nome}: ${s} na ${d.tenantName} em ${dt} às ${h} com ${b}. Responda 1 para confirmar ou 2 para cancelar.`,
      };
    case 'CANCELLATION':
      return {
        template: 'agendamento_cancelado',
        params: [nome, d.tenantName, s, dt, h],
        text: `${nome}, seu horário de ${s} na ${d.tenantName} em ${dt} às ${h} foi cancelado. Para marcar outro, acesse nosso site.`,
      };
    case 'WAITLIST':
      return {
        template: 'vaga_disponivel',
        params: [nome, d.tenantName, s, dt, link],
        text: `Boa notícia, ${nome}! Abriu horário para ${s} na ${d.tenantName} em ${dt}. Corra para garantir: ${link}`,
      };
    case 'MESSAGE':
      return { template: null, params: [], text: d.text ?? '' };
  }
}

/** Interpreta a resposta do cliente no WhatsApp. */
export function parseReply(text: string): 'CONFIRM' | 'CANCEL' | 'OPT_OUT' | null {
  const t = text.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^(1|SIM|CONFIRMO|CONFIRMAR)\b/.test(t)) return 'CONFIRM';
  if (/^(2|CANCELAR|CANCELA|CANCELO)\b/.test(t)) return 'CANCEL';
  if (/^(SAIR|PARAR|STOP|DESCADASTRAR)\b/.test(t)) return 'OPT_OUT';
  return null;
}
