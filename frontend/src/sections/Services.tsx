// =============================================
// Barbearia Vikings — Services Section (API)
// =============================================

import { Link } from 'react-router-dom';
import { Clock, ArrowRight, Scissors } from 'lucide-react';
import { formatBRL } from '../utils/format';
import { Section } from '../components/layout/Section';
import { Container } from '../components/layout/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { GridSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { useServices } from '../hooks/useServices';

export function Services() {
  const { data: services, isLoading, error, refetch } = useServices();

  return (
    <Section id="services" variant="panel">
      <Container>
        <SectionTitle
          title="Nossos Serviços"
          subtitle="Cada detalhe pensado para entregar o melhor resultado. Escolha o serviço ideal para você."
        />

        {isLoading && <GridSkeleton count={3} variant="service" />}
        {error && <ErrorState message="Erro ao carregar serviços" onRetry={() => refetch()} />}

        {services && services.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <div
                key={service.id}
                className="group relative p-6 md:p-8 rounded-xl bg-dark border border-white/5 card-hover"
              >
                {/* Popular badge (first two) */}
                {i < 2 && (
                  <span className="absolute top-4 right-4 px-3 py-1 text-[10px] uppercase tracking-widest font-semibold bg-brand-500/10 text-brand-400 rounded-full border border-brand-500/20 font-body">
                    Popular
                  </span>
                )}

                {/* Icon */}
                <div className="w-12 h-12 rounded-lg bg-brand-500/10 flex items-center justify-center mb-5 group-hover:bg-brand-500/20 transition-colors duration-500">
                  <Scissors className="w-6 h-6 text-brand-400" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-display font-semibold text-white mb-2">
                  {service.name}
                </h3>
                <p className="text-sm text-[#8A8680] leading-relaxed mb-6 font-body">
                  {service.description}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-display font-bold text-brand-400">
                      {formatBRL(service.priceCents)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#5A5650] font-body">
                      <Clock className="w-3.5 h-3.5" />
                      {service.durationMinutes}min
                    </span>
                  </div>
                  <Link
                    to={`/agendar?service=${service.id}`}
                    className="p-2 rounded-lg bg-white/5 text-[#5A5650] hover:bg-brand-500/10 hover:text-brand-400 transition-all duration-300"
                    aria-label={`Agendar ${service.name}`}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {services && services.length === 0 && (
          <p className="text-center text-[#5A5650] font-body py-10">Nenhum serviço disponível no momento.</p>
        )}
      </Container>
    </Section>
  );
}
