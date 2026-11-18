// Every write goes through ONE audited transaction: the document + an immutable audit record.
// Firestore rules reject the write if the audit record is missing or does not match exactly.
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { todayISO } from './dates.js';
import { usualRotis } from './engine.js';

async function auditedWrite({ uid, coll, id, action, date, build }) {
  const ref = id ? doc(db, coll, id) : doc(collection(db, coll));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists() ? snap.data() : null;
    const auditRef = doc(collection(db, 'audit'));
    const after = { ...build(before), userId: uid, lastAuditId: auditRef.id };
    tx.set(ref, after);
    tx.set(auditRef, {
      userId: uid,
      coll,
      docId: ref.id,
      action,
      before,
      after,
      at: serverTimestamp(),
      date: date || todayISO(),
    });
    return ref.id;
  });
}

// ---- my entry for a session ----
export function saveEntry({ uid, session, member, patch, action }) {
  return auditedWrite({
    uid,
    coll: 'entries',
    id: `${session.id}_${uid}`,
    action,
    date: session.date,
    build: (before) => ({
      sessionId: session.id,
      date: session.date,
      meal: session.meal,
      rotisPlanned: before?.rotisPlanned ?? usualRotis(member, session.meal),
      rotisEaten: before?.rotisEaten ?? null,
      away: before?.away ?? false,
      tasksDone: before?.tasksDone ?? [],
      rotisMade: before?.rotisMade ?? 0,
      ...patch,
    }),
  });
}

// ---- my profile ----
export function updateProfile({ uid, patch, action }) {
  return auditedWrite({
    uid,
    coll: 'members',
    id: uid,
    action,
    build: (before) => {
      if (!before) throw new Error('Profile nahi mila. Owner se seed script chalwao.');
      return { ...before, ...patch };
    },
  });
}

// ---- swaps ----
export function requestSwap({ uid, toUid, session, task, giveBack, action }) {
  return auditedWrite({
    uid,
    coll: 'swaps',
    id: null,
    action,
    date: session.date,
    build: () => ({ toUid, sessionId: session.id, date: session.date, task, giveBack: giveBack || null, status: 'pending' }),
  });
}

export function cancelSwap({ uid, swap }) {
  return auditedWrite({
    uid,
    coll: 'swaps',
    id: swap.id,
    action: 'Swap request wapas li',
    date: swap.date,
    build: (before) => ({ ...before, status: 'cancelled' }),
  });
}

export function replySwap({ uid, swap, accept, action }) {
  return auditedWrite({
    uid,
    coll: 'swapReplies',
    id: swap.id,
    action,
    date: swap.date,
    build: (before) => {
      if (before) throw new Error('Is swap ka jawab pehle hi de diya hai.');
      return { swapId: swap.id, date: swap.date, accept };
    },
  });
}

// ---- disputes ----
export function raiseFlag({ uid, targetUid, session, text, action }) {
  return auditedWrite({
    uid,
    coll: 'flags',
    id: null,
    action,
    date: session.date,
    build: () => ({ targetUid, sessionId: session.id, date: session.date, text }),
  });
}

// ---- group vote ----
export function createProposal({ uid, values, basedOn, note }) {
  return auditedWrite({
    uid,
    coll: 'proposals',
    id: null,
    action: 'Naye points ka proposal diya',
    build: () => ({ values, basedOn, note, date: todayISO() }),
  });
}

export function castVote({ uid, proposalId, approve }) {
  return auditedWrite({
    uid,
    coll: 'votes',
    id: `${proposalId}_${uid}`,
    action: approve ? 'Proposal ko haan bola 👍' : 'Proposal ko na bola 👎',
    build: (before) => {
      if (before) throw new Error('Tum pehle hi vote de chuke ho.');
      return { proposalId, approve, date: todayISO() };
    },
  });
}

export function applyProposal({ uid, proposal, approvers }) {
  return auditedWrite({
    uid,
    coll: 'settings',
    id: 'points',
    action: 'Vote pass hua — naye points lagu kiye',
    build: (before) => ({
      values: proposal.values,
      version: before.version + 1,
      proposalId: proposal.id,
      approvers: approvers.slice(0, 3),
    }),
  });
}

export function friendlyError(e) {
  const code = e?.code || '';
  if (code === 'permission-denied') return 'Ye badlaav allowed nahi hai (shayad 24 ghante se purana hai, ya kisi aur ka data hai) 🔒';
  if (code === 'unavailable') return 'Internet nahi hai — thodi der baad try karo 📶';
  return e?.message || 'Kuch gadbad ho gayi 😅';
}
