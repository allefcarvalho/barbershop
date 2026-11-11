// Componentes visuais compartilhados pelas telas do painel (hooks e constantes ficam em admin.ts).
import { AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { fieldClass } from './admin';

export function AdminLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 animate-fade">
      <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin mb-4" />
      <p className="text-sm text-[#8A8680] font-body">Carregando {label}...</p>
    </div>
  );
}

export function AdminError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 animate-fade text-center">
      <AlertCircle className="w-10 h-10 text-red-400/50 mb-4" />
      <p className="text-sm text-[#8A8680] font-body mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs uppercase tracking-wider font-semibold bg-brand-500/10 text-brand-400 rounded-lg border border-brand-500/20 hover:bg-brand-500/20 transition-all font-body"
      >
        Tentar novamente
      </button>
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="text-center py-16 rounded-xl border border-dashed border-white/10">
      <div className="flex justify-center mb-4 text-brand-500/30">{icon}</div>
      <p className="text-sm text-[#8A8680] font-body">{children}</p>
    </div>
  );
}

export function Select({ label, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const select = (
    <select className={clsx(fieldClass, 'appearance-none bg-[#16161d]', className)} {...props}>
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium tracking-wider uppercase text-[#8A8680] font-body">{label}</span>
      {select}
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium tracking-wider uppercase text-[#8A8680] font-body">{label}</span>
      <textarea rows={2} className={fieldClass} {...props} />
    </label>
  );
}

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border whitespace-nowrap', className)}>
      {children}
    </span>
  );
}
