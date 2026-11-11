// Página do link enviado ao cliente: ver e cancelar o próprio agendamento, sem login.
// O token vem no fragmento da URL (#...) — o navegador não envia essa parte a nenhum servidor.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Scissors, User, AlertCircle, XCircle } from 'lucide-react';
import { api, pub, apiErrorMessage } from '../config/api';
import { Navbar } from '../components/layout/Navbar';
import { Container } from '../components/layout/Container';
import { formatBRL } from '../utils/format';

interface ManageView {
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  date: string;
  time: string;
  service: string;
  barber: string;
  priceCents: number;
  canCancel: boolean;
  cancelMinHours: number;
}

const STATUS_TEXT: Record<ManageView['status'], string> = {
  PENDING: 'Aguardando confirmação da barbearia',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Atendimento concluído',
  NO_SHOW: 'Não compareceu',
};

export function ManageBookingPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const { data, isLoading, error } = useQuery<ManageView>({
    queryKey: ['manage-booking', token],
    queryFn: async () => (await api.post(pub('/bookings/manage'), { token })).data.data,
    enabled: token.length >= 20,
    retry: false,
  });
  const [view, setView] = useState<ManageView | null>(null);
  const booking = view ?? data;

  const cancel = useMutation({
    mutationFn: async () => (await api.post(pub('/bookings/manage/cancel'), { token })).data.data as ManageView,
    onSuccess: setView,
  });

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-28 pb-16">
        <Container size="sm">
          <div className="max-w-md mx-auto space-y-6 animate-fade">
            <h1 className="text-3xl font-display font-bold text-white text-center">Seu agendamento</h1>

            {isLoading && <p className="text-center text-[#8A8680] font-body">Carregando...</p>}

            {(token.length < 20 || error) && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/15">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400 font-body">
                  Link inválido ou expirado. Confira se copiou o link completo ou fale com a barbearia.
                </p>
              </div>
            )}

            {booking && (
              <>
                <div className="p-6 rounded-xl bg-panel border border-white/5 space-y-3">
                  <p className="text-xs uppercase tracking-wider text-brand-400 font-body">{STATUS_TEXT[booking.status]}</p>
                  <Row icon={<Scissors className="w-4 h-4" />}>{booking.service} · {formatBRL(booking.priceCents)}</Row>
                  <Row icon={<User className="w-4 h-4" />}>{booking.barber}</Row>
                  <Row icon={<Calendar className="w-4 h-4" />}>{booking.date.split('-').reverse().join('/')}</Row>
                  <Row icon={<Clock className="w-4 h-4" />}>{booking.time}</Row>
                </div>

                {cancel.error && <p className="text-sm text-red-400 font-body">{apiErrorMessage(cancel.error)}</p>}

                {booking.canCancel ? (
                  <button
                    onClick={() => window.confirm('Cancelar este agendamento?') && cancel.mutate()}
                    disabled={cancel.isPending}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold uppercase tracking-wider rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 font-body"
                  >
                    <XCircle className="w-4 h-4" /> Cancelar agendamento
                  </button>
                ) : (
                  (booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                    <p className="text-xs text-[#8A8680] text-center font-body">
                      Pelo link, o cancelamento vai até {booking.cancelMinHours}h antes do horário. Depois disso, fale com a barbearia.
                    </p>
                  )
                )}

                <p className="text-center text-sm font-body">
                  <Link to="/agendar" className="text-brand-400 hover:text-brand-300">
                    {booking.status === 'CANCELLED' ? 'Agendar outro horário' : 'Precisa remarcar? Cancele e agende um novo horário'}
                  </Link>
                </p>
              </>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[#C8C4BC] font-body">
      <span className="text-brand-400">{icon}</span>
      {children}
    </div>
  );
}
