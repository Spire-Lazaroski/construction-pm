/** @type {import('tailwindcss').Config} */
// Palette: neutral slate ground, one corporate blue, status colours used only for status.
// `blueprint` and `safety` keep their old names so older screens pick up the new look.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // No monospace look anywhere: numbers line up via tabular-nums instead.
        mono: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: "#F4F5F7",
        navy: { DEFAULT: "#1B3A5C", 700: "#152E49", 800: "#10233A" },
        ink: {
          50: "#F4F6F8", 100: "#E2E5EA", 200: "#D3D8DF", 300: "#8A94A3",
          400: "#5E6A7B", 500: "#4A5668", 600: "#3D4A5C", 700: "#28323F",
          800: "#152030", 900: "#0F1822",
        },
        line: { DEFAULT: "#E2E5EA", soft: "#EEF0F3" },
        blueprint: {
          50: "#E9EFF7", 100: "#D5E1F0", 200: "#B4C9E4", 300: "#8AAAD3",
          400: "#4E7BB5", 500: "#2E62A3", 600: "#1F4F8A", 700: "#1A4274",
          800: "#15355E", 900: "#10233A",
        },
        safety: {
          50: "#FCEBE9", 100: "#F8D5D1", 300: "#E58E84", 500: "#C9372B",
          600: "#B42318", 700: "#8F1C13",
        },
        status: {
          green: "#1E7148", greenBg: "#E7F3EC",
          amber: "#9A5B00", amberBg: "#FBF1DF",
          red: "#B42318", redBg: "#FCEBE9",
        },
      },
      boxShadow: {
        panel: "0 1px 2px 0 rgba(21,32,48,0.04)",
        pop: "0 12px 32px -8px rgba(21,32,48,0.22)",
      },
      borderRadius: { xl2: "10px" },
    },
  },
  plugins: [],
}
