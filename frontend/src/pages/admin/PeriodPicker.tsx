import { presets, type Period } from './admin';

export function PeriodPicker({ tz, value, onChange }: { tz: string; value: Period; onChange: (p: Period) => void }) {
  const input = 'px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-body [color-scheme:dark]';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets(tz).map((p) => {
        const active = p.period.from === value.from && p.period.to === value.to;
        return (
          <button
            key={p.label}
            onClick={() => onChange(p.period)}
            className={`px-3 py-2 rounded-lg text-xs font-body ${active ? 'bg-brand-500/15 text-brand-400' : 'bg-white/5 text-[#8A8680] hover:text-white'}`}
          >
            {p.label}
          </button>
        );
      })}
      <input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className={input} aria-label="De" />
      <span className="text-xs text-[#5A5650]">até</span>
      <input type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className={input} aria-label="Até" />
    </div>
  );
}
