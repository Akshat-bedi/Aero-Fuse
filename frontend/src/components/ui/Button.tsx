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
      'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-command-primary focus-visible:ring-offset-1 focus-visible:ring-offset-command-bg select-none disabled:opacity-45 disabled:pointer-events-none disabled:cursor-not-allowed uppercase tracking-wider text-xs border';

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'h-7 px-2.5 py-1 text-[11px] gap-1.5 rounded',
      md: 'h-9 px-3.5 py-1.5 text-xs gap-2 rounded',
      lg: 'h-11 px-5 py-2 text-sm gap-2.5 rounded-md',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-command-primary text-black border-command-primary hover:bg-command-primary-hover active:bg-cyan-400 font-semibold shadow-tactical',
      secondary:
        'bg-command-raised text-command-text border-command-border hover:bg-command-raised-hover hover:border-command-border-strong active:bg-command-panel',
      danger:
        'bg-command-critical text-white border-command-critical hover:bg-red-600 active:bg-red-700 font-semibold shadow-alert',
      ghost:
        'bg-transparent text-command-muted border-transparent hover:text-command-text hover:bg-command-raised active:bg-command-panel',
      confirm:
        'bg-command-warning text-black border-command-warning hover:bg-amber-400 active:bg-amber-500 font-bold animate-pulse',
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
          <AlertCircle className="w-3.5 h-3.5 animate-bounce" aria-hidden="true" />
        ) : (
          icon
        )}
        <span>{isConfirming ? confirmText : children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';
