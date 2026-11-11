// Política de privacidade (LGPD). Texto-base: revisar com o jurídico antes de publicar.
import { Navbar } from '../components/layout/Navbar';
import { Container } from '../components/layout/Container';
import { useTenant } from '../hooks/useServices';

export function PrivacyPage() {
  const { data: tenant } = useTenant();
  const name = tenant?.name ?? 'a barbearia';

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-28 pb-16">
        <Container size="sm">
          <article className="max-w-2xl mx-auto space-y-5 text-sm leading-relaxed text-[#C8C4BC] font-body [&_h2]:text-white [&_h2]:font-display [&_h2]:text-lg [&_h2]:pt-2">
            <h1 className="text-3xl font-display font-bold text-white">Política de privacidade</h1>

            <p>Esta política explica como {name} trata os seus dados pessoais quando você agenda um horário, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

            <h2>Quais dados coletamos</h2>
            <p>Nome, telefone/WhatsApp e, se você informar, e-mail e observações. Também registramos o histórico dos seus atendimentos (serviço, profissional, data e status).</p>

            <h2>Para que usamos</h2>
            <p>Para realizar e gerenciar o seu agendamento, enviar confirmações e lembretes, identificar você em novas visitas e melhorar o atendimento. Não vendemos nem compartilhamos seus dados para publicidade de terceiros.</p>

            <h2>Base legal</h2>
            <p>Execução do serviço que você solicitou e o seu consentimento, registrado no momento do agendamento.</p>

            <h2>Por quanto tempo guardamos</h2>
            <p>Enquanto você for cliente e pelo prazo exigido por lei. Depois disso, os dados são excluídos ou anonimizados.</p>

            <h2>Seus direitos</h2>
            <p>Você pode pedir a qualquer momento acesso, correção, exclusão dos seus dados ou revogar o consentimento. Basta falar com a barbearia pelos canais de contato do site.</p>

            <h2>Segurança</h2>
            <p>Os dados ficam em servidores com acesso restrito à equipe da barbearia, transmitidos com criptografia (HTTPS).</p>
          </article>
        </Container>
      </main>
    </>
  );
}
