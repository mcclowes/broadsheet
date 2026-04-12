import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { OfflineSync } from "./components/offline-sync";
import { OfflineIndicator } from "./components/offline-indicator";
import { CommandPalette } from "./components/command-palette";
import "./globals.scss";

export const metadata: Metadata = {
  title: "Broadsheet",
  description: "Save articles. Read them cleanly. Keep them.",
  referrer: "no-referrer",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Broadsheet",
  },
};

export const viewport: Viewport = {
  themeColor: "#b4451f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <CommandPalette />
          <ServiceWorkerRegister />
          <OfflineSync />
          <OfflineIndicator />
        </body>
      </html>
    </ClerkProvider>
  );
}
