// Date helpers. All dates are local "YYYY-MM-DD" strings (the flat is in India, IST).
import { MEALS } from './constants.js';

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function isWeekend(s) {
  const day = fromISO(s).getDay();
  return day === 0 || day === 6;
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Monday of the week containing s.
export function weekStart(s) {
  const d = fromISO(s);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

export function monthStart(s) {
  return `${s.slice(0, 7)}-01`;
}

export function monthEnd(s) {
  const d = fromISO(monthStart(s));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISO(d);
}

export function prevMonthStart(s) {
  const d = fromISO(monthStart(s));
  d.setMonth(d.getMonth() - 1);
  return toISO(d);
}

export function mealsForDate(s) {
  return isWeekend(s) ? ['b', 'l', 'd'] : ['wd'];
}

export function sessionsForDate(s) {
  return mealsForDate(s).map((meal) => ({ id: `${s}_${meal}`, date: s, meal }));
}

export function sessionEnd(session) {
  const d = fromISO(session.date);
  const m = MEALS[session.meal];
  d.setHours(m.endHour, m.endMin, 0, 0);
  return d;
}

// Must match firestore.rules: an entry can be edited until 24 hours after its day ends.
export function lockTime(date) {
  const d = fromISO(date);
  d.setDate(d.getDate() + 2);
  return d;
}

export function isLocked(date, now = new Date()) {
  return now >= lockTime(date);
}

const DAYS = ['Ravivaar', 'Somvaar', 'Mangalvaar', 'Budhvaar', 'Guruvaar', 'Shukravaar', 'Shanivaar'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(s, today) {
  if (today && s === today) return 'Aaj';
  if (today && s === addDays(today, 1)) return 'Kal';
  if (today && s === addDays(today, -1)) return 'Kal (beeta hua)';
  const d = fromISO(s);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function shortDate(s) {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
