// The deterministic planner + scorer. Pure functions only: no Firebase, no clock reads
// (the caller passes `today` and `now`). Same inputs => same plan on every phone.
import {
  MEMBER_IDS,
  TASK_KEYS,
  TASK_BY_KEY,
  DEFAULT_POINTS,
  DEFAULT_USUAL_ROTIS,
  PLANNER,
  nameOf,
} from './constants.js';
import { addDays, dateRange, sessionsForDate, sessionEnd } from './dates.js';

const round1 = (x) => Math.round(x * 10) / 10;
export const fmt = (x) => {
  const r = round1(x);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
export const fmtSigned = (x) => (round1(x) > 0 ? `+${fmt(x)}` : fmt(x));

const zeroVec = () => Object.fromEntries(MEMBER_IDS.map((u) => [u, 0]));
const addVec = (a, b) => Object.fromEntries(MEMBER_IDS.map((u) => [u, (a[u] || 0) + (b[u] || 0)]));
const subVec = (a, b) => Object.fromEntries(MEMBER_IDS.map((u) => [u, (a[u] || 0) - (b[u] || 0)]));

const MEAL_INDEX = { wd: 0, b: 0, l: 1, d: 2 };
function sessionNumber(session) {
  const [y, m, d] = session.date.split('-').map(Number);
  const dayNum = Math.round(Date.UTC(y, m - 1, d) / 86400000);
  return dayNum * 3 + MEAL_INDEX[session.meal];
}

export function normalizePoints(values) {
  return { ...DEFAULT_POINTS, ...(values || {}) };
}

export function usualRotis(member, meal) {
  if (meal === 'wd') return member?.usualRotisWeekday ?? DEFAULT_USUAL_ROTIS.weekday;
  return member?.usualRotisWeekend ?? DEFAULT_USUAL_ROTIS.weekend;
}

export function taskPoints(task, values, meal, rotis) {
  const v = normalizePoints(values);
  switch (task) {
    case 'aata':
      return v.aata;
    case 'roti':
      return round1((rotis / 5) * v.rotiPer5);
    case 'kaatna':
      return v.kaatna;
    case 'sabji':
      return v.sabji;
    case 'bartan':
      return round1(v.bartan * (meal === 'l' || meal === 'd' ? v.weekendBartanMultiplier : 1));
    default:
      return 0;
  }
}

// Everything the plan depends on for one session, derived from people's own entries.
export function sessionInputs(session, entries, members) {
  const rows = {};
  for (const uid of MEMBER_IDS) {
    const e = entries[`${session.id}_${uid}`] || null;
    const planned = e && typeof e.rotisPlanned === 'number' ? e.rotisPlanned : usualRotis(members[uid], session.meal);
    rows[uid] = {
      entry: e,
      away: !!e?.away,
      planned,
      eaten: e && typeof e.rotisEaten === 'number' ? e.rotisEaten : null,
      tasksDone: Array.isArray(e?.tasksDone) ? e.tasksDone : [],
      rotisMade: typeof e?.rotisMade === 'number' ? e.rotisMade : 0,
    };
  }
  const present = MEMBER_IDS.filter((u) => !rows[u].away);
  const totalRotis = present.reduce((s, u) => s + rows[u].planned, 0);
  return { rows, present, totalRotis };
}

/**
 * Assign tasks for one session.
 * balances: uid -> (points earned - fair share), negative = owes work.
 * recent: { yesterday: uid->Set(task), earlierToday: uid->Set(task) }
 */
export function planSession(session, inputs, balances, recent, values) {
  const { present, totalRotis } = inputs;
  const plan = { assign: {}, points: {}, reasons: {}, swapNotes: [] };
  if (present.length === 0) return plan;

  const tasks = TASK_KEYS.filter((t) => !(totalRotis === 0 && (t === 'aata' || t === 'roti')));
  for (const t of tasks) plan.points[t] = taskPoints(t, values, session.meal, totalRotis);
  // Heaviest task first; ties keep the fixed task order.
  const ordered = [...tasks].sort((a, b) => plan.points[b] - plan.points[a] || TASK_KEYS.indexOf(a) - TASK_KEYS.indexOf(b));

  const cap = Math.ceil(tasks.length / present.length) + (present.length >= 3 ? 1 : 0);
  const sn = sessionNumber(session);
  const rank = (u) => (((MEMBER_IDS.indexOf(u) - sn) % MEMBER_IDS.length) + MEMBER_IDS.length) % MEMBER_IDS.length;
  const load = Object.fromEntries(present.map((u) => [u, 0]));
  const count = Object.fromEntries(present.map((u) => [u, 0]));
  const avgBal = present.reduce((s, u) => s + (balances[u] || 0), 0) / present.length;

  const penalty = (u, t) =>
    (recent.earlierToday[u]?.has(t) ? PLANNER.sameDayPenalty : 0) + (recent.yesterday[u]?.has(t) ? PLANNER.repeatPenalty : 0);
  const base = (u) => (balances[u] || 0) + load[u];

  for (const t of ordered) {
    const byScore = (penalised) => (a, b) => {
      const sa = base(a) + (penalised ? penalty(a, t) : 0);
      const sb = base(b) + (penalised ? penalty(b, t) : 0);
      return sa - sb || rank(a) - rank(b);
    };
    const eligible = present.filter((u) => count[u] < cap);
    const pool = eligible.length ? eligible : present;
    const chosen = [...pool].sort(byScore(true))[0];
    const pureBest = [...present].sort(byScore(false))[0];

    const N = nameOf(chosen);
    const task = TASK_BY_KEY[t].label.toLowerCase();
    let reason;
    if (chosen !== pureBest) {
      const B = nameOf(pureBest);
      if (count[pureBest] >= cap) reason = `${B} ke paas pehle se ${cap} kaam hain, isliye ${N}`;
      else if (recent.earlierToday[pureBest]?.has(t)) reason = `${B} ne pichhle session mein ${task} kiya tha, isliye ${N}`;
      else reason = `${B} ne kal ${task} kiya tha (lagatar same kaam nahi), isliye ${N}`;
    } else if (count[chosen] > 0) {
      reason = `${N} ka balance ab bhi sabse kam hai (${fmtSigned(base(chosen))}), isliye doosra kaam bhi`;
    } else {
      const gap = avgBal - (balances[chosen] || 0);
      reason =
        gap >= 0.5
          ? `${N} ke ${fmt(gap)} points baaki sab se kam hain (balance ${fmtSigned(balances[chosen] || 0)})`
          : `Sab ka balance lagbhag barabar hai — rotation se ${N} ki baari`;
    }
    plan.assign[t] = chosen;
    plan.reasons[t] = reason;
    load[chosen] += plan.points[t];
    count[chosen] += 1;
  }
  return plan;
}

// Accepted swaps change the plan: A gives task to B (and optionally takes B's task back).
export function applySwaps(plan, inputs, swaps) {
  const sorted = [...swaps].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const s of sorted) {
    const A = s.userId;
    const B = s.toUid;
    const ok =
      plan.assign[s.task] === A &&
      inputs.present.includes(B) &&
      (!s.giveBack || plan.assign[s.giveBack] === B);
    if (!ok) {
      plan.swapNotes.push({ id: s.id, applied: false, text: `${nameOf(A)} ↔ ${nameOf(B)} swap lagu nahi hua (plan badal gaya)` });
      continue;
    }
    plan.assign[s.task] = B;
    plan.reasons[s.task] = `Swap: ${nameOf(A)} ne diya, ${nameOf(B)} ne maana ✅`;
    if (s.giveBack) {
      plan.assign[s.giveBack] = A;
      plan.reasons[s.giveBack] = `Swap: ${nameOf(B)} ne diya, ${nameOf(A)} ne liya ✅`;
    }
    plan.swapNotes.push({ id: s.id, applied: true, text: `${nameOf(A)} ↔ ${nameOf(B)} swap lagu ✅` });
  }
  return plan;
}

