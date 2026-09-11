/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
                background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        raised: 'rgb(var(--color-raised) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        protein: 'rgb(var(--color-protein) / <alpha-value>)',
        carbs: 'rgb(var(--color-carbs) / <alpha-value>)',
        fat: 'rgb(var(--color-fat) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['GoogleSans', 'system-ui', 'sans-serif'],
        serif: ['GoogleSans', 'system-ui', 'sans-serif'],
        display: ['GoogleSans', 'system-ui', 'sans-serif'],
        mono: ['GoogleSans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
