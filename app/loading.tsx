// Shown while the games board is fetched server-side. Mirrors the real card
// layout so the page doesn't jump when the data lands.

export default function Loading() {
  return (
    <div className="min-h-screen max-w-md mx-auto px-4 pt-4 pb-28">
      <div className="flex items-baseline justify-between mb-3">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>

      {/* Sport filters */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-20 rounded-xl shrink-0" />
        ))}
      </div>

      {/* Game cards */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-rim rounded-2xl overflow-hidden">
            <div className="px-3.5 py-2.5 bg-layer border-b border-rim flex justify-between">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
            <div className="px-3.5 pt-2.5 pb-1">
              <div className="skeleton h-1.5 w-full rounded-full" />
            </div>
            <div className="grid grid-cols-2">
              {[0, 1].map((c) => (
                <div key={c} className={`flex flex-col items-center py-4 gap-1.5 ${c === 1 ? 'border-l border-rim' : ''}`}>
                  <div className="skeleton w-12 h-12 rounded-full" />
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-5 w-20 rounded" />
                  <div className="skeleton h-2.5 w-14 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
