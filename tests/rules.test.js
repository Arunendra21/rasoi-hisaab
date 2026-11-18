// Proves on the Firestore emulator that nobody can write anyone else's data.
// Run: npm run test:rules   (needs Java; see docs/SETUP.md)
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const DEFAULT_POINTS = { aata: 2, rotiPer5: 1, kaatna: 2, sabji: 3, bartan: 3, weekendBartanMultiplier: 1.5, coverBonus: 1 };
const MEMBERS = ['shiv', 'chavi', 'upasana', 'shristi', 'payal'];

let env;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Rules use IST; compute "today" in IST so tests pass in any machine timezone.
const istNow = () => new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
const dayOffset = (n) => { const d = istNow(); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = dayOffset(0);

const fs = (uid) => env.authenticatedContext(uid).firestore();

function entryData(uid, date = TODAY, extra = {}) {
  return { userId: uid, sessionId: `${date}_wd`, date, meal: 'wd', rotisPlanned: 5, rotisEaten: null, away: false, tasksDone: [], rotisMade: 0, ...extra };
}

// Mirrors src/lib/actions.js: the document + its audit record in one batch.
async function audited(db, actor, coll, id, data, before = null, auditOverrides = {}) {
  const auditRef = doc(collection(db, 'audit'));
  const after = { ...data, lastAuditId: auditRef.id };
  const b = writeBatch(db);
  b.set(doc(db, coll, id), after);
  b.set(auditRef, { userId: actor, coll, docId: id, action: 'test', before, after, at: serverTimestamp(), date: TODAY, ...auditOverrides });
  return b.commit();
}

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rasoi',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    for (const u of MEMBERS) {
      await setDoc(doc(db, 'members', u), { userId: u, name: u, usualRotisWeekday: 6, usualRotisWeekend: 3, notifications: true, lastAuditId: 'seed' });
    }
    await setDoc(doc(db, 'settings', 'points'), { values: DEFAULT_POINTS, version: 1, proposalId: 'seed', approvers: [], userId: 'seed', lastAuditId: 'seed' });
  });
});

describe('reading', () => {
  it('logged-out users cannot read anything', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'members/shiv')));
  });
  it('a non-member account cannot read', async () => {
    await assertFails(getDoc(doc(fs('stranger'), 'members/shiv')));
  });
  it('every member can read everyone (transparency)', async () => {
    await assertSucceeds(getDoc(doc(fs('payal'), 'members/shiv')));
  });
});

describe('entries: only your own', () => {
  it('Shiv can create his own entry (with audit)', async () => {
    await assertSucceeds(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_shiv`, entryData('shiv')));
  });
  it('Shiv cannot create an entry for Chavi (userId chavi)', async () => {
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_chavi`, entryData('chavi')));
  });
  it("Shiv cannot write his data into Chavi's document id", async () => {
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_chavi`, entryData('shiv')));
  });
  it("Shiv cannot update Chavi's existing entry (e.g. untick her task)", async () => {
    await audited(fs('chavi'), 'chavi', 'entries', `${TODAY}_wd_chavi`, entryData('chavi', TODAY, { tasksDone: ['sabji'] }));
    const before = (await getDoc(doc(fs('shiv'), 'entries', `${TODAY}_wd_chavi`))).data();
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_chavi`, { ...before, tasksDone: [] }, before));
    await assertFails(updateDoc(doc(fs('shiv'), 'entries', `${TODAY}_wd_chavi`), { tasksDone: [] }));
  });
  it('nobody can delete an entry, not even the owner', async () => {
    await audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_shiv`, entryData('shiv'));
    await assertFails(deleteDoc(doc(fs('shiv'), 'entries', `${TODAY}_wd_shiv`)));
  });
  it('a write without an audit record is rejected', async () => {
    await assertFails(setDoc(doc(fs('shiv'), 'entries', `${TODAY}_wd_shiv`), { ...entryData('shiv'), lastAuditId: 'nope' }));
  });
  it('an audit record that lies about the new value is rejected', async () => {
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_shiv`, entryData('shiv'), null, { after: { fake: true } }));
  });
  it('an audit record cannot claim another actor', async () => {
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${TODAY}_wd_shiv`, entryData('shiv'), null, { userId: 'payal' }));
  });
  it('entries older than 24h after their day are locked, even for the owner', async () => {
    const old = dayOffset(-3);
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${old}_wd_shiv`, entryData('shiv', old)));
  });
  it("yesterday's entry is still editable", async () => {
    const y = dayOffset(-1);
    await assertSucceeds(audited(fs('shiv'), 'shiv', 'entries', `${y}_wd_shiv`, entryData('shiv', y, { tasksDone: ['bartan'] })));
  });
  it('you cannot claim work for a future day', async () => {
    const t = dayOffset(2);
    await assertFails(audited(fs('shiv'), 'shiv', 'entries', `${t}_wd_shiv`, entryData('shiv', t, { tasksDone: ['bartan'] })));
    await assertSucceeds(audited(fs('shiv'), 'shiv', 'entries', `${t}_wd_shiv`, entryData('shiv', t, { away: true })));
  });
});

describe('audit log is append-only', () => {
  it('nobody can edit or delete an audit record', async () => {
    const db = fs('shiv');
    await audited(db, 'shiv', 'entries', `${TODAY}_wd_shiv`, entryData('shiv'));
    const e = (await getDoc(doc(db, 'entries', `${TODAY}_wd_shiv`))).data();
    await assertFails(updateDoc(doc(db, 'audit', e.lastAuditId), { action: 'hacked' }));
    await assertFails(deleteDoc(doc(db, 'audit', e.lastAuditId)));
  });
  it('a standalone fake audit record is rejected', async () => {
    await assertFails(setDoc(doc(fs('shiv'), 'audit', 'x'), { userId: 'shiv', coll: 'entries', docId: 'y', action: 'x', before: null, after: {}, at: serverTimestamp(), date: TODAY }));
  });
});