function plannedContribution(plan, inputs) {
  const earned = zeroVec();
  const expected = zeroVec();
  let total = 0;
  for (const [t, u] of Object.entries(plan.assign)) {
    earned[u] += plan.points[t];
    total += plan.points[t];
  }
  for (const u of inputs.present) expected[u] += total / inputs.present.length;
  return subVec(earned, expected);
}

// What actually happened: points for work people marked themselves.
export function actualResult(session, plan, inputs, values, now) {
  const v = normalizePoints(values);
  const earned = zeroVec();
  const basePts = zeroVec();
  const bonus = zeroVec();
  const expected = zeroVec();
  const byTask = {}; // task -> [{uid, pts, bonus}]
  const skips = []; // {task, uid, coveredBy: []}
  let totalBase = 0;

  for (const t of TASK_KEYS) {
    const doers = MEMBER_IDS.filter((u) => inputs.rows[u].tasksDone.includes(t));
    if (!doers.length) continue;
    let total;
    let share;
    if (t === 'roti') {
      const sumMade = doers.reduce((s, u) => s + inputs.rows[u].rotisMade, 0);
      total = round1(((sumMade > 0 ? sumMade : inputs.totalRotis) / 5) * v.rotiPer5);
      share = (u) => (sumMade > 0 ? inputs.rows[u].rotisMade / sumMade : 1 / doers.length);
    } else {
      total = taskPoints(t, v, session.meal, inputs.totalRotis);
      share = () => 1 / doers.length;
    }
    const assignee = plan?.assign?.[t];
    const covered = assignee && !doers.includes(assignee);
    byTask[t] = doers.map((u) => {
      const p = total * share(u);
      const b = covered ? v.coverBonus * share(u) : 0;
      basePts[u] += p;
      bonus[u] += b;
      earned[u] += p + b;
      return { uid: u, pts: p, bonus: b };
    });
    totalBase += total;
  }

  const ended = now >= sessionEnd(session);
  if (ended && plan) {
    for (const [t, u] of Object.entries(plan.assign)) {
      const doers = (byTask[t] || []).map((x) => x.uid);
      if (!doers.includes(u)) skips.push({ task: t, uid: u, coveredBy: doers });
    }
  }
  if (inputs.present.length) for (const u of inputs.present) expected[u] = totalBase / inputs.present.length;

  return { earned, basePts, bonus, expected, byTask, skips, ended, totalBase, delta: subVec(earned, expected) };
}

