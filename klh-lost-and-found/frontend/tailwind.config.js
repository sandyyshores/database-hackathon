export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        campus: {
          cream: "#FAF7F2",
          sand: "#F2ECE1",
          border: "#E6DFD3",
          ink: "#1E242B",
          muted: "#5E6670",
          crimson: "#9B1B30",
          crimsonDark: "#7C1425",
          crimsonSoft: "#FDF2F4",
          sage: "#166534",
          sageSoft: "#ECFDF3",
          amber: "#B45309",
          amberSoft: "#FEF7E6"
        }
      },
      fontFamily: {
        serif: ["'Fraunces'", "Georgia", "Cambria", "serif"],
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 2px 10px rgba(30, 36, 43, 0.04), 0 1px 2px rgba(30, 36, 43, 0.03)",
        cardHover: "0 12px 28px rgba(30, 36, 43, 0.08), 0 2px 6px rgba(30, 36, 43, 0.04)"
      }
    }
  },
  plugins: []
};
