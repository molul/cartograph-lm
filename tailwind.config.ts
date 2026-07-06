import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './app/**/*.{vue,js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1B2430',
          light: '#26313F',
          lighter: '#3A4759',
        },
        paper: {
          DEFAULT: '#F7F3EA',
          dark: '#EDE6D6',
        },
        brass: {
          DEFAULT: '#B08D57',
          light: '#C7A876',
          dark: '#8C6F41',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
