// Shared constants. Nothing secret lives here (PINs are only in scripts/pins.json, never in the app).

export const EMAIL_DOMAIN = 'flat.local';

// Order matters: it is the fixed rotation order and the fixed colour order.
export const MEMBERS = [
  { id: 'shiv', name: 'Shiv', color: '#2a78d6', emoji: '🦁' },
  { id: 'chavi', name: 'Chavi', color: '#eb6834', emoji: '🦊' },
  { id: 'upasana', name: 'Upasana', color: '#1baf7a', emoji: '🐢' },
  { id: 'shristi', name: 'Shristi', color: '#eda100', emoji: '🐝' },
  { id: 'payal', name: 'Payal', color: '#e87ba4', emoji: '🦋' },
];
export const MEMBER_IDS = MEMBERS.map((m) => m.id);
export const MEMBER_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
export const nameOf = (uid) => MEMBER_BY_ID[uid]?.name ?? uid;

// Fixed task order (also used as a deterministic tie-breaker).
export const TASKS = [
  { key: 'aata', label: 'Aata goondhna', short: 'Aata', done: 'Maine aata goondha', emoji: '🥣' },
  { key: 'roti', label: 'Roti banana', short: 'Roti', done: 'Maine roti banai', emoji: '🫓' },
  { key: 'kaatna', label: 'Sabji kaatna', short: 'Kaatna', done: 'Maine sabji kaati', emoji: '🔪' },
  { key: 'sabji', label: 'Sabji banana', short: 'Sabji', done: 'Maine sabji banai', emoji: '🍛' },
  { key: 'bartan', label: 'Bartan dhona', short: 'Bartan', done: 'Maine bartan dhoye', emoji: '🧽' },
];
export const TASK_KEYS = TASKS.map((t) => t.key);
export const TASK_BY_KEY = Object.fromEntries(TASKS.map((t) => [t.key, t]));

// Default effort points. Changeable only by a group vote (3 of 5).
export const DEFAULT_POINTS = {
  aata: 2,
  rotiPer5: 1,
  kaatna: 2,
  sabji: 3,
  bartan: 3,
  weekendBartanMultiplier: 1.5,
  coverBonus: 1,
};

export const POINT_FIELDS = [
  { key: 'aata', label: 'Aata goondhna', min: 0, max: 20, step: 0.5 },
  { key: 'rotiPer5', label: 'Roti (har 5 roti par)', min: 0, max: 20, step: 0.5 },
  { key: 'kaatna', label: 'Sabji kaatna', min: 0, max: 20, step: 0.5 },
  { key: 'sabji', label: 'Sabji banana', min: 0, max: 20, step: 0.5 },
  { key: 'bartan', label: 'Bartan dhona', min: 0, max: 20, step: 0.5 },
  { key: 'weekendBartanMultiplier', label: 'Weekend lunch/dinner bartan multiplier', min: 1, max: 3, step: 0.1 },
  { key: 'coverBonus', label: 'Kisi aur ka kaam karne ka bonus', min: 0, max: 10, step: 0.5 },
];

export const VOTES_NEEDED = 3;

// Sessions. Weekdays have one combined session (nashta + tiffin cooked together).
export const MEALS = {
  wd: { key: 'wd', label: 'Nashta + Tiffin', emoji: '🌅', endHour: 11, endMin: 0 },
  b: { key: 'b', label: 'Nashta', emoji: '🌅', endHour: 11, endMin: 0 },
  l: { key: 'l', label: 'Lunch', emoji: '☀️', endHour: 16, endMin: 0 },
  d: { key: 'd', label: 'Dinner', emoji: '🌙', endHour: 23, endMin: 30 },
};

// Tuning of the planner (not user-facing points, so not part of the vote).
export const PLANNER = {
  repeatPenalty: 1000, // practically forbids the same task on consecutive days
  sameDayPenalty: 2000, // same task twice in one day (weekends) is avoided even harder
};

export const DEFAULT_USUAL_ROTIS = { weekday: 6, weekend: 3 };
