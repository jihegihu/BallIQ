'use client';

import { useState, useEffect } from 'react';
import { useOnboardingStore } from '@/lib/onboardingStore';

const SLIDES = [
  {
    icon: '🏆',
    title: 'Welcome to BallIQ',
    subtitle: 'Sports picks. Elo ratings.',
    body: 'BallIQ turns sports prediction into a skill game. No money — just your brain vs the market. The better you read the odds, the higher you climb.',
    extra: null,
  },
  {
    icon: '◆',
    title: 'Your Elo Rating',
    subtitle: 'Difficulty = odds. Reward = accuracy.',
    body: 'Everyone starts at 1,200 — the chess standard. Pick an underdog right: big gain. Miss a favorite: bigger loss. The market sets how hard each pick is.',
    extra: (
      <div className="w-full mt-3 space-y-1.5">
        {[
          { label: 'Elite',         range: '2000+', color: '#EF4444', pct: 100 },
          { label: 'Expert',        range: '1600–2000', color: '#F97316', pct: 80 },
          { label: 'Advanced',      range: '1200–1600', color: '#A78BFA', pct: 60 },
          { label: 'Intermediate',  range: '800–1200',  color: '#94A3B8', pct: 40 },
          { label: 'Rookie',        range: '0–800',     color: '#64748B', pct: 20 },
        ].map(({ label, range, color, pct }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-right text-[10px] font-black" style={{ color }}>{label}</div>
            <div className="flex-1 h-1.5 bg-layer rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color + '99' }} />
            </div>
            <div className="w-20 text-[9px] text-dim">{range}</div>
          </div>
        ))}
        <p className="text-center text-[10px] text-accent font-bold mt-1">You start at Advanced ◆ 1,200</p>
      </div>
    ),
  },
  {
    icon: '🎯',
    title: 'Ready to Pick',
    subtitle: 'Three ways to predict. One rating to rule them all.',
    body: null,
    extra: (
      <div className="w-full mt-3 space-y-2.5">
        {[
          { label: 'Moneyline',   desc: 'Pick which team wins outright.',           icon: '🏅' },
          { label: 'Spread',      desc: 'Pick a team to win by more than the line.', icon: '📏' },
          { label: 'Over / Under', desc: 'Predict total points above or below.',     icon: '📊' },
        ].map(({ label, desc, icon }) => (
          <div key={label} className="flex items-start gap-3 bg-layer rounded-xl px-3 py-2.5">
            <span className="text-lg leading-none mt-0.5">{icon}</span>
            <div>
              <p className="text-xs font-black text-ink">{label}</p>
              <p className="text-[11px] text-sub mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-dim text-center pt-1">Your Elo updates automatically when games settle.</p>
      </div>
    ),
  },
];

export default function OnboardingModal() {
  const { hasSeenOnboarding, isOpen, open, close } = useOnboardingStore();
  const [slide, setSlide] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only check store after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !hasSeenOnboarding) open();
  }, [mounted, hasSeenOnboarding, open]);

  if (!isOpen) return null;

  const current = SLIDES[slide];
  const isLast  = slide === SLIDES.length - 1;

  function handleNext() {
    if (isLast) { close(); setSlide(0); }
    else setSlide((s) => s + 1);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-card border border-rim rounded-2xl p-6 pb-7 shadow-2xl">
        {/* Skip */}
        <button
          onClick={() => { close(); setSlide(0); }}
          className="absolute top-4 right-4 text-dim hover:text-sub text-xs font-semibold"
        >
          Skip
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-3">
          <span className="text-4xl">{current.icon}</span>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-black text-ink text-center leading-tight">
          {current.title}
        </h2>
        <p className="text-[11px] text-accent font-bold text-center uppercase tracking-widest mt-1 mb-3">
          {current.subtitle}
        </p>

        {/* Body */}
        {current.body && (
          <p className="text-sm text-sub text-center leading-relaxed">{current.body}</p>
        )}

        {/* Slide-specific extra content */}
        {current.extra}

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-5 mb-4">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === slide ? 'w-5 bg-accent' : 'w-1.5 bg-rim'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          {slide > 0 && (
            <button
              onClick={() => setSlide((s) => s - 1)}
              className="flex-1 py-2.5 rounded-xl border border-rim text-sm font-bold text-sub hover:text-ink transition"
            >
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)' }}
          >
            {isLast ? "Let's Go →" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
