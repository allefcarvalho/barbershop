// =============================================
// Barbearia Vikings — Barbers Section (API)
// =============================================

import { Star, User } from 'lucide-react';
import { Section } from '../components/layout/Section';
import { Container } from '../components/layout/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { GridSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { useBarbers } from '../hooks/useBarbers';
import { useServices } from '../hooks/useServices';

export function Barbers() {
  const { data: barbers, isLoading, error, refetch } = useBarbers();
  const { data: services } = useServices();

  return (
    <Section id="barbers" variant="dark">
      <Container>
        <SectionTitle
          title="Nossos Guerreiros"
          subtitle="Profissionais experientes prontos para transformar seu visual com a precisão e força Viking."
        />

        {isLoading && <GridSkeleton count={3} />}
        {error && <ErrorState message="Erro ao carregar barbeiros" onRetry={() => refetch()} />}

        {barbers && barbers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {barbers.map((barber) => (
              <div
                key={barber.id}
                className="group relative rounded-xl overflow-hidden border border-white/5 card-hover bg-panel"
              >
                {/* Photo */}
                <div className="relative h-72 overflow-hidden bg-dark flex items-center justify-center">
                  {barber.avatarUrl ? (
                    <img
                      src={barber.avatarUrl}
                      alt={barber.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-brand-500/10 flex items-center justify-center">
                      <User className="w-12 h-12 text-brand-500/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121218] via-transparent to-transparent" />

                  {/* Rating badge */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark/80 backdrop-blur-sm border border-white/10">
                    <Star className="w-3.5 h-3.5 text-brand-400 fill-brand-400" />
                    <span className="text-xs font-semibold text-white font-body">5.0</span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-6">
                  <h3 className="text-lg font-display font-semibold text-white mb-1">
                    {barber.name}
                  </h3>
                  <p className="text-xs uppercase tracking-wider text-brand-400 font-body mb-4">
                    Barbeiro
                  </p>

                  {barber.serviceIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {services?.filter((s) => barber.serviceIds.includes(s.id)).slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#8A8680] bg-white/5 rounded-full border border-white/5 font-body"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </Section>
  );
}
