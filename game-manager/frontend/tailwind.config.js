/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        theme: {
          app: 'var(--color-app-background)',
          sidebar: 'var(--color-sidebar)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          text: 'var(--color-text)',
          muted: 'var(--color-muted-text)',
          primary: 'var(--color-primary-button)',
          'primary-hover': 'var(--color-hovered-primary-button)',
          secondary: 'var(--color-secondary-button)',
          'secondary-hover': 'var(--color-hovered-secondary-button)',
          accent: 'var(--color-secondary-accent)',
          'secondary-text': 'var(--color-secondary-text)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          error: 'var(--color-error)',
          info: 'var(--color-info)',
        },
      },
    },
  },
  plugins: [],
}

