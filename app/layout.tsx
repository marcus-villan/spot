import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./components/theme-provider";
// This is the root layout for the SPOT application. It sets up the global styles, fonts, and metadata for the application. The layout wraps all pages and provides a consistent structure and styling across the app.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spot — Facility Reporting",
  description: "Report facility issues and track maintenance progress.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="light"
      data-theme-preference="system"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var r=document.documentElement;var p=localStorage.getItem("spot-theme")||"system";var d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;r.dataset.themePreference=p;r.dataset.theme=d;var u=JSON.parse(localStorage.getItem("spot-ui-preferences")||"{}");r.dataset.density=u.density==="compact"?"compact":"comfortable";r.dataset.motion=u.reduceMotion===true?"reduce":"full"}catch(e){}})()` }} />
      </head>
      <body><ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider></body>
    </html>
  );
}
