/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        theme: {
          app: 'rgb(var(--color-app-background) / <alpha-value>)',
          sidebar: 'rgb(var(--color-sidebar) / <alpha-value>)',
          card: 'rgb(var(--color-card) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-muted-text) / <alpha-value>)',
          primary: 'rgb(var(--color-primary-button) / <alpha-value>)',
          'primary-hover': 'rgb(var(--color-hovered-primary-button) / <alpha-value>)',
          secondary: 'rgb(var(--color-secondary-button) / <alpha-value>)',
          'secondary-hover': 'rgb(var(--color-hovered-secondary-button) / <alpha-value>)',
          accent: 'rgb(var(--color-secondary-accent) / <alpha-value>)',
          'secondary-text': 'rgb(var(--color-secondary-text) / <alpha-value>)',
          success: 'rgb(var(--color-success) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          error: 'rgb(var(--color-error) / <alpha-value>)',
          info: 'rgb(var(--color-info) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
