import { useMemo, useState } from 'react';
import { MEMBERS, MEMBER_BY_ID, MEMBER_IDS, TASKS, nameOf } from '../lib/constants.js';
import { addDays, monthStart, prevMonthStart, shortDate, weekStart } from '../lib/dates.js';
import { fmt, fmtSigned, settle, statsFor } from '../lib/engine.js';
import { Avatar, Card, SectionTitle } from '../components/ui.jsx';

export default function Stats({ uid, data }) {
  const { today, results } = data;
  const ranges = {
    week: { label: 'Is hafte', from: weekStart(today), to: today },
    month: { label: 'Is mahine', from: monthStart(today), to: today },
    last: { label: 'Pichhla mahina', from: prevMonthStart(today), to: addDays(monthStart(today), -1) },
  };
  const [rk, setRk] = useState('week');
  const range = ranges[rk];
  const per = useMemo(() => statsFor(results, range.from, range.to), [results, range.from, range.to]);
  const debts = settle(per);
  const maxPts = Math.max(1, ...MEMBER_IDS.map((u) => per[u].points));

  const wasteTotals = useMemo(() => {
    const sum = (p) => MEMBER_IDS.reduce((s, u) => s + p[u].waste, 0);
    return {
      today: sum(statsFor(results, today, today)),
      week: sum(statsFor(results, weekStart(today), today)),
      month: sum(statsFor(results, monthStart(today), today)),
    };
  }, [results, today]);

  const weeks = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const from = addDays(weekStart(today), -7 * i);
      const to = addDays(from, 6);
      if (from < data.windowStart) continue;
      out.push({ from, stats: statsFor(results, from, to) });
    }
    return out;
  }, [results, today, data.windowStart]);

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {Object.entries(ranges).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={rk === k} onClick={() => setRk(k)}
            className={`min-h-[44px] rounded-2xl text-sm font-extrabold ${rk === k ? 'bg-orange-500 text-white' : 'bg-white text-stone-600'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-center text-xs font-bold text-stone-500">{shortDate(range.from)} – {shortDate(range.to)}</p>

      {/* ---- work points ---- */}
      <Card>
        <SectionTitle>💪 Kaam ke points</SectionTitle>
        <ul className="space-y-3">
          {[...MEMBERS].sort((a, b) => per[b.id].points - per[a.id].points).map((m) => {
            const p = per[m.id];
            return (
              <li key={m.id} title={`${m.name}: ${fmt(p.points)} pts (fair share ${fmt(p.expected)})`}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1"><Avatar uid={m.id} size="sm" /><b>{m.name}{m.id === uid ? ' (tum)' : ''}</b></span>
                  <span className="font-black tabular-nums">{fmt(p.points)} pts</span>
                </div>
                <div className="h-4 rounded-full bg-stone-100">
                  <div className="h-4 rounded-full" style={{ width: `${(p.points / maxPts) * 100}%`, background: m.color, minWidth: p.points > 0 ? 8 : 0 }} />
                </div>
                <div className="mt-0.5 text-xs font-semibold text-stone-500">
                  Fair share {fmt(p.expected)} · balance <b className={p.balance < -0.05 ? 'text-rose-600' : 'text-emerald-700'}>{fmtSigned(p.balance)}</b>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ---- balance ---- */}
      <Card>
        <SectionTitle>⚖️ Kaun kiska kaam udhaar hai</SectionTitle>
        {debts.length === 0 ? (
          <p className="font-bold text-emerald-700">Sab barabar! Koi udhaar nahi 🤝</p>
        ) : (
          <ul className="space-y-2">
            {debts.map((d, i) => (
              <li key={i} className={`flex items-center gap-2 rounded-2xl p-3 ${d.from === uid || d.to === uid ? 'bg-orange-50' : 'bg-stone-50'}`}>
                <Avatar uid={d.from} size="sm" />
                <span className="text-sm"><b>{nameOf(d.from)}</b> par <b>{nameOf(d.to)}</b> ka <b>{fmt(d.pts)} pts</b> ka kaam udhaar</span>
                <Avatar uid={d.to} size="sm" />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs font-semibold text-stone-500">
          Fair share = har session ka total kaam ÷ jitne log us session mein khaa rahe the. Plan apne aap udhaar wale ko zyada kaam deta hai.
        </p>
      </Card>

      {/* ---- task distribution heatmap ---- */}
      <Card>
        <SectionTitle>🧩 Kisne kya kiya (kitni baar)</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead>
              <tr>
                <th className="p-1 text-left">Naam</th>
                {TASKS.map((t) => <th key={t.key} className="p-1" title={t.label}>{t.emoji}<div className="text-[10px] font-bold text-stone-500">{t.short}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {MEMBERS.map((m) => (
                <tr key={m.id}>
                  <td className="p-1 text-left font-bold">{m.name}</td>
                  {TASKS.map((t) => {
                    const c = per[m.id].byTask[t.key].count;
                    const maxC = Math.max(1, ...MEMBER_IDS.flatMap((u) => TASKS.map((x) => per[u].byTask[x.key].count)));
                    const a = c / maxC;
                    return (
                      <td key={t.key} className="p-0.5">
                        <div className="rounded-lg py-2 font-black tabular-nums"
                          title={`${m.name} · ${t.label}: ${c} baar, ${fmt(per[m.id].byTask[t.key].pts)} pts`}
                          style={{ background: c ? `rgba(234,88,12,${0.12 + a * 0.75})` : '#f5f5f4', color: a > 0.5 ? '#fff' : '#292524' }}>
                          {c}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- per person ---- */}
      <div className="grid grid-cols-1 gap-3">
        {MEMBERS.map((m) => {
          const p = per[m.id];
          return (
            <Card key={m.id} className={m.id === uid ? 'ring-2 ring-orange-300' : ''}>
              <div className="mb-2 flex items-center gap-2"><Avatar uid={m.id} /><b className="text-lg">{m.name}</b></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="points" value={fmt(p.points)} />
                <Stat label="kaam" value={p.tasks} />
                <Stat label="roti banai" value={p.rotisMade} />
                <Stat label="skip" value={p.skips} bad={p.skips > 0} />
                <Stat label="cover kiya" value={p.covers} />
                <Stat label="bonus" value={fmt(p.bonus)} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---- waste ---- */}
      <Card>
        <SectionTitle>🗑️ Roti waste</SectionTitle>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="aaj" value={wasteTotals.today} />
          <Stat label="is hafte" value={wasteTotals.week} />
          <Stat label="is mahine" value={wasteTotals.month} />
        </div>
        <WasteBoard per={per} uid={uid} />
      </Card>

      <Card>
        <SectionTitle>📈 Waste trend (har hafta)</SectionTitle>
        <ul className="space-y-3">
          {MEMBERS.map((m) => {
            const vals = weeks.map((w) => w.stats[m.id].waste);
            const mx = Math.max(1, ...weeks.flatMap((w) => MEMBER_IDS.map((u) => w.stats[u].waste)));
            return (
              <li key={m.id} className="flex items-center gap-3">
                <span className="w-20 text-sm font-bold">{m.name}</span>
                <div className="flex h-10 flex-1 items-end gap-1" role="img" aria-label={`${m.name} waste per week: ${vals.join(', ')}`}>
                  {weeks.map((w, i) => (
                    <div key={w.from} className="flex-1 rounded-t" title={`Hafta ${shortDate(w.from)}: ${vals[i]} roti`}
                      style={{ height: `${Math.max(4, (vals[i] / mx) * 100)}%`, background: vals[i] ? MEMBER_BY_ID[m.id].color : '#e7e5e4' }} />
                  ))}
                </div>
                <span className="w-8 text-right text-sm font-black tabular-nums">{vals[vals.length - 1] ?? 0}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs font-semibold text-stone-500">Har bar = ek hafta (purana → naya). Last number = is hafte.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, bad }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-2">
      <div className={`text-2xl font-black tabular-nums ${bad ? 'text-rose-600' : ''}`}>{value}</div>
      <div className="text-[11px] font-bold uppercase text-stone-500">{label}</div>
    </div>
  );
}

function WasteBoard({ per, uid }) {
  const rows = [...MEMBERS].sort((a, b) => per[b.id].waste - per[a.id].waste || per[a.id].eaten - per[b.id].eaten);
  const title = (p, i) => {
    if (p.mealsTracked === 0) return '🤷 Khayi kitni, bataya hi nahi!';
    if (p.waste === 0) return '🌱 Zero Waste Hero';
    if (i === 0) return '🏆 Roti Barbaad Champion (ye trophy mat jeetna 😅)';
    if (p.waste >= 5) return '🐄 Gaay ko khush karne wala';
    return '🤏 Thoda sa waste';
  };
  return (
    <ol className="space-y-2">
      {rows.map((m, i) => {
        const p = per[m.id];
        return (
          <li key={m.id} className={`flex items-center gap-2 rounded-2xl p-2 ${m.id === uid ? 'bg-orange-50' : ''}`}>
            <span className="w-6 text-center font-black text-stone-400">{i + 1}</span>
            <Avatar uid={m.id} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">{m.name}</div>
              <div className="text-xs font-semibold text-stone-600">
                {title(p, i)}
                {p.extra > 0 && ` · 😋 ${p.extra} extra khayi`}
              </div>
            </div>
            <span className="text-xl font-black tabular-nums">{p.waste}</span>
          </li>
        );
      })}
    </ol>
  );
}
