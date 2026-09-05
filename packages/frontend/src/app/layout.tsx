import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '../components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Celesnity — Factory Data Platform',
  description: 'Industrial Laundry Factory Traceability & Operations Data Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-slate-950 text-slate-100 antialiased">
      <body className={`${inter.className} min-h-screen bg-slate-950 flex flex-col`}>
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Celesnity Technical Assessment — Factory Operations Data Platform</span>
            <span className="font-mono text-slate-600">6-Station Linen Processing Pipeline</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