/**
 * Simulates every session from `from` to `to` in order.
 * Planning balance for a session on day d uses ACTUAL work up to day d-2 (those entries are
 * locked, so they cannot change any more) and the PLAN for everything after that. So marking
 * work late never reshuffles today's plan.
 */
export function simulate({ from, to, today, now, members, values, entries, swaps }) {
  const v = normalizePoints(values);
  const swapsBySession = {};
  for (const s of swaps || []) (swapsBySession[s.sessionId] ||= []).push(s);

  const sessions = dateRange(from, to).flatMap(sessionsForDate);
  const A = [zeroVec()]; // prefix sums of actual deltas
  const P = [zeroVec()]; // prefix sums of planned deltas
  const results = [];
  const lastDayIndex = {}; // date -> index of first session that day
  let k = 0; // sessions[0..k) are "actual" for the current cutoff

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (!(s.date in lastDayIndex)) lastDayIndex[s.date] = i;
    const cutoff = [addDays(s.date, -2), addDays(today, -1)].sort()[0];
    while (k < i && sessions[k].date <= cutoff) k++;
    const balances = addVec(A[k], subVec(P[i], P[k]));

    const recent = { yesterday: {}, earlierToday: {} };
    for (const r of results) {
      if (r.date === addDays(s.date, -1) || r.date === s.date) {
        const bucket = r.date === s.date ? recent.earlierToday : recent.yesterday;
        for (const [t, u] of Object.entries(r.plan.assign)) (bucket[u] ||= new Set()).add(t);
      }
    }

    const inputs = sessionInputs(s, entries, members);
    const plan = applySwaps(planSession(s, inputs, balances, recent, v), inputs, swapsBySession[s.id] || []);
    const actual = actualResult(s, plan, inputs, v, now);
    P.push(addVec(P[i], plannedContribution(plan, inputs)));
    A.push(addVec(A[i], actual.delta));
    results.push({ ...s, inputs, plan, actual, planningBalances: balances });
  }
  return results;
}

// Aggregate stats for sessions with from <= date <= to.
export function statsFor(results, from, to) {
  const per = Object.fromEntries(
    MEMBER_IDS.map((u) => [
      u,
      {
        uid: u,
        points: 0,
        base: 0,
        bonus: 0,
        expected: 0,
        tasks: 0,
        byTask: Object.fromEntries(TASK_KEYS.map((t) => [t, { count: 0, pts: 0 }])),
        rotisMade: 0,
        skips: 0,
        covers: 0,
        planned: 0,
        eaten: 0,
        waste: 0,
        extra: 0,
        mealsTracked: 0,
      },
    ]),
  );
  for (const r of results) {
    if (r.date < from || r.date > to) continue;
    const { actual, inputs } = r;
    for (const u of MEMBER_IDS) {
      const p = per[u];
      p.points += actual.earned[u];
      p.base += actual.basePts[u];
      p.bonus += actual.bonus[u];
      p.expected += actual.expected[u];
      const row = inputs.rows[u];
      if (!row.away && row.eaten !== null) {
        p.mealsTracked += 1;
        p.planned += row.planned;
        p.eaten += row.eaten;
        p.waste += Math.max(0, row.planned - row.eaten);
        p.extra += Math.max(0, row.eaten - row.planned);
      }
    }
    for (const [t, list] of Object.entries(actual.byTask)) {
      for (const x of list) {
        const p = per[x.uid];
        p.tasks += 1;
        p.byTask[t].count += 1;
        p.byTask[t].pts += x.pts + x.bonus;
        if (x.bonus > 0) p.covers += 1;
        if (t === 'roti') p.rotisMade += inputs.rows[x.uid].rotisMade;
      }
    }
    for (const sk of actual.skips) per[sk.uid].skips += 1;
  }
  for (const p of Object.values(per)) p.balance = p.points - p.expected;
  return per;
}

// "Who owes work to whom": greedy settle-up of balances (like splitting a bill).
export function settle(per) {
  const debtors = MEMBER_IDS.map((u) => ({ u, amt: -per[u].balance })).filter((x) => x.amt > 0.05).sort((a, b) => b.amt - a.amt);
  const creditors = MEMBER_IDS.map((u) => ({ u, amt: per[u].balance })).filter((x) => x.amt > 0.05).sort((a, b) => b.amt - a.amt);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].amt, creditors[j].amt);
    if (x > 0.05) out.push({ from: debtors[i].u, to: creditors[j].u, pts: x });
    debtors[i].amt -= x;
    creditors[j].amt -= x;
    if (debtors[i].amt <= 0.05) i++;
    if (creditors[j].amt <= 0.05) j++;
  }
  return out;
}
