/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        command: {
          bg: 'var(--color-bg-base)',
          surface: 'var(--color-bg-surface)',
          panel: 'var(--color-bg-panel)',
          card: 'var(--color-bg-card)',
          border: 'var(--color-border)',
          'border-subtle': 'var(--color-border-subtle)',
          'border-strong': 'var(--color-border-strong)',
          muted: 'var(--color-text-muted)',
          subdued: 'var(--color-text-subdued)',
          text: 'var(--color-text-base)',
          heading: 'var(--color-text-heading)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
          'primary-dim': 'var(--color-primary-dim)',
          nominal: 'var(--color-status-nominal)',
          warning: 'var(--color-status-warning)',
          critical: 'var(--color-status-critical)',
          info: 'var(--color-status-info)',
          unknown: 'var(--color-status-unknown)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        tactical: '0 0 15px -3px rgba(0, 229, 255, 0.15)',
        alert: '0 0 20px -3px rgba(239, 68, 68, 0.25)',
        card: '0 4px 12px 0 rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [],
}
