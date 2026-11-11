// =============================================
// Barbearia Vikings — Navbar Component
// =============================================

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { navLinks } from '../../data/navigation';
import { Container } from './Container';
import logo from '../../assets/logo.png';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fecha o menu mobile ao trocar de rota (ajuste de estado no render, sem efeito extra).
  const [lastKey, setLastKey] = useState(location.key);
  if (lastKey !== location.key) {
    setLastKey(location.key);
    setIsOpen(false);
  }

  const handleNavClick = (href: string) => {
    if (href.startsWith('#') && isHome) {
      const el = document.getElementById(href.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setIsOpen(false);
      }
    }
  };

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/5 py-3'
          : 'bg-transparent py-5',
      )}
    >
      <Container>
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={logo}
              alt="Barbearia Vikings"
              className="h-10 w-10 md:h-12 md:w-12 object-contain transition-transform duration-300 group-hover:scale-110"
            />
            <div className="hidden sm:block">
              <span className="text-lg font-display font-bold text-white tracking-wider">
                VIKINGS
              </span>
              <span className="block text-[10px] uppercase tracking-[0.25em] text-brand-400 font-body">
                Barbearia
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <ul className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.href}>
                {link.isSection && isHome ? (
                  <button
                    onClick={() => handleNavClick(link.href)}
                    className="text-sm font-medium text-[#8A8680] hover:text-brand-400 transition-colors duration-300 tracking-wide uppercase font-body"
                  >
                    {link.label}
                  </button>
                ) : (
                  <Link
                    to={link.isSection ? `/${link.href}` : link.href}
                    className="text-sm font-medium text-[#8A8680] hover:text-brand-400 transition-colors duration-300 tracking-wide uppercase font-body"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {/* CTA + Mobile Toggle */}
          <div className="flex items-center gap-4">
            <Link
              to="/agendar"
              className="hidden md:inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-dark font-semibold text-sm tracking-wider uppercase rounded transition-all duration-300 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 font-body"
            >
              <Calendar className="w-4 h-4" />
              Agendar
            </Link>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden p-2 text-white/70 hover:text-white transition-colors"
              aria-label="Menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>
      </Container>

      {/* Mobile Menu */}
      <div
        className={clsx(
          'lg:hidden overflow-hidden transition-all duration-500',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="border-t border-white/5 bg-[#0A0A0F]/95 backdrop-blur-xl px-6 py-6 space-y-1">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="block w-full text-left py-3 text-base font-medium text-[#8A8680] hover:text-brand-400 transition-colors tracking-wide uppercase font-body"
            >
              {link.label}
            </button>
          ))}
          <div className="pt-4 border-t border-white/5">
            <Link
              to="/agendar"
              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-brand-500 text-dark font-semibold text-sm tracking-wider uppercase rounded transition-all font-body"
            >
              <Calendar className="w-4 h-4" />
              Agendar Agora
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
