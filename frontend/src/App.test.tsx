import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '@/App';
import { formatTimeZulu } from '@/lib/utils';
import { serviceConfig } from '@/services/config';

describe('App', () => {
  it('renders the initial AirOps DSS scaffold without crashing', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1, name: /AirOps DSS/i });
    expect(heading).toBeInTheDocument();
  });

  it('validates path aliases and utility functions', () => {
    const zuluTime = formatTimeZulu(new Date('2026-10-17T12:30:00Z'));
    expect(zuluTime).toBe('1230Z');
    expect(serviceConfig.dataSource).toBe('mock');
    expect(serviceConfig.isMock).toBe(true);
  });
});
