'use client';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { ScoreBar } from '@/components/ScoreBadge';
import { api, CompanyScore } from '@/lib/api';

export default function ComparePage() {
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [d1, setD1] = useState<CompanyScore | null>(null);
  const [d2, setD2] = useState<CompanyScore | null>(null);
  const [loading, setLoading] = useState(false);

  async function compare() {
    if (!t1 || !t2) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([api.company(t1), api.company(t2)]);
      setD1(a); setD2(b);
    } catch { }
    setLoading(false);
  }

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-8">Compare</h1>
        <div className="flex gap-4 mb-8">
          {[t1, t2].map((t, i) => (
            <input key={i} value={t} onChange={e => i === 0 ? setT1(e.target.value.toUpperCase()) : setT2(e.target.value.toUpperCase())}
              placeholder={`Ticker ${i + 1}`} className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 text-lg focus:outline-none focus:ring-2 focus:ring-neutral-300" />
          ))}
          <button onClick={compare} disabled={loading} className="px-8 py-3 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800">
            {loading ? 'Loading...' : 'Compare'}
          </button>
        </div>
        {d1 && d2 && (
          <div className="grid grid-cols-2 gap-8">
            {[d1, d2].map((d, i) => (
              <div key={i} className="space-y-4">
                <h2 className="text-2xl font-bold">{d.ticker}</h2>
                <ScoreBar label="Quality" value={d.scores.quality} />
                <ScoreBar label="Growth" value={d.scores.growth} />
                <ScoreBar label="Valuation" value={d.scores.valuation} />
                <ScoreBar label="Risk" value={d.scores.risk} />
                <div className="text-4xl font-bold text-neutral-900 mt-4">{d.scores.overall}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
