// =============================================
// Barbearia Vikings — Booking Page (API-Integrated)
// =============================================

import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Calendar, Clock, User, Scissors, AlertCircle } from 'lucide-react';
import { formatBRL } from '../utils/format';
import clsx from 'clsx';
import { Navbar } from '../components/layout/Navbar';
import { Container } from '../components/layout/Container';
import { StepIndicator } from '../components/booking/StepIndicator';
import { GridSkeleton, ServiceCardSkeleton } from '../components/common/LoadingSkeleton';
import { useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useServices, useTenant } from '../hooks/useServices';
import { apiErrorMessage } from '../config/api';
import { useBarbers } from '../hooks/useBarbers';
import { useAvailableSlots } from '../hooks/useAvailableSlots';
import { bookingService } from '../services/booking.service';

const STEPS = ['Serviço', 'Barbeiro', 'Horário', 'Confirmar'];

export function BookingPage() {
  const [searchParams] = useSearchParams();
  const preselectedService = searchParams.get('service') || '';

  const [step, setStep] = useState(preselectedService ? 1 : 0);
  const [selectedServiceId, setSelectedServiceId] = useState(preselectedService);
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const queryClient = useQueryClient();

  // === API Hooks ===
  const { data: services, isLoading: loadingServices } = useServices();
  const { data: barbers, isLoading: loadingBarbers } = useBarbers(selectedServiceId || undefined);
  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(selectedBarberId, selectedDate, selectedServiceId);
  const { data: tenant } = useTenant();

  const selectedService = services?.find((s) => s.id === selectedServiceId);
  const selectedBarber = barbers?.find((b) => b.id === selectedBarberId);

  // Datas a partir de hoje (no fuso da barbearia), só nos dias em que ela abre e dentro da janela configurada.
  const availableDates = useMemo(() => {
    if (!tenant) return [];
    const today = formatInTimeZone(new Date(), tenant.timezone, 'yyyy-MM-dd');
    const dates: string[] = [];
    for (let i = 0; i <= tenant.maxAdvanceDays; i++) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      if (tenant.openDays.includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [tenant]);

  const canAdvance =
    (step === 0 && selectedServiceId) ||
    (step === 1 && selectedBarberId) ||
    (step === 2 && selectedDate && selectedTime) ||
    (step === 3 && clientName.length >= 2 && clientPhone.length >= 8);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await bookingService.create({
        clientName,
        clientPhone,
        barberId: selectedBarberId,
        serviceId: selectedServiceId,
        date: selectedDate,
        time: selectedTime,
      });
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, 'Erro ao criar agendamento'));
      // Horário pode ter sido tomado por outra pessoa: atualiza a lista.
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    } finally {
      setIsSubmitting(false);
    }
  };

  // === Success Screen ===
  if (isSuccess) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen pt-24 flex items-center justify-center">
          <Container size="sm">
            <div className="text-center space-y-6 animate-fade">
              <div className="w-20 h-20 mx-auto rounded-full bg-brand-500/10 flex items-center justify-center">
                <Check className="w-10 h-10 text-brand-400" />
              </div>
              <h2 className="text-3xl font-display font-bold text-white">
                Agendamento Confirmado!
              </h2>
              <p className="text-[#8A8680] font-body max-w-md mx-auto">
                Seu horário com <strong className="text-white">{selectedBarber?.name}</strong> está marcado para{' '}
                <strong className="text-brand-400">{selectedDate} às {selectedTime}</strong>.
              </p>
              <div className="p-6 rounded-xl bg-panel border border-white/5 max-w-sm mx-auto text-left space-y-3">
                <div className="flex items-center gap-3">
                  <Scissors className="w-4 h-4 text-brand-400" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedService?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-brand-400" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedBarber?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-brand-400" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedDate}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-brand-400" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedTime}</span>
                </div>
              </div>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 text-dark font-semibold text-sm tracking-wider uppercase rounded-lg transition-all font-body hover:bg-brand-600"
              >
                Voltar ao Início
              </Link>
            </div>
          </Container>
        </main>
      </>
    );
  }

  // === Booking Flow ===
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-16">
        <Container size="lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white text-glow">
              Agendar Horário
            </h1>
            <p className="mt-2 text-sm text-[#5A5650] font-body">
              Escolha seu serviço, barbeiro e horário ideal.
            </p>
          </div>

          <StepIndicator steps={STEPS} currentStep={step} />

          {/* Step 0: Service */}
          {step === 0 && (
            <div className="animate-fade">
              {loadingServices && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => <ServiceCardSkeleton key={i} />)}
                </div>
              )}
              {services && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((service) => {
                    const selected = service.id === selectedServiceId;
                    return (
                      <button
                        key={service.id}
                        onClick={() => setSelectedServiceId(service.id)}
                        className={clsx(
                          'p-5 rounded-xl border text-left transition-all duration-300',
                          selected
                            ? 'border-brand-500/40 bg-brand-500/5 shadow-brand'
                            : 'border-white/5 bg-panel hover:border-white/10',
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className={clsx(
                            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                            selected ? 'bg-brand-500/20' : 'bg-white/5',
                          )}>
                            <Scissors className={clsx('w-5 h-5', selected ? 'text-brand-400' : 'text-[#5A5650]')} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-white font-body">{service.name}</h3>
                            <p className="text-xs text-[#5A5650] mt-1 font-body">{service.durationMinutes}min</p>
                          </div>
                          <span className={clsx(
                            'text-lg font-display font-bold',
                            selected ? 'text-brand-400' : 'text-[#8A8680]',
                          )}>
                            {formatBRL(service.priceCents)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Barber */}
          {step === 1 && (
            <div className="animate-fade">
              {loadingBarbers && <GridSkeleton count={3} />}
              {barbers && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {barbers.map((barber) => {
                    const selected = barber.id === selectedBarberId;
                    return (
                      <button
                        key={barber.id}
                        onClick={() => setSelectedBarberId(barber.id)}
                        className={clsx(
                          'rounded-xl overflow-hidden border text-left transition-all duration-300',
                          selected
                            ? 'border-brand-500/40 shadow-brand'
                            : 'border-white/5 hover:border-white/10',
                        )}
                      >
                        <div className="h-40 overflow-hidden bg-dark flex items-center justify-center">
                          {barber.avatarUrl ? (
                            <img src={barber.avatarUrl} alt={barber.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <User className="w-12 h-12 text-brand-500/20" />
                          )}
                        </div>
                        <div className={clsx('p-4', selected ? 'bg-brand-500/5' : 'bg-panel')}>
                          <h3 className="text-sm font-semibold text-white font-body">{barber.name}</h3>
                          <p className="text-xs text-brand-400 uppercase tracking-wider mt-0.5 font-body">
                            Barbeiro
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <div className="animate-fade space-y-8">
              {/* Date picker */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-4 font-body uppercase tracking-wider">
                  Escolha a Data
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                  {availableDates.map((dateStr) => {
                    const d = new Date(dateStr + 'T12:00:00');
                    const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' });
                    const dayNum = d.getDate();
                    const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
                    const selected = dateStr === selectedDate;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => { setSelectedDate(dateStr); setSelectedTime(''); }}
                        className={clsx(
                          'flex flex-col items-center min-w-[70px] px-4 py-3 rounded-xl border transition-all duration-300 shrink-0',
                          selected
                            ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                            : 'border-white/5 bg-panel text-[#5A5650] hover:border-white/10',
                        )}
                      >
                        <span className="text-[10px] uppercase tracking-wider font-body">{dayName}</span>
                        <span className="text-xl font-display font-bold mt-1">{dayNum}</span>
                        <span className="text-[10px] uppercase tracking-wider font-body">{monthName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots from API */}
              {selectedDate && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-4 font-body uppercase tracking-wider">
                    Escolha o Horário
                  </h3>
                  {loadingSlots && (
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-11 rounded-lg bg-white/[0.03] animate-pulse" />
                      ))}
                    </div>
                  )}
                  {slots && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {slots.map((slot) => (
                        <button
                          key={slot.time}
                          disabled={!slot.available}
                          onClick={() => setSelectedTime(slot.time)}
                          className={clsx(
                            'px-4 py-3 rounded-lg text-sm font-body font-medium transition-all duration-300',
                            slot.time === selectedTime
                              ? 'bg-brand-500 text-dark'
                              : slot.available
                                ? 'bg-panel border border-white/5 text-[#8A8680] hover:border-brand-500/20 hover:text-white'
                                : 'bg-white/[0.02] text-[#5A5650]/40 cursor-not-allowed line-through',
                          )}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                  {slots && slots.length === 0 && (
                    <p className="text-center text-[#5A5650] font-body py-6">
                      Nenhum horário disponível nesta data. Tente outra data.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="max-w-lg mx-auto animate-fade space-y-6">
              {/* Summary */}
              <div className="p-6 rounded-xl bg-panel border border-white/5 space-y-4">
                <h3 className="text-sm font-semibold text-white font-body uppercase tracking-wider mb-4">Resumo</h3>
                <div className="flex items-center gap-3">
                  <Scissors className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedService?.name}</span>
                  <span className="ml-auto text-sm font-display font-bold text-brand-400">{selectedService && formatBRL(selectedService.priceCents)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedBarber?.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedDate}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-sm text-[#8A8680] font-body">{selectedTime} ({selectedService?.durationMinutes}min)</span>
                </div>
              </div>

              {/* Client info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white font-body uppercase tracking-wider">Seus Dados</h3>
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-3 bg-dark border border-white/10 rounded-lg text-white placeholder-[#5A5650] focus:border-brand-500/40 focus:outline-none transition-colors font-body"
                />
                <input
                  type="tel"
                  placeholder="Seu telefone (WhatsApp)"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-dark border border-white/10 rounded-lg text-white placeholder-[#5A5650] focus:border-brand-500/40 focus:outline-none transition-colors font-body"
                />
              </div>

              {/* API Error */}
              {submitError && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/15">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400 font-body">{submitError}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-10 max-w-lg mx-auto">
            <button
              onClick={() => {
                setStep(Math.max(0, step - 1));
                setSubmitError('');
              }}
              disabled={step === 0}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-medium font-body rounded-lg transition-all duration-300',
                step === 0
                  ? 'opacity-0 pointer-events-none'
                  : 'text-[#8A8680] hover:text-white bg-white/5 hover:bg-white/10',
              )}
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvance}
                className={clsx(
                  'flex items-center gap-2 px-6 py-2.5 text-sm font-semibold font-body tracking-wider uppercase rounded-lg transition-all duration-300',
                  canAdvance
                    ? 'bg-brand-500 text-dark hover:bg-brand-600'
                    : 'bg-white/5 text-[#5A5650] cursor-not-allowed',
                )}
              >
                Avançar
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canAdvance || isSubmitting}
                className={clsx(
                  'flex items-center gap-2 px-8 py-3 text-sm font-semibold font-body tracking-wider uppercase rounded-lg transition-all duration-300',
                  canAdvance && !isSubmitting
                    ? 'bg-brand-500 text-dark hover:bg-brand-600 shadow-lg shadow-brand-500/20'
                    : 'bg-white/5 text-[#5A5650] cursor-not-allowed',
                )}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Confirmando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Agendamento
                  </>
                )}
              </button>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
