import type { Config } from 'tailwindcss';

const config: Config = {
  // relative: caminhos resolvidos a partir deste arquivo, não da pasta onde o servidor foi iniciado
  content: { relative: true, files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'] },
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FAF6EE',
          100: '#F2E8D0',
          200: '#E5D1A1',
          300: '#D4B97E',
          400: '#C9A96E',
          500: '#C9A96E',
          600: '#A67C52',
          700: '#8A6340',
          800: '#6E4D30',
          900: '#523822',
          950: '#2D1F12',
        },
        dark: {
          DEFAULT: '#0A0A0F',
          50: '#1A1A24',
          100: '#121218',
          200: '#0F0F14',
          300: '#0A0A0F',
          400: '#080810',
          500: '#050508',
        },
        panel: '#121218',
        elevated: '#1A1A24',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Cinzel', 'serif'],
        body: ['Outfit', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.4s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(201, 169, 110, 0.05)' },
          '100%': { boxShadow: '0 0 40px rgba(201, 169, 110, 0.15)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'brand': '0 0 40px rgba(201, 169, 110, 0.08)',
        'brand-lg': '0 0 60px rgba(201, 169, 110, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
