import { useState } from 'react';
import { MEALS, TASK_BY_KEY } from '../lib/constants.js';
import { addDays, prettyDate } from '../lib/dates.js';
import SessionCard from '../components/SessionCard.jsx';
import { Card, SectionTitle } from '../components/ui.jsx';

export default function Week({ uid, data }) {
  const from = addDays(data.today, 1);
  const to = addDays(data.today, 7);
  const upcoming = data.results.filter((r) => r.date >= from && r.date <= to);
  const [open, setOpen] = useState(null);

  const dates = Array.from(new Set(upcoming.map((r) => r.date)));

  return (
    <div className="space-y-4 pb-4">
      <Card>
        <h1 className="text-2xl font-black">📅 Agle 7 din</h1>
        <p className="mt-1 text-sm font-semibold text-stone-600">
          Ye plan har phone par same hai — kisi ne "banaya" nahi, formula se banta hai. Agar tum kisi din bahar ho to abhi bata do, plan apne aap adjust ho jayega.
        </p>
      </Card>

      {dates.map((d) => (
        <div key={d}>
          <SectionTitle>{prettyDate(d, data.today)}</SectionTitle>
          <div className="space-y-2">
            {upcoming.filter((r) => r.date === d).map((r) => {
              const mine = Object.entries(r.plan.assign).filter(([, u]) => u === uid).map(([t]) => t);
              const isOpen = open === r.id;
              return (
                <div key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    className={`flex min-h-[60px] w-full items-center justify-between rounded-2xl px-4 py-3 text-left shadow-sm ${mine.length ? 'bg-orange-100 ring-2 ring-orange-300' : 'bg-white'}`}
                  >
                    <div>
                      <div className="font-black">{MEALS[r.meal].emoji} {MEALS[r.meal].label}</div>
                      <div className="text-sm font-bold text-stone-600">
                        {r.inputs.rows[uid].away
                          ? 'Tum bahar ho 🚶'
                          : mine.length
                            ? `Tumhara: ${mine.map((t) => `${TASK_BY_KEY[t].emoji} ${TASK_BY_KEY[t].short}`).join(', ')}`
                            : 'Tumhara koi kaam nahi 😎'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-orange-700">{r.inputs.totalRotis}</div>
                      <div className="text-[11px] font-bold text-stone-500">roti</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-2">
                      <SessionCard r={r} uid={uid} data={data} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
