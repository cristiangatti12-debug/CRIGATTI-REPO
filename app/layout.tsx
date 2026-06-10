import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Vela.ai",
  description: "Your personal AI investment portfolio manager",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:          true,
    statusBarStyle:   "black-translucent",
    title:            "Vela.ai",
  },
  icons: {
    icon:  [
      { url: "/icon-192-v2.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512-v2.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192-v2.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/icon-192-v2.png",
  },
};

export const viewport: Viewport = {
  themeColor:    "#1E3A5F",
  width:         "device-width",
  initialScale:   1,
  maximumScale:   1,
  userScalable:  false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Force fresh favicon — ?v=2 busts browser cache */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192-v2.png" />
        <link rel="shortcut icon" type="image/png" href="/icon-192-v2.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192-v2.png" />
        {/* iOS PWA full-screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Force-unregister any lingering stale service workers (vela-v3 and earlier) */}
        <script dangerouslySetInnerHTML={{
          __html: `navigator.serviceWorker?.getRegistrations().then(regs => regs.forEach(r => r.unregister()));`
        }} />
      </head>
      <body className="min-h-full">
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js');
              });
            }
          `
        }} />
      </body>
    </html>
  );
}
