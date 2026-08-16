/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1B2E6B',
        orange: '#E8841A',
        cream: '#F4F1EC'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      }
    }
  },
  plugins: []
};
