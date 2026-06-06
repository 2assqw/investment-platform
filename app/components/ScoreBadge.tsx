'use client';
import { motion } from 'framer-motion';

function rating(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: 'Strong Buy', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (score >= 80) return { label: 'Buy', color: 'text-green-600', bg: 'bg-green-50' };
  if (score >= 65) return { label: 'Hold', color: 'text-amber-600', bg: 'bg-amber-50' };
  if (score >= 50) return { label: 'Watch', color: 'text-orange-600', bg: 'bg-orange-50' };
  return { label: 'Avoid', color: 'text-red-600', bg: 'bg-red-50' };
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const r = rating(score);
  const dims = { sm: 'w-14 h-14 text-lg', md: 'w-20 h-20 text-2xl', lg: 'w-28 h-28 text-4xl' };
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
      className={`${dims[size]} rounded-2xl ${r.bg} flex flex-col items-center justify-center font-bold ${r.color}`}
    >
      <span className="leading-none">{score}</span>
      <span className={`${size === 'sm' ? 'text-[7px]' : 'text-[9px]'} leading-none mt-0.5 opacity-70`}>{r.label}</span>
    </motion.div>
  );
}

export function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const r = rating(value);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">{label}</span>
        <span className={`font-semibold ${r.color}`}>{value}</span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, delay: 0.3 }}
          className={`h-full rounded-full ${r.color.replace('text', 'bg')}`}
        />
      </div>
    </div>
  );
}
