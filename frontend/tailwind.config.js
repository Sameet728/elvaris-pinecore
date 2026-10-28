/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark trading terminal palette
        'terminal-bg': '#0a0a0f',
        'terminal-surface': '#111118',
        'terminal-panel': '#161620',
        'terminal-border': '#1e1e2e',
        'terminal-hover': '#1a1a28',
        'vela-blue': '#4f8ef7',
        'vela-indigo': '#6c6ef7',
        'vela-green': '#26a65b',
        'vela-red': '#e74c3c',
        'vela-yellow': '#f39c12',
        'vela-orange': '#e67e22',
        'vela-text': '#e2e8f0',
        'vela-muted': '#64748b',
        'vela-dim': '#334155',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
