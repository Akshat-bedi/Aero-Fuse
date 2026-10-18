import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'confirm';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: React.ReactNode;
  /**
   * Safety-critical UX: When true, clicking once enters a 'CONFIRM' state.
   * The user must click a second time within 3.5 seconds to execute onClick.
   */
  requireConfirm?: boolean;
  confirmText?: string;
  confirmVariant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      icon,
      requireConfirm = false,
      confirmText = 'CONFIRM ACTION?',
      confirmVariant = 'danger',
      onClick,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
      if (!isConfirming) return;
      const timer = setTimeout(() => {
        setIsConfirming(false);
      }, 3500);
      return () => clearTimeout(timer);
    }, [isConfirming]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || isLoading) return;

      if (requireConfirm && !isConfirming) {
        e.preventDefault();
        e.stopPropagation();
        setIsConfirming(true);
        return;
      }

      if (isConfirming) {
        setIsConfirming(false);
      }

      onClick?.(e);
    };

    const activeVariant = isConfirming ? confirmVariant : variant;

    const baseStyles =
      'inline-flex items-center justify-center font-mono font-medium transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-command-primary focus-visible:ring-offset-1 focus-visible:ring-offset-command-bg select-none disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed uppercase tracking-wider text-xs border';

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'h-6 px-2 py-0.5 text-[10px] gap-1.5 rounded-[1px]',
      md: 'h-8 px-3 py-1 text-xs gap-2 rounded-[2px]',
      lg: 'h-9 px-4 py-1.5 text-xs gap-2.5 rounded-[2px]',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-command-primary text-black border-command-primary hover:bg-command-primary-hover active:bg-command-primary/90 font-semibold',
      secondary:
        'bg-command-raised text-command-text border-command-border hover:bg-command-raised-hover hover:border-command-border-strong active:bg-command-panel',
      danger:
        'bg-command-critical text-command-heading border-command-critical hover:bg-command-critical/80 active:bg-command-critical/90 font-semibold',
      ghost:
        'bg-transparent text-command-muted border-transparent hover:text-command-text hover:bg-command-raised active:bg-command-panel',
      confirm:
        'bg-command-warning text-black border-command-warning hover:bg-command-warning/80 active:bg-command-warning/90 font-bold',
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isLoading}
        onClick={handleClick}
        className={cn(baseStyles, sizeStyles[size], variantStyles[activeVariant], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : isConfirming ? (
          <AlertCircle className="w-3.5 h-3.5 text-black" aria-hidden="true" />
        ) : (
          icon
        )}
        <span>{isConfirming ? confirmText : children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';
