import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { MEMBER_IDS, POINT_FIELDS, VOTES_NEEDED, nameOf } from '../lib/constants.js';
import { normalizePoints, usualRotis } from '../lib/engine.js';
import { applyProposal, castVote, createProposal, friendlyError, updateProfile } from '../lib/actions.js';
import { Avatar, Button, Card, SectionTitle, Sheet, Stepper, Toggle, useToast } from '../components/ui.jsx';

export default function Settings({ uid, data }) {
  return (
    <div className="space-y-4 pb-4">
      <Profile uid={uid} data={data} />
      <Points uid={uid} data={data} />
      <Card>
        <Button big variant="red" className="w-full" onClick={() => signOut(auth)}>Logout 👋</Button>
      </Card>
    </div>
  );
}

function Profile({ uid, data }) {
  const toast = useToast();
  const me = data.members[uid];
  const [wd, setWd] = useState(usualRotis(me, 'wd'));
  const [we, setWe] = useState(usualRotis(me, 'b'));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWd(usualRotis(me, 'wd')); setWe(usualRotis(me, 'b')); }, [me]);

  async function save(patch, action) {
    setBusy(true);
    try {
      await updateProfile({ uid, patch, action });
      toast('Save ho gaya ✅');
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  const changed = wd !== usualRotis(me, 'wd') || we !== usualRotis(me, 'b');

  async function toggleNotif(v) {
    if (v && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    save({ notifications: v }, v ? 'Alerts on kiye 🔔' : 'Alerts off kiye 🔕');
  }

  return (
    <Card className="space-y-3">
      <SectionTitle>👤 Meri settings</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold">Usual roti (Somvaar–Shukravaar, nashta + tiffin)</span>
        <Stepper value={wd} onChange={setWd} disabled={busy} label="Weekday usual roti" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold">Usual roti (weekend, har meal)</span>
        <Stepper value={we} onChange={setWe} disabled={busy} label="Weekend usual roti" />
      </div>
      {changed && (
        <Button className="w-full" disabled={busy} onClick={() => save({ usualRotisWeekday: wd, usualRotisWeekend: we }, `Usual roti badli: weekday ${wd}, weekend ${we}`)}>
          Save
        </Button>
      )}
      <Toggle
        checked={me?.notifications !== false}
        disabled={busy}
        onChange={toggleNotif}
        label={me?.notifications !== false ? '🔔 Alerts on (swap / flag aaye to batao)' : '🔕 Alerts off'}
      />
      <p className="text-xs font-semibold text-stone-500">PIN sirf flat owner badal sakta hai.</p>
    </Card>
  );
}

function Points({ uid, data }) {
  const toast = useToast();
  const { settings, proposals, votes } = data;
  const current = normalizePoints(settings?.values);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function vote(p, approve) {
    setBusy(true);
    try {
      await castVote({ uid, proposalId: p.id, approve });
      const approvers = Array.from(new Set([...votes.filter((v) => v.proposalId === p.id && v.approve).map((v) => v.userId), ...(approve ? [uid] : [])])).sort();
      if (approve && approvers.length >= VOTES_NEEDED && p.basedOn === settings.version) {
        await applyProposal({ uid, proposal: p, approvers });
        toast('Vote pass! Naye points lagu ho gaye 🎉');
      } else {
        toast('Vote de diya 🗳️');
      }
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function apply(p, approvers) {
    setBusy(true);
    try {
      await applyProposal({ uid, proposal: p, approvers });
      toast('Naye points lagu ho gaye 🎉');
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <SectionTitle right={<span className="text-xs font-bold text-stone-500">version {settings?.version ?? 1}</span>}>🎯 Kaam ke points</SectionTitle>
      <ul className="divide-y divide-stone-100">
        {POINT_FIELDS.map((f) => (
          <li key={f.key} className="flex justify-between py-2 text-sm">
            <span className="font-bold">{f.label}</span>
            <span className="font-black tabular-nums">{f.key === 'weekendBartanMultiplier' ? `× ${current[f.key]}` : current[f.key]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-semibold text-stone-500">Ye sirf group vote se badalte hain: {VOTES_NEEDED} log apne-apne login se "haan" bolein.</p>
      <Button variant="soft" className="w-full" onClick={() => setOpen(true)}>Badlaav ka proposal do 🗳️</Button>

      {proposals.length > 0 && <SectionTitle>Proposals</SectionTitle>}
      <ul className="space-y-3">
        {proposals.map((p) => {
          const pv = votes.filter((v) => v.proposalId === p.id);
          const yes = pv.filter((v) => v.approve).map((v) => v.userId).sort();
          const no = pv.filter((v) => !v.approve).map((v) => v.userId);
          const myVote = pv.find((v) => v.userId === uid);
          const applied = settings?.proposalId === p.id;
          const stale = !applied && p.basedOn !== settings?.version;
          const dead = no.length > MEMBER_IDS.length - VOTES_NEEDED;
          const passed = yes.length >= VOTES_NEEDED;
          const diffs = POINT_FIELDS.filter((f) => p.values[f.key] !== current[f.key] || applied);
          return (
            <li key={p.id} className="rounded-2xl bg-stone-50 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Avatar uid={p.userId} size="sm" />
                <b>{nameOf(p.userId)}</b> ka proposal
                <span className="ml-auto text-xs font-black">
                  {applied ? '✅ Lagu' : stale ? '⌛ Purana' : dead ? '❌ Fail' : passed ? '🎉 Pass' : `${yes.length}/${VOTES_NEEDED} haan`}
                </span>
              </div>
              {p.note && <p className="mt-1 text-sm italic text-stone-600">"{p.note}"</p>}
              <ul className="mt-1 text-sm">
                {diffs.map((f) => <li key={f.key}>{f.label}: <b>{p.values[f.key]}</b></li>)}
              </ul>
              <div className="mt-1 text-xs font-semibold text-stone-500">
                Haan: {yes.map(nameOf).join(', ') || '—'} · Na: {no.map(nameOf).join(', ') || '—'}
              </div>
              {!applied && !stale && !dead && !myVote && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="green" disabled={busy} onClick={() => vote(p, true)}>Haan 👍</Button>
                  <Button variant="red" disabled={busy} onClick={() => vote(p, false)}>Na 👎</Button>
                </div>
              )}
              {!applied && !stale && passed && (
                <Button className="mt-2 w-full" disabled={busy} onClick={() => apply(p, yes)}>Lagu karo ✅</Button>
              )}
            </li>
          );
        })}
      </ul>
      <ProposalSheet open={open} onClose={() => setOpen(false)} uid={uid} current={current} version={settings?.version ?? 1} />
    </Card>
  );
}

function ProposalSheet({ open, onClose, uid, current, version }) {
  const toast = useToast();
  const [vals, setVals] = useState(current);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setVals(current); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    try {
      const values = Object.fromEntries(POINT_FIELDS.map((f) => [f.key, Number(vals[f.key])]));
      await createProposal({ uid, values, basedOn: version, note: note.trim().slice(0, 200) });
      toast('Proposal bhej diya 🗳️ Ab vote karwao');
      setNote('');
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  const same = POINT_FIELDS.every((f) => Number(vals[f.key]) === current[f.key]);
  return (
    <Sheet open={open} onClose={onClose} title="🗳️ Naye points">
      <div className="space-y-3">
        {POINT_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm font-bold">
            {f.label}
            <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              className="h-11 w-24 rounded-xl bg-stone-50 px-2 text-right ring-1 ring-stone-200" />
          </label>
        ))}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Kyun? (jaise: bartan sabse bhaari kaam hai)"
          className="w-full rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200" />
        <Button big className="w-full" disabled={busy || same || POINT_FIELDS.some((f) => !(Number(vals[f.key]) >= f.min && Number(vals[f.key]) <= f.max))} onClick={submit}>
          Proposal bhejo
        </Button>
      </div>
    </Sheet>
  );
}
