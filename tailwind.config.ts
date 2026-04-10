import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
        extend: {
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        }
                },
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)'
                },
                // ═══════════════════════════════════════════════════════════════
                // SPLASH SCREEN PREMIUM ANIMATIONS
                // ═══════════════════════════════════════════════════════════════
                keyframes: {
                        // Logo entrance - smooth scale + fade
                        'splash-logo-enter': {
                                '0%': { 
                                        opacity: '0', 
                                        transform: 'scale(0.8) translateY(10px)',
                                        filter: 'blur(4px)'
                                },
                                '60%': { 
                                        opacity: '1', 
                                        transform: 'scale(1.02) translateY(0)',
                                        filter: 'blur(0px)'
                                },
                                '100%': { 
                                        opacity: '1', 
                                        transform: 'scale(1) translateY(0)',
                                        filter: 'blur(0px)'
                                },
                        },
                        // Text fade-in with subtle upward motion
                        'splash-text-enter': {
                                '0%': { 
                                        opacity: '0', 
                                        transform: 'translateY(8px)' 
                                },
                                '100%': { 
                                        opacity: '1', 
                                        transform: 'translateY(0)' 
                                },
                        },
                        // Floating background orbs
                        'splash-float-orb': {
                                '0%, 100%': { 
                                        transform: 'translate(0, 0) scale(1)',
                                        opacity: '0.5'
                                },
                                '25%': { 
                                        transform: 'translate(10px, -15px) scale(1.05)',
                                        opacity: '0.6'
                                },
                                '50%': { 
                                        transform: 'translate(-5px, -25px) scale(1.1)',
                                        opacity: '0.5'
                                },
                                '75%': { 
                                        transform: 'translate(-15px, -10px) scale(1.05)',
                                        opacity: '0.6'
                                },
                        },
                        'splash-float-orb-reverse': {
                                '0%, 100%': { 
                                        transform: 'translate(0, 0) scale(1)',
                                        opacity: '0.5'
                                },
                                '25%': { 
                                        transform: 'translate(-10px, 15px) scale(1.05)',
                                        opacity: '0.6'
                                },
                                '50%': { 
                                        transform: 'translate(5px, 25px) scale(1.1)',
                                        opacity: '0.5'
                                },
                                '75%': { 
                                        transform: 'translate(15px, 10px) scale(1.05)',
                                        opacity: '0.6'
                                },
                        },
                        // Glowing pulse effect
                        'splash-glow-pulse': {
                                '0%, 100%': { 
                                        opacity: '0.4',
                                        transform: 'scale(1)'
                                },
                                '50%': { 
                                        opacity: '0.7',
                                        transform: 'scale(1.1)'
                                },
                        },
                        'splash-glow-pulse-delayed': {
                                '0%, 100%': { 
                                        opacity: '0.3',
                                        transform: 'scale(1)'
                                },
                                '50%': { 
                                        opacity: '0.5',
                                        transform: 'scale(1.15)'
                                },
                        },
                        // Subtle logo floating
                        'splash-logo-float': {
                                '0%, 100%': { 
                                        transform: 'translateY(0)' 
                                },
                                '50%': { 
                                        transform: 'translateY(-4px)' 
                                },
                        },
                        // Loading bar sliding animation
                        'splash-loading-slide': {
                                '0%': { 
                                        transform: 'translateX(-100%)' 
                                },
                                '100%': { 
                                        transform: 'translateX(200%)' 
                                },
                        },
                        // Fade in for loading section
                        'splash-fade-in': {
                                '0%': { 
                                        opacity: '0' 
                                },
                                '100%': { 
                                        opacity: '1' 
                                },
                        },
                        // Dot pulse for loading dots
                        'splash-dot-pulse': {
                                '0%, 80%, 100%': { 
                                        opacity: '0.3',
                                        transform: 'scale(0.8)'
                                },
                                '40%': { 
                                        opacity: '1',
                                        transform: 'scale(1)'
                                },
                        },
                        // Icon subtle breathing
                        'splash-icon-breathe': {
                                '0%, 100%': { 
                                        transform: 'scale(1)',
                                        opacity: '1'
                                },
                                '50%': { 
                                        transform: 'scale(1.02)',
                                        opacity: '0.95'
                                },
                        },
                        // Credit text entrance
                        'splash-credit-enter': {
                                '0%': { 
                                        opacity: '0',
                                        transform: 'translateY(10px)'
                                },
                                '100%': { 
                                        opacity: '1',
                                        transform: 'translateY(0)'
                                },
                        },
                        // Line expand animation
                        'splash-line-expand': {
                                '0%': { 
                                        transform: 'scaleX(0)',
                                        opacity: '0'
                                },
                                '100%': { 
                                        transform: 'scaleX(1)',
                                        opacity: '1'
                                },
                        },
                        // Pulse glow for center orb
                        'splash-pulse-glow': {
                                '0%, 100%': { 
                                        opacity: '0.3',
                                        transform: 'translate(-50%, -50%) scale(1)'
                                },
                                '50%': { 
                                        opacity: '0.5',
                                        transform: 'translate(-50%, -50%) scale(1.2)'
                                },
                        },
                        // Shimmer effect for skeleton loading
                        'shimmer': {
                                '0%': { 
                                        transform: 'translateX(-100%)' 
                                },
                                '100%': { 
                                        transform: 'translateX(100%)' 
                                },
                        },
                },
                animation: {
                        'splash-logo-enter': 'splash-logo-enter 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                        'splash-text-enter': 'splash-text-enter 0.6s ease-out 0.3s forwards',
                        'splash-float-orb': 'splash-float-orb 8s ease-in-out infinite',
                        'splash-float-orb-reverse': 'splash-float-orb-reverse 10s ease-in-out infinite',
                        'splash-glow-pulse': 'splash-glow-pulse 3s ease-in-out infinite',
                        'splash-glow-pulse-delayed': 'splash-glow-pulse-delayed 3s ease-in-out 0.5s infinite',
                        'splash-logo-float': 'splash-logo-float 4s ease-in-out infinite',
                        'splash-loading-slide': 'splash-loading-slide 1.8s ease-in-out infinite',
                        'splash-fade-in': 'splash-fade-in 0.5s ease-out 0.5s forwards',
                        'splash-dot-pulse': 'splash-dot-pulse 1.4s ease-in-out infinite',
                        'splash-icon-breathe': 'splash-icon-breathe 3s ease-in-out infinite',
                        'splash-credit-enter': 'splash-credit-enter 0.6s ease-out 0.8s forwards',
                        'splash-line-expand': 'splash-line-expand 0.4s ease-out 1s forwards',
                        'splash-pulse-glow': 'splash-pulse-glow 4s ease-in-out infinite',
                        'shimmer': 'shimmer 2s ease-in-out infinite',
                },
        }
  },
  plugins: [tailwindcssAnimate],
};
export default config;
