import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LayoutProvider } from "@/context/LayoutContext";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: "GateShield • Enterprise Visitor & Gate Management System",
  description:
    "Advanced gate access control, vehicle tracking, Pakistani CNIC & Driving Licence OCR registration",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/gateshield-icon-light.png", type: "image/png" },
    ],
    shortcut: "/brand/gateshield-icon-light.png",
    apple: "/brand/gateshield-icon-light.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/JameelNooriNastaleeq-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('gk_theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.colorScheme = 'light';
                }
                var lang = localStorage.getItem('gk_lang');
                var activeLang = (lang === 'en' || lang === 'ur') ? lang : 'ur';
                document.documentElement.lang = activeLang;
                document.documentElement.dir = 'ltr';
                document.documentElement.dataset.lang = activeLang;
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <AuthProvider>
          <LayoutProvider>
            <LanguageProvider>{children}</LanguageProvider>
          </LayoutProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
