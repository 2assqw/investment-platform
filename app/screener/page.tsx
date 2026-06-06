'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/app/components/Navbar';
import { ScoreBadge } from '@/app/components/ScoreBadge';
import { api, RankingEntry } from '@/app/lib/api';
import Link from 'next/link';

export default function ScreenerPage() {
  const [results, setResults] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ qualityMin: '', growthMin: '', valuationMin: '', riskMin: '', sector: '' });

  async function search() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (filters.qualityMin) params.qualityMin = Number(filters.qualityMin);
      if (filters.growthMin) params.growthMin = Number(filters.growthMin);
      if (filters.valuationMin) params.valuationMin = Number(filters.valuationMin);
      if (filters.riskMin) params.riskMin = Number(filters.riskMin);
      if (filters.sector) params.sector = filters.sector;
      const data = await api.screener(params as any);
      setResults(data.results);
    } catch { setResults([]); }
    setLoading(false);
  }

  const F = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <input type="number" value={value} onChange={e => set(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300" />
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Screener</h1>
        <p className="text-neutral-500 mb-8">Filter stocks by quality, growth, valuation, and risk.</p>
        <div className="flex gap-4 mb-8 flex-wrap items-end">
          <F label="Quality ≥" value={filters.qualityMin} set={v => setFilters({ ...filters, qualityMin: v })} />
          <F label="Growth ≥" value={filters.growthMin} set={v => setFilters({ ...filters, growthMin: v })} />
          <F label="Valuation ≥" value={filters.valuationMin} set={v => setFilters({ ...filters, valuationMin: v })} />
          <F label="Risk ≥" value={filters.riskMin} set={v => setFilters({ ...filters, riskMin: v })} />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Sector</label>
            <select value={filters.sector} onChange={e => setFilters({ ...filters, sector: e.target.value })}
              className="px-3 py-2 rounded-lg border border-neutral-200 text-sm">
              <option value="">All</option>
              <option value="Technology">Technology</option>
              <option value="Financial Services">Financial</option>
              <option value="Energy">Energy</option>
              <option value="Healthcare">Healthcare</option>
            </select>
          </div>
          <button onClick={search} disabled={loading}
            className="px-6 py-2 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-800 transition-colors">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {results.map(r => (
              <Link key={r.ticker} href={`/company/${r.ticker}`}
                className="bg-white border border-neutral-100 rounded-xl p-5 hover:shadow-md transition-shadow flex items-center justify-between">
                <div>
                  <p className="font-semibold">{r.ticker}</p>
                  <p className="text-sm text-neutral-500">{r.company}</p>
                </div>
                <ScoreBadge score={r.overall} size="sm" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
