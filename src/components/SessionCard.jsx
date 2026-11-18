import { useEffect, useState } from 'react';
import { MEALS, MEMBER_IDS, TASKS, TASK_BY_KEY, nameOf } from '../lib/constants.js';
import { fromISO, isLocked, prettyDate } from '../lib/dates.js';
import { fmt } from '../lib/engine.js';
import { friendlyError, raiseFlag, requestSwap, saveEntry } from '../lib/actions.js';
import { Avatar, Button, Card, Name, SectionTitle, Sheet, Stepper, Toggle, useToast } from './ui.jsx';

export default function SessionCard({ r, uid, data, compact = false }) {
  const toast = useToast();
  const { now, today, members, flags, swaps } = data;
  const meal = MEALS[r.meal];
  const me = r.inputs.rows[uid];
  const locked = isLocked(r.date, now);
  const started = now >= fromISO(r.date);
  const [busy, setBusy] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [swapTask, setSwapTask] = useState(null);

  // Local drafts for the steppers; saved with one tap (so we don't write on every +/−).
  const [planned, setPlanned] = useState(me.planned);
  const [eaten, setEaten] = useState(me.eaten ?? me.planned);
  const [made, setMade] = useState(me.rotisMade);
  useEffect(() => setPlanned(me.planned), [me.planned]);
  useEffect(() => setEaten(me.eaten ?? me.planned), [me.eaten, me.planned]);
  useEffect(() => setMade(me.rotisMade), [me.rotisMade]);

  async function save(patch, action) {
    setBusy(true);
    try {
      await saveEntry({ uid, session: r, member: members[uid], patch, action });
      toast('Save ho gaya ✅');
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const myTasks = Object.entries(r.plan.assign).filter(([, u]) => u === uid).map(([t]) => t);
  const myDone = me.tasksDone;
  const pendingMine = myTasks.filter((t) => !myDone.includes(t));
  const sessionFlags = flags.filter((f) => f.sessionId === r.id);
  const sessionSwaps = swaps.filter((s) => s.sessionId === r.id && s.state !== 'cancelled');

  function toggleTask(t) {
    const has = myDone.includes(t);
    const next = has ? myDone.filter((x) => x !== t) : [...myDone, t];
    const patch = { tasksDone: next };
    if (t === 'roti') patch.rotisMade = has ? 0 : me.rotisMade || r.inputs.totalRotis;
    save(patch, has ? `${TASK_BY_KEY[t].short} ka tick hataya ↩️` : `${TASK_BY_KEY[t].done} ✅`);
  }

  function markAllMine() {
    const next = Array.from(new Set([...myDone, ...myTasks]));
    const patch = { tasksDone: next };
    if (myTasks.includes('roti') && !me.rotisMade) patch.rotisMade = r.inputs.totalRotis;
    save(patch, `Kaam ho gaya ✅ (${myTasks.map((t) => TASK_BY_KEY[t].short).join(', ')})`);
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-stone-500">{prettyDate(r.date, today)}</div>
          <h2 className="text-2xl font-black">
            {meal.emoji} {meal.label}
          </h2>
        </div>
        <div className="rounded-2xl bg-orange-100 px-3 py-2 text-center">
          <div className="text-3xl font-black tabular-nums text-orange-700">{r.inputs.totalRotis}</div>
          <div className="text-[11px] font-extrabold uppercase text-orange-700">roti banani</div>
        </div>
      </div>
      {locked && <p className="rounded-xl bg-stone-100 p-2 text-sm font-bold text-stone-600">🔒 24 ghante se purana — ab sirf dekh sakte ho</p>}

      {/* ---------- my own food ---------- */}
      {!locked && (
        <section className="space-y-3">
          <SectionTitle>Mera khana</SectionTitle>
          <Toggle
            checked={me.away}
            disabled={busy}
            label={me.away ? 'Bahar hoon / nahi khaunga 🚶' : 'Main kha raha/rahi hoon 🍽️'}
            onChange={(v) => save({ away: v }, v ? 'Is session mein bahar hoon 🚶' : 'Is session mein khaana hai 🍽️')}
          />
          {!me.away && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold">Kitni roti khaoge?</span>
              <div className="flex items-center gap-2">
                <Stepper value={planned} onChange={setPlanned} disabled={busy} label="Kitni roti khaoge" />
                {planned !== me.planned || !me.entry ? (
                  <Button variant="primary" disabled={busy} onClick={() => save({ rotisPlanned: planned }, `Khaunga/khaungi: ${planned} roti 🫓`)}>
                    Save
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {!me.away && started && !compact && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold">Kitni khayi?</span>
              <div className="flex items-center gap-2">
                <Stepper value={eaten} onChange={setEaten} disabled={busy} label="Kitni roti khayi" />
                {eaten !== me.eaten ? (
                  <Button variant="primary" disabled={busy} onClick={() => save({ rotisEaten: eaten }, `Khayi: ${eaten} roti (bola tha ${me.planned})`)}>
                    Save
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {me.eaten !== null && !me.away && (
            <p className="text-sm font-bold text-stone-600">
              {me.planned - me.eaten > 0 ? `🗑️ ${me.planned - me.eaten} roti waste hui` : me.planned - me.eaten < 0 ? `😋 ${me.eaten - me.planned} extra khayi` : '🌟 Zero waste! Shabash'}
            </p>
          )}
        </section>
      )}

      {/* ---------- plan ---------- */}
      <section>
        <SectionTitle right={<button type="button" className="text-sm font-bold text-orange-600" onClick={() => setShowWhy((v) => !v)}>{showWhy ? 'Kyun? chhupao' : 'Kyun? 🤔'}</button>}>
          Kaam ka plan
        </SectionTitle>
        {Object.keys(r.plan.assign).length === 0 ? (
          <p className="font-bold text-stone-500">Sab bahar hain — aaj koi kaam nahi 🎉</p>
        ) : (
          <ul className="space-y-2">
            {TASKS.filter((t) => r.plan.assign[t.key]).map((t) => {
              const who = r.plan.assign[t.key];
              const doers = r.actual.byTask[t.key] || [];
              const doneByAssignee = doers.some((d) => d.uid === who);
              const skipped = r.actual.skips.find((s) => s.task === t.key);
              return (
                <li key={t.key} className={`rounded-2xl p-3 ${who === uid ? 'bg-orange-50 ring-2 ring-orange-300' : 'bg-stone-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold">
                        {t.label} <span className="text-sm font-bold text-stone-500">· {fmt(r.plan.points[t.key])} pts</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Avatar uid={who} size="sm" />
                        <Name uid={who} me={uid} />
                        {doneByAssignee && <span className="font-bold text-emerald-600">✅ ho gaya</span>}
                        {skipped && <span className="font-bold text-rose-600">⏭️ skip</span>}
                      </div>
                      {doers.filter((d) => d.uid !== who).length > 0 && (
                        <div className="mt-1 text-sm font-bold text-emerald-700">
                          Kiya: {doers.filter((d) => d.uid !== who).map((d) => `${nameOf(d.uid)}${d.bonus ? ` (+${fmt(d.bonus)} bonus)` : ''}`).join(', ')} ✅
                        </div>
                      )}
                      {showWhy && <div className="mt-1 text-sm text-stone-600">💡 {r.plan.reasons[t.key]}</div>}
                    </div>
                    {who === uid && !locked && !doneByAssignee && r.date >= today && (
                      <Button variant="soft" onClick={() => setSwapTask(t.key)} aria-label={`${t.label} swap karo`}>
                        🔁
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {r.plan.swapNotes.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm font-bold text-stone-600">
            {r.plan.swapNotes.map((n) => <li key={n.id}>🔁 {n.text}</li>)}
          </ul>
        )}
        {sessionSwaps.filter((s) => s.state === 'pending').map((s) => (
          <p key={s.id} className="mt-2 text-sm font-bold text-amber-700">
            ⏳ {nameOf(s.userId)} ne {nameOf(s.toUid)} se {TASK_BY_KEY[s.task].short} swap maanga hai
          </p>
        ))}
      </section>

      {/* ---------- what I did ---------- */}
      {!locked && started && !compact && (
        <section className="space-y-2">
          <SectionTitle>Maine kya kiya? (sirf apna)</SectionTitle>
          {pendingMine.length > 0 && (
            <Button big variant="green" className="w-full" disabled={busy} onClick={markAllMine}>
              Mera kaam ho gaya ✅
            </Button>
          )}
          <div className="grid grid-cols-1 gap-2">
            {TASKS.map((t) => {
              const on = myDone.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => toggleTask(t.key)}
                  className={`flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-left font-extrabold transition disabled:opacity-60 ${on ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400' : 'bg-stone-100 text-stone-700'}`}
                >
                  <span className="text-xl">{on ? '✅' : '⬜'}</span>
                  <span className="flex-1">{t.done} {t.emoji}</span>
                  {r.plan.assign[t.key] && r.plan.assign[t.key] !== uid && !on && <span className="text-xs text-stone-500">({nameOf(r.plan.assign[t.key])} ka)</span>}
                </button>
              );
            })}
          </div>
          {myDone.includes('roti') && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 p-3">
              <span className="font-extrabold">Maine kitni roti banai?</span>
              <div className="flex items-center gap-2">
                <Stepper value={made} onChange={setMade} max={150} disabled={busy} label="Kitni roti banai" />
                {made !== me.rotisMade && (
                  <Button variant="green" disabled={busy} onClick={() => save({ rotisMade: made }, `${made} roti banai 🫓`)}>Save</Button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- everyone (read-only) ---------- */}
      {!compact && (
        <section>
          <SectionTitle right={!locked && <button type="button" className="text-sm font-bold text-rose-600" onClick={() => setFlagOpen(true)}>🚩 Flag</button>}>
            Sab ka haal
          </SectionTitle>
          <ul className="divide-y divide-stone-100">
            {MEMBER_IDS.map((u) => {
              const row = r.inputs.rows[u];
              return (
                <li key={u} className="flex items-center gap-2 py-2 text-sm">
                  <Avatar uid={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Name uid={u} me={uid} />
                    <div className="text-stone-600">
                      {row.away ? 'bahar 🚶' : `🫓 ${row.planned}${row.eaten !== null ? ` → khayi ${row.eaten}` : ''}${row.entry ? '' : ' (usual)'}`}
                      {row.tasksDone.length > 0 && ` · ${row.tasksDone.map((t) => TASK_BY_KEY[t].emoji).join('')}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {sessionFlags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {sessionFlags.map((f) => (
                <li key={f.id} className="rounded-xl bg-rose-50 p-2 text-sm">
                  🚩 <b>{nameOf(f.userId)}</b> → <b>{nameOf(f.targetUid)}</b>: {f.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <FlagSheet open={flagOpen} onClose={() => setFlagOpen(false)} uid={uid} session={r} />
      <SwapSheet task={swapTask} onClose={() => setSwapTask(null)} uid={uid} r={r} />
    </Card>
  );
}

function FlagSheet({ open, onClose, uid, session }) {
  const toast = useToast();
  const [target, setTarget] = useState(MEMBER_IDS.find((u) => u !== uid));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await raiseFlag({ uid, targetUid: target, session, text: text.trim(), action: `🚩 ${nameOf(target)} ki entry par flag: "${text.trim().slice(0, 80)}"` });
      toast('Flag lag gaya 🚩');
      setText('');
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="🚩 Flag / comment">
      <p className="mb-3 text-sm text-stone-600">Tum kisi ki entry badal nahi sakte — bas sawaal utha sakte ho. Sab ko dikhega.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {MEMBER_IDS.map((u) => (
          <button key={u} type="button" onClick={() => setTarget(u)} aria-pressed={target === u}
            className={`flex items-center gap-1 rounded-full px-3 py-2 font-bold ${target === u ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-stone-100'}`}>
            <Avatar uid={u} size="sm" /> {nameOf(u)}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={3} placeholder="Jaise: bartan aadhe hi dhule the 🙄"
        className="w-full rounded-2xl bg-stone-50 p-3 ring-2 ring-stone-200 focus:outline-none focus:ring-rose-400" />
      <Button big variant="red" className="mt-3 w-full" disabled={busy || !text.trim()} onClick={submit}>Flag lagao</Button>
    </Sheet>
  );
}

function SwapSheet({ task, onClose, uid, r }) {
  const toast = useToast();
  const [to, setTo] = useState(null);
  const [giveBack, setGiveBack] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTo(null); setGiveBack(null); }, [task]);
  if (!task) return null;
  const others = r.inputs.present.filter((u) => u !== uid);
  const theirTasks = to ? Object.entries(r.plan.assign).filter(([, u]) => u === to).map(([t]) => t) : [];
  async function submit() {
    setBusy(true);
    try {
      await requestSwap({
        uid, toUid: to, session: r, task, giveBack,
        action: `🔁 ${nameOf(to)} se swap maanga: mera ${TASK_BY_KEY[task].short}${giveBack ? ` ↔ unka ${TASK_BY_KEY[giveBack].short}` : ''}`,
      });
      toast(`${nameOf(to)} ko request chali gayi ⏳`);
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open onClose={onClose} title={`🔁 ${TASK_BY_KEY[task].label} kisko dena hai?`}>
      <p className="mb-3 text-sm text-stone-600">Plan tabhi badlega jab woh apne login se "Haan" bolenge.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {others.map((u) => (
          <button key={u} type="button" onClick={() => { setTo(u); setGiveBack(null); }} aria-pressed={to === u}
            className={`flex items-center gap-1 rounded-full px-3 py-2 font-bold ${to === u ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-stone-100'}`}>
            <Avatar uid={u} size="sm" /> {nameOf(u)}
          </button>
        ))}
      </div>
      {to && (
        <div className="mb-4">
          <div className="mb-2 font-extrabold">Badle mein unka kaam loge? (optional)</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGiveBack(null)} aria-pressed={giveBack === null}
              className={`rounded-full px-3 py-2 font-bold ${giveBack === null ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-stone-100'}`}>Nahi, bas de do</button>
            {theirTasks.map((t) => (
              <button key={t} type="button" onClick={() => setGiveBack(t)} aria-pressed={giveBack === t}
                className={`rounded-full px-3 py-2 font-bold ${giveBack === t ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-stone-100'}`}>
                {TASK_BY_KEY[t].emoji} {TASK_BY_KEY[t].short}
              </button>
            ))}
          </div>
        </div>
      )}
      <Button big className="w-full" disabled={!to || busy} onClick={submit}>Request bhejo</Button>
    </Sheet>
  );
}
