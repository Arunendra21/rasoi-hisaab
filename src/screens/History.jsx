import { useEffect, useState } from 'react';
import { Timestamp, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { MEMBERS, nameOf } from '../lib/constants.js';
import { addDays, fromISO, shortDate, toISO } from '../lib/dates.js';
import { Avatar, Button, Card, SectionTitle } from '../components/ui.jsx';

const HIDDEN = new Set(['lastAuditId', 'userId']);

function show(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(khaali)';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'haan' : 'nahi';
  return String(v);
}

function Diff({ before, after }) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).filter((k) => !HIDDEN.has(k));
  const changed = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  if (!changed.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {changed.map((k) => (
        <li key={k} className="font-mono">
          <span className="text-stone-500">{k}:</span> <span className="text-rose-600 line-through">{before ? show(before[k]) : 'naya'}</span> →{' '}
          <span className="font-bold text-emerald-700">{show(after?.[k])}</span>
        </li>
      ))}
    </ul>
  );
}

export default function History({ data }) {
  const [from, setFrom] = useState(addDays(data.today, -7));
  const [to, setTo] = useState(data.today);
  const [who, setWho] = useState('all');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    setRows(null);
    setErr('');
    try {
      const start = Timestamp.fromDate(fromISO(from));
      const end = Timestamp.fromDate(fromISO(addDays(to, 1)));
      const q = query(collection(db, 'audit'), where('at', '>=', start), where('at', '<', end), orderBy('at', 'desc'), limit(300));
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = (rows || []).filter((r) => who === 'all' || r.userId === who);

  return (
    <div className="space-y-4 pb-4">
      <Card>
        <h1 className="text-2xl font-black">📜 History</h1>
        <p className="mt-1 text-sm font-semibold text-stone-600">Har badlaav yahan hamesha ke liye likha hai — kaun, kya, pehle kya tha, baad mein kya hua. Ise koi edit ya delete nahi kar sakta.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm font-bold">Se
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-stone-50 px-2 ring-1 ring-stone-200" />
          </label>
          <label className="text-sm font-bold">Tak
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-stone-50 px-2 ring-1 ring-stone-200" />
          </label>
        </div>
        <label className="mt-2 block text-sm font-bold">Kiska
          <select value={who} onChange={(e) => setWho(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-stone-50 px-2 ring-1 ring-stone-200">
            <option value="all">Sab</option>
            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <Button className="mt-3 w-full" onClick={load}>Dikhao 🔍</Button>
      </Card>

      <Card>
        <SectionTitle>{rows ? `${shown.length} badlaav` : 'Load ho raha hai…'}</SectionTitle>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <ul className="divide-y divide-stone-100">
          {shown.map((r) => {
            const t = r.at?.toDate?.();
            return (
              <li key={r.id} className="flex gap-2 py-3">
                <Avatar uid={r.userId} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><b>{nameOf(r.userId)}</b>: {r.action}</div>
                  <div className="text-xs font-semibold text-stone-500">
                    {t ? `${shortDate(toISO(t))} ${t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''} · {r.coll}
                  </div>
                  <Diff before={r.before} after={r.after} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
