import { describe, expect, it } from 'vitest';
import { simulate, statsFor, settle, planSession, sessionInputs } from '../src/lib/engine.js';
import { MEMBER_IDS } from '../src/lib/constants.js';

const members = Object.fromEntries(MEMBER_IDS.map((u) => [u, { usualRotisWeekday: 6, usualRotisWeekend: 3 }]));
const entry = (sessionId, uid, extra = {}) => {
  const [date, meal] = sessionId.split('_');
  return [`${sessionId}_${uid}`, { userId: uid, sessionId, date, meal, rotisPlanned: 6, rotisEaten: null, away: false, tasksDone: [], rotisMade: 0, ...extra }];
};
const base = { from: '2026-11-02', to: '2026-11-15', today: '2026-11-12', now: new Date(2026, 10, 12, 12, 0), members, values: undefined, swaps: [] };

describe('planner', () => {
  it('is deterministic', () => {
    const a = simulate({ ...base, entries: {} });
    const b = simulate({ ...base, entries: {} });
    expect(a.map((r) => r.plan.assign)).toEqual(b.map((r) => r.plan.assign));
  });

  it('assigns every task to a present person and skips people who are away', () => {
    const entries = Object.fromEntries([entry('2026-11-12_wd', 'payal', { away: true })]);
    const r = simulate({ ...base, entries }).find((x) => x.id === '2026-11-12_wd');
    expect(Object.keys(r.plan.assign).sort()).toEqual(['aata', 'bartan', 'kaatna', 'roti', 'sabji']);
    expect(Object.values(r.plan.assign)).not.toContain('payal');
    expect(r.inputs.totalRotis).toBe(24);
  });

  // On weekdays (1 session/day, 5 tasks, 5 people) a repeat is always avoidable.
  // (On weekends each person does ~3 of 5 tasks per day, so some repeat is mathematically unavoidable.)
  it('never gives the same task to the same person on consecutive weekdays', () => {
    const res = simulate({ ...base, entries: {} });
    const days = {};
    for (const r of res) (days[r.date] ||= []).push(r);
    const dates = Object.keys(days).sort();
    for (let i = 1; i < dates.length; i++) {
      if (days[dates[i]][0].meal !== 'wd' || days[dates[i - 1]][0].meal !== 'wd') continue;
      const prev = new Set(days[dates[i - 1]].flatMap((r) => Object.entries(r.plan.assign).map(([t, u]) => `${t}:${u}`)));
      for (const r of days[dates[i]]) {
        for (const [t, u] of Object.entries(r.plan.assign)) expect(prev.has(`${t}:${u}`)).toBe(false);
      }
    }
  });

  it('never repeats a task for the same person within one weekend day', () => {
    const res = simulate({ ...base, entries: {} }).filter((r) => r.meal !== 'wd');
    const seen = {};
    for (const r of res) for (const [t, u] of Object.entries(r.plan.assign)) {
      const k = `${r.date}:${t}:${u}`;
      expect(seen[k]).toBeUndefined();
      seen[k] = true;
    }
  });

  it('gives the heaviest task to the person who owes the most work', () => {
    const s = { id: '2026-11-12_wd', date: '2026-11-12', meal: 'wd' };
    const inputs = sessionInputs(s, {}, members);
    const balances = { shiv: 5, chavi: 5, upasana: 5, shristi: 5, payal: -8 };
    const plan = planSession(s, inputs, balances, { yesterday: {}, earlierToday: {} }, undefined);
    // 30 rotis => roti = 6 pts, the heaviest
    expect(plan.assign.roti).toBe('payal');
    expect(plan.reasons.roti).toMatch(/Payal/);
  });

  it('credits actual work, gives cover bonus, and counts a skip for the assignee', () => {
    const first = simulate({ ...base, entries: {} }).find((x) => x.id === '2026-11-10_wd');
    const assignee = first.plan.assign.bartan;
    const coverer = MEMBER_IDS.find((u) => u !== assignee);
    const entries = Object.fromEntries([entry('2026-11-10_wd', coverer, { tasksDone: ['bartan'] })]);
    const r = simulate({ ...base, entries }).find((x) => x.id === '2026-11-10_wd');
    expect(r.plan.assign.bartan).toBe(assignee); // marking work does not change that day's plan
    expect(r.actual.earned[coverer]).toBe(3 + 1);
    expect(r.actual.skips.map((s) => s.uid)).toContain(assignee);
  });

  it('marking work late does not reshuffle today or tomorrow', () => {
    const before = simulate({ ...base, entries: {} });
    const entries = Object.fromEntries([entry('2026-11-11_wd', 'shiv', { tasksDone: ['aata', 'roti', 'kaatna', 'sabji', 'bartan'], rotisMade: 30 })]);
    const after = simulate({ ...base, entries });
    for (const id of ['2026-11-12_wd', '2026-11-13_wd']) {
      expect(after.find((x) => x.id === id).plan.assign).toEqual(before.find((x) => x.id === id).plan.assign);
    }
  });

  it('applies only accepted swaps', () => {
    const r0 = simulate({ ...base, entries: {} }).find((x) => x.id === '2026-11-13_wd');
    const A = r0.plan.assign.sabji;
    const B = MEMBER_IDS.find((u) => u !== A);
    const swaps = [{ id: 'x', userId: A, toUid: B, sessionId: '2026-11-13_wd', task: 'sabji', giveBack: null }];
    const r1 = simulate({ ...base, entries: {}, swaps }).find((x) => x.id === '2026-11-13_wd');
    expect(r1.plan.assign.sabji).toBe(B);
  });
});

describe('stats', () => {
  it('computes waste and settles balances', () => {
    const entries = Object.fromEntries([
      entry('2026-11-10_wd', 'shiv', { rotisPlanned: 6, rotisEaten: 4, tasksDone: ['sabji', 'bartan'] }),
      entry('2026-11-10_wd', 'chavi', { rotisPlanned: 5, rotisEaten: 5 }),
    ]);
    const res = simulate({ ...base, entries });
    const per = statsFor(res, '2026-11-10', '2026-11-10');
    expect(per.shiv.waste).toBe(2);
    expect(per.chavi.waste).toBe(0);
    expect(per.shiv.points).toBeGreaterThan(0);
    const debts = settle(per);
    expect(debts.every((d) => d.to === 'shiv')).toBe(true);
    const total = debts.reduce((s, d) => s + d.pts, 0);
    expect(Math.abs(total - per.shiv.balance)).toBeLessThan(0.2);
  });
});
