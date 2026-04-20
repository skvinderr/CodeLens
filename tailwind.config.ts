import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        codelens: {
          canvas: '#0b1118',
          panel: '#121c26',
          border: '#2b3d4f',
          text: '#e6eef7',
          muted: '#9eb2c6',
          accent: '#1dc2dd',
          success: '#1dc77e',
          warning: '#f0aa33',
          danger: '#ff6a6a',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 16px 40px rgba(0, 0, 0, 0.38)',
      },
    },
  },
  plugins: [],
}

export default config