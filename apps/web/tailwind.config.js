/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05070d', 900: '#080c17', 850: '#0b1120', 800: '#0f172a', 700: '#1a2438', 600: '#26334d' },
        volt: { DEFAULT: '#22d3ee', soft: '#67e8f9', deep: '#0891b2' },
        plasma: { DEFAULT: '#a78bfa', soft: '#c4b5fd', deep: '#7c3aed' },
        sev: { green: '#22c55e', yellow: '#facc15', orange: '#fb923c', red: '#ef4444' },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,.25), 0 0 24px -4px rgba(34,211,238,.35)',
        violet: '0 0 0 1px rgba(167,139,250,.3), 0 0 24px -4px rgba(167,139,250,.4)',
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(.6)', opacity: '1' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
        flash: { '0%,100%': { opacity: '0' }, '10%': { opacity: '1' } },
      },
      animation: { pulseRing: 'pulseRing 1.6s ease-out infinite', flash: 'flash 0.6s ease-out' },
    },
  },
  plugins: [],
};
