// Real-time listeners for everything the site shows. Any change on any phone shows up everywhere.
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { addDays, prevMonthStart, todayISO } from '../lib/dates.js';
import { simulate } from '../lib/engine.js';

const SNAP_OPTS = { serverTimestamps: 'estimate' };

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useFlatData(enabled) {
  const now = useNow();
  const today = todayISO(now);
  const windowStart = prevMonthStart(today);

  const [members, setMembers] = useState({});
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState({});
  const [swapDocs, setSwapDocs] = useState([]);
  const [replies, setReplies] = useState({});
  const [flags, setFlags] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [votes, setVotes] = useState([]);
  const [feed, setFeed] = useState([]);
  const [ready, setReady] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const mark = (k) => setReady((r) => (r[k] ? r : { ...r, [k]: true }));
    const onErr = (e) => setError(e);
    const listToObj = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...d.data(SNAP_OPTS) }]));
    const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data(SNAP_OPTS) }));

    const unsubs = [
      onSnapshot(collection(db, 'members'), (s) => { setMembers(listToObj(s)); mark('members'); }, onErr),
      onSnapshot(doc(db, 'settings', 'points'), (s) => { setSettings(s.exists() ? s.data() : null); mark('settings'); }, onErr),
      onSnapshot(query(collection(db, 'entries'), where('date', '>=', windowStart)), (s) => { setEntries(listToObj(s)); mark('entries'); }, onErr),
      onSnapshot(query(collection(db, 'swaps'), where('date', '>=', windowStart)), (s) => setSwapDocs(list(s)), onErr),
      onSnapshot(query(collection(db, 'swapReplies'), where('date', '>=', windowStart)), (s) => setReplies(listToObj(s)), onErr),
      onSnapshot(query(collection(db, 'flags'), where('date', '>=', windowStart)), (s) => setFlags(list(s)), onErr),
      onSnapshot(query(collection(db, 'proposals'), orderBy('date', 'desc'), limit(20)), (s) => setProposals(list(s)), onErr),
      onSnapshot(collection(db, 'votes'), (s) => setVotes(list(s)), onErr),
      onSnapshot(query(collection(db, 'audit'), orderBy('at', 'desc'), limit(40)), (s) => setFeed(list(s)), onErr),
    ];
    return () => unsubs.forEach((u) => u());
  }, [enabled, windowStart]);

  const swaps = useMemo(
    () =>
      swapDocs.map((s) => {
        const r = replies[s.id];
        const state = s.status === 'cancelled' ? 'cancelled' : r ? (r.accept ? 'accepted' : 'rejected') : 'pending';
        return { ...s, reply: r || null, state };
      }),
    [swapDocs, replies],
  );

  const values = settings?.values;
  const planEnd = addDays(today, 7);
  // Recompute when data or the minute changes. `now` only matters for "session ended" checks.
  const results = useMemo(
    () =>
      simulate({
        from: windowStart,
        to: planEnd,
        today,
        now,
        members,
        values,
        entries,
        swaps: swaps.filter((s) => s.state === 'accepted'),
      }),
    [windowStart, planEnd, today, now, members, values, entries, swaps],
  );
  const bySession = useMemo(() => Object.fromEntries(results.map((r) => [r.id, r])), [results]);

  return {
    loading: !(ready.members && ready.settings && ready.entries),
    error,
    now,
    today,
    windowStart,
    members,
    settings,
    entries,
    swaps,
    flags,
    proposals,
    votes,
    feed,
    results,
    bySession,
  };
}
