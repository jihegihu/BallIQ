import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import DBHydrator from "@/components/DBHydrator";
import BottomNav from "@/components/BottomNav";
import EloHeader from "@/components/EloHeader";
import ThemeProvider from "@/components/ThemeProvider";
import OnboardingModal from "@/components/OnboardingModal";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BallIQ",
  description: "Chess-style Elo sports picks platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
        <head>
          {/* Apply stored theme before React hydrates to prevent flash */}
          <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('balliq-theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}` }} />
        </head>
        <body className="min-h-full flex flex-col bg-base">
          <ThemeProvider>
            <DBHydrator />
            <OnboardingModal />
            <EloHeader />
            {/* pt-11 reserves space for the fixed top bar */}
            <div className="flex-1 pt-11">
              {children}
            </div>
            <BottomNav />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
