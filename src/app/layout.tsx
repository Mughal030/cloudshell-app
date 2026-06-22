import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Cinzel, Cinzel_Decorative } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

// Cinzel — Roman-inscription-style serif display font, used for the
// Warland MMORPG-themed auth pages (hero headings, wordmark, labels).
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

// Cinzel Decorative — ornamental variant for the occasional flourish.
const cinzelDecorative = Cinzel_Decorative({
  variable: "--font-cinzel-deco",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jasbol Hack — Forged Terminal IDE",
  description:
    "Professional web-based terminal IDE with intelligent command highlighting, file management, Docker support, and tool installation by Jasbol Hack.",
  keywords: [
    "Jasbol Hack",
    "CloudShell",
    "terminal",
    "IDE",
    "web terminal",
    "Warland",
    "Docker",
    "development",
  ],
  authors: [{ name: "Jasbol Hack" }],
  applicationName: "Jasbol Hack",
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: "/favicon.png",
    apple: "/jasbol-hack-logo.png",
  },
  robots: {
    index: false, // Do not index — this is a private IDE
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07040A" },
    { media: "(prefers-color-scheme: light)", color: "#07040A" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${cinzel.variable} ${cinzelDecorative.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
