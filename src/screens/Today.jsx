import { useState } from 'react';
import { MEALS, TASKS, TASK_BY_KEY, nameOf } from '../lib/constants.js';
import { prettyDate, shortDate } from '../lib/dates.js';
import { cancelSwap, friendlyError, replySwap } from '../lib/actions.js';
import SessionCard from '../components/SessionCard.jsx';
import { Avatar, Button, Card, SectionTitle, useToast } from '../components/ui.jsx';

export default function Today({ uid, data }) {
  const todays = data.results.filter((r) => r.date === data.today);
  const myTasksToday = todays.flatMap((r) => Object.entries(r.plan.assign).filter(([, u]) => u === uid).map(([t]) => ({ t, r })));

  return (
    <div className="space-y-4 pb-4">
      <Card className="bg-gradient-to-br from-orange-400 to-pink-500 text-white ring-0">
        <div className="text-sm font-bold opacity-90">Aaj tumhara kaam</div>
        {myTasksToday.length === 0 ? (
          <div className="mt-1 text-2xl font-black">Aaj chhutti! 😎</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {myTasksToday.map(({ t, r }) => (
              <li key={r.id + t} className="text-xl font-black">
                {TASK_BY_KEY[t].emoji} {TASK_BY_KEY[t].label}
                {todays.length > 1 && <span className="text-sm font-bold opacity-90"> · {MEALS[r.meal].label}</span>}
                {r.inputs.rows[uid].tasksDone.includes(t) && ' ✅'}
              </li>
            ))}
          </ul>
        )}
        <ShareButton data={data} todays={todays} />
      </Card>

      <SwapInbox uid={uid} data={data} />
      <LiveFeed data={data} uid={uid} />

      {todays.map((r) => (
        <SessionCard key={r.id} r={r} uid={uid} data={data} />
      ))}
    </div>
  );
}

function ShareButton({ data, todays }) {
  function share() {
    const lines = [`🫓 *Aaj ka plan* (${prettyDate(data.today)})`];
    for (const r of todays) {
      lines.push('', `${MEALS[r.meal].emoji} *${MEALS[r.meal].label}* — ${r.inputs.totalRotis} roti`);
      for (const t of TASKS) if (r.plan.assign[t.key]) lines.push(`${t.emoji} ${t.label}: ${nameOf(r.plan.assign[t.key])}`);
    }
    lines.push('', `Live dekho: ${window.location.origin}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  }
  return (
    <button type="button" onClick={share} className="mt-3 min-h-[44px] rounded-2xl bg-white/20 px-4 font-extrabold active:bg-white/30">
      WhatsApp pe bhejo 📲
    </button>
  );
}

function SwapInbox({ uid, data }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const incoming = data.swaps.filter((s) => s.toUid === uid && s.state === 'pending' && s.date >= data.today);
  const outgoing = data.swaps.filter((s) => s.userId === uid && s.state === 'pending' && s.date >= data.today);
  if (!incoming.length && !outgoing.length) return null;

  async function run(fn, ok) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  const label = (s) => `${prettyDate(s.date, data.today)} ${MEALS[s.sessionId.split('_')[1]].label}`;

  return (
    <Card className="ring-2 ring-amber-300">
      <SectionTitle>🔁 Swap requests</SectionTitle>
      <ul className="space-y-3">
        {incoming.map((s) => (
          <li key={s.id} className="rounded-2xl bg-amber-50 p-3">
            <p className="font-bold">
              <b>{nameOf(s.userId)}</b> chahte hain tum unka <b>{TASK_BY_KEY[s.task].label}</b> karo
              {s.giveBack ? <> aur woh tumhara <b>{TASK_BY_KEY[s.giveBack].label}</b> karenge</> : null} — {label(s)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="green" disabled={busy} onClick={() => run(() => replySwap({ uid, swap: s, accept: true, action: `🤝 ${nameOf(s.userId)} ka swap maana (${TASK_BY_KEY[s.task].short})` }), 'Swap pakka ✅')}>Haan ✅</Button>
              <Button variant="red" disabled={busy} onClick={() => run(() => replySwap({ uid, swap: s, accept: false, action: `🙅 ${nameOf(s.userId)} ka swap mana kiya` }), 'Mana kar diya')}>Nahi ❌</Button>
            </div>
          </li>
        ))}
        {outgoing.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl bg-stone-50 p-3">
            <p className="text-sm font-bold">⏳ {nameOf(s.toUid)} ke jawab ka intezaar: {TASK_BY_KEY[s.task].short} · {label(s)}</p>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => cancelSwap({ uid, swap: s }), 'Request wapas')}>Wapas lo</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function timeAgo(date, now) {
  if (!date) return 'abhi';
  const s = Math.max(0, Math.round((now - date) / 1000));
  if (s < 60) return 'abhi';
  if (s < 3600) return `${Math.floor(s / 60)} min pehle`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante pehle`;
  return `${Math.floor(s / 86400)} din pehle`;
}

function feedContext(f) {
  const sid = f.after?.sessionId;
  if (!sid) return '';
  const [date, meal] = sid.split('_');
  return `${MEALS[meal]?.label ?? ''} · ${shortDate(date)}`;
}

function LiveFeed({ data, uid }) {
  const [all, setAll] = useState(false);
  const items = all ? data.feed : data.feed.slice(0, 6);
  return (
    <Card>
      <SectionTitle right={<span className="text-xs font-bold text-emerald-600">● live</span>}>⚡ Abhi kya hua</SectionTitle>
      {items.length === 0 ? (
        <p className="font-bold text-stone-500">Abhi tak kuch nahi hua. Pehla kadam tum uthao! 💪</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {items.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <Avatar uid={f.userId} size="sm" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-extrabold">{f.userId === uid ? 'Tum' : nameOf(f.userId)}</span>: {f.action}
                <div className="text-xs font-semibold text-stone-500">
                  {timeAgo(f.at?.toDate?.(), data.now)}
                  {feedContext(f) && ` · ${feedContext(f)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.feed.length > 6 && (
        <button type="button" className="mt-2 text-sm font-bold text-orange-600" onClick={() => setAll((v) => !v)}>
          {all ? 'Kam dikhao' : 'Aur dikhao'}
        </button>
      )}
    </Card>
  );
}
