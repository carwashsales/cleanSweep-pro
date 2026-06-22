import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/context/settings-context";

export const metadata: Metadata = {
  title: "CleanSweep Inventory",
  description: "Inventory management for car wash supplies.",
};

export default function RootLayout({
  children,
  params: { locale }
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {

  return (
    <html lang={locale || 'ar'} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SettingsProvider>
              <FirebaseClientProvider>
                <Toaster />
                  {children}
              </FirebaseClientProvider>
            </SettingsProvider>
          </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
