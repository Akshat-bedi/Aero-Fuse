/**
 * Utility functions for AirOps DSS
 */

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Formats a Date object or ISO string to Zulu (UTC) military time: HHMMZ
 */
export function formatTimeZulu(dateInput?: string | Date): string {
  const date = dateInput ? new Date(dateInput) : new Date();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}${minutes}Z`;
}

/**
 * Formats a number with safety threshold coloring class
 */
export function getFuelStatusClass(remainingPct: number): string {
  if (remainingPct <= 20) return 'text-command-critical';
  if (remainingPct <= 40) return 'text-command-warning';
  return 'text-command-nominal';
}
