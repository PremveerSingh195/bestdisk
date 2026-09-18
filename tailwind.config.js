/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // macOS-inspired palette — kept in sync with the CSS variables in index.css
        'mac-bg': 'var(--bg-primary)',
        'mac-bg-secondary': 'var(--bg-secondary)',
        'mac-glass': 'var(--bg-glass)',
        'mac-hover': 'var(--bg-hover)',
        'mac-border': 'var(--border)',
        'mac-text': 'var(--text-primary)',
        'mac-text-secondary': 'var(--text-secondary)',
        'mac-text-tertiary': 'var(--text-tertiary)',
        'mac-blue': 'var(--accent-blue)',
        'mac-green': 'var(--accent-green)',
        'mac-orange': 'var(--accent-orange)',
        'mac-red': 'var(--accent-red)',
        'mac-purple': 'var(--accent-purple)',
        'mac-yellow': 'var(--accent-yellow)',
        'mac-teal': 'var(--accent-teal)'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Helvetica Neue',
          'Inter',
          'sans-serif'
        ],
        mono: ['SF Mono', 'ui-monospace', 'Menlo', 'monospace']
      },
      fontSize: {
        label: ['11px', { lineHeight: '13px' }],
        body: ['13px', { lineHeight: '18px' }],
        title: ['17px', { lineHeight: '22px' }]
      },
      spacing: {
        // 8px base unit
        1: '8px',
        2: '16px',
        3: '24px',
        4: '32px',
        5: '40px',
        6: '48px'
      },
      transitionTimingFunction: {
        mac: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'slide-up': 'slide-up 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'fade-in': 'fade-in 200ms ease-out',
        'scale-in': 'scale-in 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: []
}
