import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  shortcut?: string;
  className?: string;
  delayMs?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  shortcut,
  className,
  delayMs = 150,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    const t = setTimeout(() => setIsVisible(true), delayMs);
    setTimer(t);
  };

  const hide = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, {
        'aria-describedby': isVisible ? 'tactical-tooltip' : undefined,
      })}

      {isVisible && (
        <div
          id="tactical-tooltip"
          role="tooltip"
          className={cn(
            'absolute z-50 px-2.5 py-1 text-[11px] font-sans font-medium text-command-heading bg-command-raised border border-command-border-strong rounded shadow-lg whitespace-nowrap pointer-events-none select-none animate-in fade-in zoom-in-95 duration-100 flex items-center gap-1.5',
            positionStyles[position],
            className,
          )}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="px-1 py-0.2 bg-command-bg/90 border border-command-border text-command-primary text-[10px] font-mono rounded">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
};
