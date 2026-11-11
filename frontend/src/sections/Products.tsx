// =============================================
// Barbearia Vikings — Products Section (API)
// =============================================

import { ShoppingBag, Package } from 'lucide-react';
import { formatBRL } from '../utils/format';
import { Section } from '../components/layout/Section';
import { Container } from '../components/layout/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { GridSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { useProducts } from '../hooks/useProducts';

export function Products() {
  const { data: products, isLoading, error, refetch } = useProducts();

  return (
    <Section id="products" variant="dark">
      <Container>
        <SectionTitle
          title="Loja Viking"
          subtitle="Leve o cuidado Viking para casa. Produtos selecionados para manter seu estilo entre visitas."
        />

        {isLoading && <GridSkeleton count={3} />}
        {error && <ErrorState message="Erro ao carregar produtos" onRetry={() => refetch()} />}

        {products && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => (
              <div
                key={product.id}
                className="group rounded-xl overflow-hidden border border-white/5 bg-panel card-hover"
              >
                {/* Image */}
                <div className="relative h-56 overflow-hidden bg-dark flex items-center justify-center">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="w-16 h-16 text-brand-500/20" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121218] via-transparent to-transparent opacity-60" />
                </div>

                {/* Info */}
                <div className="p-6">
                  <h3 className="text-lg font-display font-semibold text-white mb-2">
                    {product.name}
                  </h3>
                  <p className="text-sm text-[#5A5650] leading-relaxed mb-5 font-body">
                    {product.description}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-2xl font-display font-bold text-brand-400">
                      {formatBRL(product.priceCents)}
                    </span>
                    <button className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs uppercase tracking-wider font-semibold rounded-lg transition-all duration-300 border border-brand-500/20 hover:border-brand-500/30 font-body">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Comprar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {products && products.length === 0 && (
          <p className="text-center text-[#5A5650] font-body py-10">Nenhum produto disponível no momento.</p>
        )}
      </Container>
    </Section>
  );
}
