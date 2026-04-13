import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { OfflineSync } from "./components/offline-sync";
import { OfflineIndicator } from "./components/offline-indicator";
import { CommandPalette } from "./components/command-palette";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.scss";

export const metadata: Metadata = {
  title: "Broadsheet",
  description: "Save articles. Read them cleanly. Keep them.",
  referrer: "no-referrer",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Broadsheet",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#131311" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Applies the user's saved theme before hydration to prevent
              a flash of the wrong colour scheme. See src/lib/theme.ts. */}
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body>
          {children}
          <CommandPalette />
          <ServiceWorkerRegister />
          <OfflineSync />
          <OfflineIndicator />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
