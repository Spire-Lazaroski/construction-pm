/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: "#F7F8FA",
        ink: {
          50: "#F4F6F8", 100: "#E7EBEF", 200: "#CBD3DC", 300: "#9FADBD",
          400: "#6B7A8F", 500: "#4B5A70", 600: "#374559", 700: "#28323F",
          800: "#1B222C", 900: "#12161C",
        },
        blueprint: {
          50: "#EEF3FC", 100: "#D7E3F7", 200: "#AFC7EF", 300: "#7FA5E4",
          400: "#4F7FD6", 500: "#2E5FBF", 600: "#22488F", 700: "#1B3A73",
          800: "#152C58", 900: "#101F3F",
        },
        safety: {
          50: "#FFF3EA", 100: "#FFE1C7", 300: "#FFAD66", 500: "#E8681E",
          600: "#C2530F", 700: "#9C420C",
        },
        status: {
          green: "#1E8E5A",
          amber: "#C2760F",
          red: "#C2410F",
        },
      },
      boxShadow: {
        panel: "0 1px 2px 0 rgba(18,22,28,0.04), 0 1px 6px -2px rgba(18,22,28,0.06)",
        pop: "0 10px 30px -10px rgba(18,22,28,0.25)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
}
