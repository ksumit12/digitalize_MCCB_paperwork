import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MCCB Frame QA",
  description: "Local prototype for switchboard frame install, serials, and electrical testing",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-palette="volt" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("qa-theme");var p=localStorage.getItem("qa-palette");document.documentElement.dataset.theme=t==="light"?"light":"dark";document.documentElement.dataset.palette=p==="pulse"||p==="nix"?p:"volt"}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.dataset.palette="volt"}`,
          }}
        />
      </head>
      <body className={`${sans.className} min-h-dvh bg-canvas text-ink`}>{children}</body>
    </html>
  );
}
