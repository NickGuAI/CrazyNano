/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome palette
        bg: '#0a0a0a',
        'bg-elevated': '#111111',
        'bg-card': '#181818',
        border: '#2a2a2a',
        'text-primary': '#ffffff',
        'text-secondary': '#888888',
        accent: '#ffffff',
        'accent-dim': '#333333',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'xs': ['11px', '1.4'],
        'sm': ['12px', '1.4'],
        'base': ['13px', '1.5'],
        'lg': ['14px', '1.5'],
        'xl': ['15px', '1.4'],
        '2xl': ['18px', '1.3'],
        '3xl': ['24px', '1.2'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
