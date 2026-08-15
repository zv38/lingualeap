/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          primary: '#ffffff',
          secondary: '#f4f4f5',
          elevated: '#e4e4e7',
          card: '#ffffff',
        },
        ink: {
          primary: '#09090b',
          secondary: '#52525b',
          muted: '#a1a1aa',
          placeholder: '#d4d4d8',
        },
        accent: {
          primary: '#000000',
          secondary: '#27272a',
          hover: '#3f3f46',
          indigo: '#27272a',
          'indigo-hover': '#000000',
        },
        status: {
          success: '#000000',
          error: '#52525b',
          warning: '#27272a',
        },
        border: {
          primary: 'rgba(0,0,0,0.08)',
          secondary: 'rgba(0,0,0,0.05)',
          input: 'rgba(0,0,0,0.12)',
        },
        dark: {
          surface: '#09090b',
          'surface-alt': '#18181b',
          elevated: '#27272a',
          card: '#18181b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        full: '9999px',
      },
      boxShadow: {
        'premium-sm': '0 1px 3px rgba(0, 0, 0, 0.06)',
        'premium-md': '0 4px 14px rgba(0, 0, 0, 0.08)',
        'premium-lg': '0 10px 34px rgba(0, 0, 0, 0.10)',
        'focus': '0 0 0 3px rgba(0, 0, 0, 0.08)',
      },
      transitionTimingFunction: {
        'premium': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slide-up 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}