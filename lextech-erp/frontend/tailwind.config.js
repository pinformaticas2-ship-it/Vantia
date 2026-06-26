// ...existing code...
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        inter: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to:   { opacity: "1", transform: "translateY(0)   scale(1)"    },
        },
        "overlay-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "modal-in": {
          from: { opacity: "0", transform: "translateY(20px) scale(0.97)" },
          to:   { opacity: "1", transform: "translateY(0)    scale(1)"    },
        },
        "page-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "card-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in":    "fade-in 0.12s ease-out both",
        "overlay-in": "overlay-in 0.2s ease-out both",
        "modal-in":   "modal-in 0.32s cubic-bezier(0.16,1,0.3,1) both",
        "page-in":    "page-in 0.28s cubic-bezier(0.16,1,0.3,1) both",
        "card-in":    "card-in 0.38s cubic-bezier(0.16,1,0.3,1) both",
        "card-in-1":  "card-in 0.38s cubic-bezier(0.16,1,0.3,1) 55ms both",
        "card-in-2":  "card-in 0.38s cubic-bezier(0.16,1,0.3,1) 115ms both",
        "card-in-3":  "card-in 0.38s cubic-bezier(0.16,1,0.3,1) 185ms both",
      },
    },
  },
  plugins: [],
}
// ...existing code...