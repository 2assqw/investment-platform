import Navbar from '@/app/components/Navbar';
import { ScoreBadge, ScoreBar } from '@/app/components/ScoreBadge';
import { api } from '@/app/lib/api';
import Link from 'next/link';
import { ArrowUp, ArrowDown, Shield, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';

async function getData(ticker: string) {
  try {
    const [metrics, explain] = await Promise.all([
      api.metrics(ticker),
      api.explain(ticker),
    ]);
    return { metrics, explain };
  } catch { return null; }
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const data = await getData(ticker);
  if (!data) return <div className="p-24 text-center text-neutral-500">Unable to load data for {ticker}</div>;

  const { metrics: m, explain: e } = data;
  const q = m.breakdown?.quality ?? {};
  const g = m.breakdown?.growth ?? {};
  const r = m.breakdown?.risk ?? {};

  const financeCards = [
    { label: 'ROE', value: q.roe?.value?.toFixed(0) + '%', desc: q.roe?.value > 20 ? 'Excellent' : 'Good', icon: TrendingUp },
    { label: 'FCF Margin', value: q.fcfMargin?.value?.toFixed(0) + '%', desc: q.fcfMargin?.value > 20 ? 'Excellent' : 'Good', icon: DollarSign },
    { label: 'Altman Z', value: r.altmanZ?.value?.toFixed(2), desc: r.altmanZ?.value > 3 ? 'Very Safe' : 'Safe', icon: Shield },
    { label: 'Debt Ratio', value: q.debtRatio?.value?.toFixed(0) + '%', desc: q.debtRatio?.value < 40 ? 'Low' : 'Moderate', icon: AlertTriangle },
  ];

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <section className="mb-16">
          <div className="flex items-start gap-8">
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-neutral-900 mb-2">{ticker.toUpperCase()}</h1>
              <p className="text-lg text-neutral-500 mb-6">{e.contributions ? `Quality ${m.scores.quality} · Growth ${m.scores.growth} · Valuation ${m.scores.valuation} · Risk ${m.scores.risk}` : ''}</p>
              <div className="flex items-center gap-3">
                {m.industrySupport.level === 'PASS' && <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">PASS</span>}
                {e.trust && <span className="text-sm text-neutral-500">Confidence {e.trust.score}</span>}
              </div>
            </div>
            <ScoreBadge score={m.scores.overall} size="lg" />
          </div>
        </section>

        {/* Four Pillars */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Four Pillars</h2>
          <div className="space-y-4">
            <ScoreBar label="Quality" value={m.scores.quality} />
            <ScoreBar label="Growth" value={m.scores.growth} />
            <ScoreBar label="Valuation" value={m.scores.valuation} />
            <ScoreBar label="Risk" value={m.scores.risk} />
          </div>
        </section>

        {/* Snapshot Cards */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Investment Snapshot</h2>
          <div className="grid grid-cols-4 gap-4">
            {financeCards.map(c => (
              <div key={c.label} className="bg-white border border-neutral-100 rounded-xl p-5">
                <c.icon size={20} className="text-neutral-400 mb-3" />
                <p className="text-2xl font-bold text-neutral-900">{c.value}</p>
                <p className="text-sm text-neutral-500">{c.label}</p>
                <p className="text-xs text-green-600 mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why This Score */}
        {e.contributions && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold mb-6">Why This Score</h2>
            <div className="space-y-2">
              {Object.entries(e.contributions).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2 border-b border-neutral-50">
                  <span className="text-neutral-600 capitalize">{k}</span>
                  <span className="font-semibold">+{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 font-bold text-lg">
                <span>Overall</span>
                <span>{m.scores.overall}</span>
              </div>
            </div>
          </section>
        )}

        {/* Strengths & Risks */}
        <section className="mb-16 grid grid-cols-2 gap-12">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-green-700">Strengths</h2>
            <ul className="space-y-2">
              {e.strengths.map(s => (
                <li key={s} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="text-green-500 mt-0.5">✓</span> {s.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4 text-red-600">Risks</h2>
            <ul className="space-y-2">
              {e.weaknesses.map(w => (
                <li key={w} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="text-red-400 mt-0.5">⚠</span> {w.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Related */}
        <section>
          <h2 className="text-xl font-semibold mb-6">Related Companies</h2>
          <div className="flex gap-3">
            {['AMD', 'TSM', 'AVGO', 'INTC'].filter(t => t !== ticker.toUpperCase()).map(t => (
              <Link key={t} href={`/company/${t}`} className="px-4 py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 text-sm transition-colors">
                {t}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
