'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { ScoreBadge } from '@/components/ScoreBadge';
import { api, CompanyScore } from '@/lib/api';
import Link from 'next/link';

export default function WatchlistPage() {
  const [items, setItems] = useState<Array<{ ticker: string; score?: CompanyScore }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.watchlist.get().then(async w => {
      const enriched = await Promise.all(
        w.items.map(async i => {
          try { return { ticker: i.ticker, score: await api.company(i.ticker) }; }
          catch { return { ticker: i.ticker }; }
        })
      );
      setItems(enriched);
      setLoading(false);
    });
  }, []);

  if (loading) return <><Navbar /><div className="p-24 text-center text-neutral-400">Loading...</div></>;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Watchlist</h1>
        <p className="text-neutral-500 mb-8">Track companies you care about.</p>
        {items.length === 0 ? (
          <p className="text-neutral-400">No items in your watchlist. Use the API: POST /api/watchlist</p>
        ) : (
          <div className="space-y-3">
            {items.map(({ ticker, score }) => (
              <Link key={ticker} href={`/company/${ticker}`}
                className="flex items-center justify-between bg-white border border-neutral-100 rounded-xl p-5 hover:shadow-md transition-shadow">
                <div>
                  <p className="font-semibold text-lg">{ticker}</p>
                  {score && <p className="text-sm text-neutral-500">{score.industrySupport.level} · {score.warnings.length} warnings</p>}
                </div>
                {score && <ScoreBadge score={score.scores.overall} size="sm" />}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
