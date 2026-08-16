/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Material-3-inspired blue theme (was navy #1B2E6B / orange #E8841A /
        // cream #F4F1EC). These 3 tokens are used across every page and
        // shared component, so retheming them here cascades everywhere.
        navy: '#073c9f',
        orange: '#da3610',
        cream: '#f8f9ff',
        // Supporting tokens for the new card/chip look (dashboard, stat
        // cards). Kept small and additive — nothing above was renamed.
        'navy-container': '#2e55b8',
        'navy-chip': '#dbe1ff'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      },
      boxShadow: {
        card: '0 4px 20px rgba(46,85,184,0.08)'
      }
    }
  },
  plugins: []
};
