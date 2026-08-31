/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editorial "graded paper" design system.
        // Single oxblood accent on warm paper; sage is reserved for "approved".
        paper: '#F5F3EE',
        'paper-2': '#FFFFFF',
        ink: {
          DEFAULT: '#1B2430',
          soft: '#3A4250',
        },
        oxblood: {
          DEFAULT: '#9A2B25',
          dark: '#7E211D',
        },
        sage: '#3F6C51',
        rule: '#DAD4C6',
        muted: '#6B6558',

        // ---------------------------------------------------------------
        // Semantic tokens (the single source of truth for the product UI).
        // These alias the editorial palette above so components reference
        // meaning ("surface", "content", "brand", "success") rather than raw
        // hues. Prefer these over primary/accent/gray in all new/migrated UI.
        // ---------------------------------------------------------------
        surface: {
          DEFAULT: '#FFFFFF', // cards / elevated content
          muted: '#F5F3EE', // page background (paper)
          raised: '#FBFAF7', // subtle raised panels, table headers
          sunken: '#EFECE3', // wells, inset areas
          inverse: '#1B2430', // dark ink panels
        },
        content: {
          DEFAULT: '#1B2430', // primary text (ink)
          soft: '#3A4250', // secondary text
          muted: '#6B6558', // tertiary / metadata
          inverse: '#F5F3EE', // text on dark surfaces
        },
        edge: {
          DEFAULT: '#DAD4C6', // default border (rule)
          strong: '#C4BCA9', // emphasized border / dividers
          subtle: '#EAE6DC', // hairline
        },
        brand: {
          DEFAULT: '#9A2B25', // oxblood — primary actions & grading marks
          dark: '#7E211D',
          subtle: '#F3E7E6', // tinted background
          fg: '#7E211D', // brand text on subtle bg
        },

        // Status scales — each pairs a solid, a subtle background, and an
        // AA-contrast foreground for use on that subtle background.
        success: { DEFAULT: '#3F6C51', fg: '#2E5340', subtle: '#E8F0EA' },
        warning: { DEFAULT: '#9A6B15', fg: '#7A5410', subtle: '#F6EEDA' },
        danger: { DEFAULT: '#9A2B25', fg: '#7E211D', subtle: '#F6E5E4' },
        info: { DEFAULT: '#2E5A88', fg: '#234867', subtle: '#E5EDF5' },
        processing: { DEFAULT: '#4B4397', fg: '#3A3479', subtle: '#EAE8F5' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      boxShadow: {
        // Restrained elevation ramp — prefer borders + these over heavy shadows.
        card: '0 1px 2px 0 rgba(27,36,48,0.05), 0 1px 3px -1px rgba(27,36,48,0.07)',
        raised: '0 2px 6px -1px rgba(27,36,48,0.08), 0 4px 12px -2px rgba(27,36,48,0.08)',
        overlay: '0 8px 28px -6px rgba(27,36,48,0.18), 0 4px 10px -4px rgba(27,36,48,0.12)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
