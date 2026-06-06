'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, TrendingUp, BarChart3, Star, Bookmark, FlaskConical } from 'lucide-react';

const links = [
  { href: '/', label: 'Discover', icon: TrendingUp },
  { href: '/screener', label: 'Screener', icon: Search },
  { href: '/compare', label: 'Compare', icon: BarChart3 },
  { href: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { href: '/research', label: 'Research', icon: FlaskConical },
];

export default function Navbar() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <Star size={20} className="text-amber-500" />
          <span>Investment Platform</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map(l => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${active ? 'bg-neutral-100 text-neutral-900 font-medium' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                <l.icon size={15} />
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
