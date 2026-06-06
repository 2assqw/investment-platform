import Navbar from '@/components/Navbar';
import { FlaskConical, Brain, Scale, BarChart3, BookOpen } from 'lucide-react';

const cards = [
  { title: 'Factor Lab', desc: '11 factors (3 production, 8 experimental)', icon: FlaskConical },
  { title: 'Adaptive Weights', desc: 'Valuation α=7, dynamic allocation active', icon: Brain },
  { title: 'Hypotheses', desc: '7 investment theses, 2 validated', icon: Scale },
  { title: 'Model Health', desc: '3 validated factors, 3 unvalidated', icon: BarChart3 },
  { title: 'Research Notes', desc: '5 notes: banks, REITs, energy, technology', icon: BookOpen },
];

export default function ResearchPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Research</h1>
        <p className="text-neutral-500 mb-12">Advanced quantitative research tools for factor discovery and model validation.</p>
        <div className="grid grid-cols-3 gap-6 mb-16">
          {cards.map(c => (
            <div key={c.title} className="bg-white border border-neutral-100 rounded-2xl p-8">
              <c.icon size={24} className="text-neutral-400 mb-4" />
              <h3 className="font-semibold text-lg mb-1">{c.title}</h3>
              <p className="text-sm text-neutral-500">{c.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-12 text-center">
          <h2 className="text-2xl font-semibold mb-4">V2.0-V5.0: Price-Dependent Modules</h2>
          <p className="text-neutral-500 max-w-xl mx-auto">
            Alpha Validation, Factor Backtesting, Adaptive Scoring, and Portfolio Backtesting
            are fully implemented and will activate automatically once the price_history table
            accumulates 365+ days of daily price data. Current: 507 rows across 1 ticker.
          </p>
        </div>
      </main>
    </>
  );
}
