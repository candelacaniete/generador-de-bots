import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Generador de chatbots",
  description:
    "Creá chatbots con IA para tu negocio a partir de un PDF o Word.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold text-slate-900">
              BotGen
            </Link>
            <Link
              href="/nuevo"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Nuevo bot
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
