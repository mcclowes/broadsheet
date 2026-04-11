import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.scss";

export const metadata: Metadata = {
  title: "Broadsheet",
  description: "Save articles. Read them cleanly. Keep them.",
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
