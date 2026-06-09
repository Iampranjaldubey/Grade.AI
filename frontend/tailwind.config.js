/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A5F',
          50: '#E8EEF5',
          100: '#D1DDE9',
          200: '#A3BBD4',
          300: '#7599BE',
          400: '#4777A9',
          500: '#1E3A5F',
          600: '#182E4C',
          700: '#122239',
          800: '#0C1726',
          900: '#060B13',
        },
        accent: {
          DEFAULT: '#2E86AB',
          50: '#E9F4F9',
          100: '#D3E9F3',
          200: '#A7D3E7',
          300: '#7BBDDB',
          400: '#4FA7CF',
          500: '#2E86AB',
          600: '#256B89',
          700: '#1C5067',
          800: '#133544',
          900: '#0A1A22',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
