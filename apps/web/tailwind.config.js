/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // storm night: blue-black to deep navy
        ink: { 950: '#04070d', 900: '#070c17', 850: '#0a1220', 800: '#0e1829', 700: '#162338', 600: '#223350' },
        // "volt" = lightning amber (primary accent: actions, focus, active nav)
        volt: { DEFAULT: '#f5a524', soft: '#ffc766', deep: '#c77a0a' },
        // "plasma" = electric storm blue (secondary accent: lightning channels, data)
        plasma: { DEFAULT: '#5aa9ff', soft: '#a9d1ff', deep: '#2563eb' },
        ember: { DEFAULT: '#ff7a1a', soft: '#ffa45c' },
        sev: { green: '#22c55e', yellow: '#facc15', orange: '#fb923c', red: '#ef4444' },
        // shadcn tokens (CSS variables) for components/ui
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(245,165,36,.3), 0 0 26px -4px rgba(245,165,36,.4)',
        violet: '0 0 0 1px rgba(90,169,255,.3), 0 0 26px -4px rgba(90,169,255,.4)',
        storm: '0 20px 60px -20px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.05)',
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(.6)', opacity: '1' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
        flash: { '0%,100%': { opacity: '0' }, '6%': { opacity: '1' }, '12%': { opacity: '.2' }, '18%': { opacity: '.8' } },
        drift: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        rain: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '-120px 600px' } },
      },
      animation: { pulseRing: 'pulseRing 1.6s ease-out infinite', flash: 'flash 1.4s ease-out', drift: 'drift 90s linear infinite', rain: 'rain .6s linear infinite' },
    },
  },
  plugins: [],
};