describe('profiles', () => {
  it('Shiv can change his own usual roti count', async () => {
    const db = fs('shiv');
    const before = (await getDoc(doc(db, 'members/shiv'))).data();
    await assertSucceeds(audited(db, 'shiv', 'members', 'shiv', { ...before, usualRotisWeekday: 4 }, before));
  });
  it("Shiv cannot change Chavi's profile", async () => {
    const db = fs('shiv');
    const before = (await getDoc(doc(db, 'members/chavi'))).data();
    await assertFails(audited(db, 'shiv', 'members', 'chavi', { ...before, usualRotisWeekday: 0 }, before));
  });
  it('nobody can rename themselves or change their userId', async () => {
    const db = fs('shiv');
    const before = (await getDoc(doc(db, 'members/shiv'))).data();
    await assertFails(audited(db, 'shiv', 'members', 'shiv', { ...before, name: 'Boss' }, before));
  });
});

describe('swaps need consent from the other person', () => {
  async function makeSwap() {
    await audited(fs('shiv'), 'shiv', 'swaps', 'sw1', { userId: 'shiv', toUid: 'payal', sessionId: `${TODAY}_wd`, date: TODAY, task: 'bartan', giveBack: null, status: 'pending' });
  }
  it('Shiv can request; only Payal can answer', async () => {
    await makeSwap();
    await assertFails(audited(fs('chavi'), 'chavi', 'swapReplies', 'sw1', { userId: 'chavi', swapId: 'sw1', date: TODAY, accept: true }));
    await assertFails(audited(fs('shiv'), 'shiv', 'swapReplies', 'sw1', { userId: 'shiv', swapId: 'sw1', date: TODAY, accept: true }));
    await assertSucceeds(audited(fs('payal'), 'payal', 'swapReplies', 'sw1', { userId: 'payal', swapId: 'sw1', date: TODAY, accept: true }));
  });
  it('Shiv cannot create a swap pretending to be Chavi', async () => {
    await assertFails(audited(fs('shiv'), 'shiv', 'swaps', 'sw2', { userId: 'chavi', toUid: 'payal', sessionId: `${TODAY}_wd`, date: TODAY, task: 'bartan', giveBack: null, status: 'pending' }));
  });
  it('requester cannot cancel after the answer', async () => {
    await makeSwap();
    await audited(fs('payal'), 'payal', 'swapReplies', 'sw1', { userId: 'payal', swapId: 'sw1', date: TODAY, accept: true });
    const before = (await getDoc(doc(fs('shiv'), 'swaps/sw1'))).data();
    await assertFails(audited(fs('shiv'), 'shiv', 'swaps', 'sw1', { ...before, status: 'cancelled' }, before));
  });
});

describe('flags: raise only', () => {
  it('anyone can raise a flag, nobody can edit/delete it', async () => {
    await assertSucceeds(audited(fs('chavi'), 'chavi', 'flags', 'f1', { userId: 'chavi', targetUid: 'shiv', sessionId: `${TODAY}_wd`, date: TODAY, text: 'bartan aadhe dhule' }));
    await assertFails(updateDoc(doc(fs('chavi'), 'flags/f1'), { text: 'x' }));
    await assertFails(deleteDoc(doc(fs('shiv'), 'flags/f1')));
  });
});

describe('point values change only by a 3-of-5 vote', () => {
  const NEW = { ...DEFAULT_POINTS, bartan: 4 };
  async function propose() {
    await audited(fs('shiv'), 'shiv', 'proposals', 'p1', { userId: 'shiv', values: NEW, basedOn: 1, note: '', date: TODAY });
  }
  const vote = (u, approve = true) => audited(fs(u), u, 'votes', `p1_${u}`, { userId: u, proposalId: 'p1', approve, date: TODAY });
  async function apply(uid, approvers, values = NEW) {
    const db = fs(uid);
    const before = (await getDoc(doc(db, 'settings/points'))).data();
    return audited(db, uid, 'settings', 'points', { values, version: 2, proposalId: 'p1', approvers, userId: uid }, before);
  }

  it('cannot vote on behalf of someone else', async () => {
    await propose();
    await assertFails(audited(fs('shiv'), 'shiv', 'votes', 'p1_chavi', { userId: 'chavi', proposalId: 'p1', approve: true, date: TODAY }));
    await assertFails(audited(fs('shiv'), 'shiv', 'votes', 'p1_chavi', { userId: 'shiv', proposalId: 'p1', approve: true, date: TODAY }));
  });
  it('2 approvals are not enough', async () => {
    await propose();
    await vote('shiv');
    await vote('chavi');
    await assertFails(apply('shiv', ['shiv', 'chavi', 'payal']));
  });
  it('a "no" vote does not count as approval', async () => {
    await propose();
    await vote('shiv');
    await vote('chavi');
    await vote('payal', false);
    await assertFails(apply('shiv', ['shiv', 'chavi', 'payal']));
  });
  it('3 approvals pass — but values must be exactly the proposed ones', async () => {
    await propose();
    await vote('shiv');
    await vote('chavi');
    await vote('payal');
    await assertFails(apply('upasana', ['shiv', 'chavi', 'payal'], { ...NEW, bartan: 20 }));
    await assertSucceeds(apply('upasana', ['shiv', 'chavi', 'payal']));
  });
  it('settings cannot be edited directly', async () => {
    await assertFails(updateDoc(doc(fs('shiv'), 'settings/points'), { 'values.bartan': 0 }));
  });
});
