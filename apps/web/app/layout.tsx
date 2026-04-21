import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-context";
import { TrainsProvider } from "@/components/trains-context";
import { NavBar } from "@/components/nav-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Amtrak Live Tracker",
  description:
    "Live map of every active Amtrak train in the US, updating in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-full flex-col bg-[#0b1220] text-[#e5edf7]">
        <AuthProvider>
          <TrainsProvider>
            <NavBar />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </TrainsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
