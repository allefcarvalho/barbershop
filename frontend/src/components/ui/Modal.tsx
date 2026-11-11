// =============================================
// Barbearia Vikings — Modal Component
// =============================================

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  // A camada externa rola: em telas baixas (celular) o conteúdo do modal nunca fica inalcançável.
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop: clicar fora fecha */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="relative flex min-h-full items-center justify-center p-4 pointer-events-none">
        <div
          className={clsx(
            'pointer-events-auto relative w-full bg-dark-50 border border-white/10 rounded-xl shadow-2xl animate-slide-up',
            sizes[size],
          )}
        >
          {title && (
            <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div className="p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { Modal };
export type { ModalProps };
