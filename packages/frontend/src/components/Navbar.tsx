'use strict';
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Factory, Activity, ShieldCheck, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Navbar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    async function checkHealth() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
        const res = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
        if (res.ok) setBackendStatus('online');
        else setBackendStatus('offline');
      } catch {
        setBackendStatus('offline');
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: '/', label: 'Overview', icon: Activity },
    { href: '/sources', label: 'Data Sources', icon: Database },
    { href: '/production', label: 'Production Lines', icon: Factory },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-linear-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
              <span className="font-bold text-white tracking-wider text-base">CL</span>
            </div>
            <div>
              <Link href="/" className="flex items-baseline space-x-1.5 group">
                <span className="text-lg font-bold bg-linear-to-r from-slate-100 via-white to-slate-300 bg-clip-text text-transparent group-hover:from-cyan-400 group-hover:to-blue-400 transition-all">
                  Celesnity
                </span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Laundry OS
                </span>
              </Link>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex space-x-1 sm:space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* System Health Badge */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${backendStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse'
                    : backendStatus === 'offline'
                      ? 'bg-rose-500'
                      : 'bg-amber-400'
                  }`}
              />
              <span className="text-slate-400 font-mono">
                {backendStatus === 'online' ? 'API Online' : backendStatus === 'offline' ? 'API Disconnected' : 'Checking...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
