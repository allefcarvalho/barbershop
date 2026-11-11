// =============================================
// Barbearia Vikings — Input Component
// =============================================

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, id, ...props }, ref) => {
    const autoId = useId(); // único na página, mesmo com dois campos de mesmo rótulo
    const inputId = id || autoId;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium tracking-wider uppercase text-slate-400"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded text-white text-sm',
              'placeholder:text-slate-600',
              'transition-all duration-200',
              'hover:border-white/20',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50',
              icon && 'pl-10',
              error && 'border-red-500/50 focus:ring-red-500/50',
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
export { Input };
export type { InputProps };
