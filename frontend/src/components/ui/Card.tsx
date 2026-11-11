// =============================================
// Barbearia Vikings — Card Component
// =============================================

import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8 md:p-10',
};

function Card({ variant = 'default', hover = false, padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg transition-all duration-300',
        variant === 'default' && 'bg-panel border border-white/5',
        variant === 'glass' && 'glass',
        variant === 'bordered' && 'bg-transparent border border-white/10',
        hover && 'card-hover cursor-pointer',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card };
export type { CardProps };
