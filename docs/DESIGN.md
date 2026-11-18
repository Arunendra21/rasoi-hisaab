# Rasoi Hisaab — Design

A live website (one link, opens in any phone browser) for 5 flatmates: Shiv, Chavi, Upasana, Shristi, Payal.
Every change on one phone appears on all phones within a second (Firestore real-time listeners).

## Design decisions

1. **Live website, not an installable app.** Firebase Hosting gives one `https://<project>.web.app` link. No install, no app store.
2. **Timezone = IST.** "Today", session end times and the 24-hour lock all use India time.
3. **Sessions.** Mon–Fri: one session "Nashta + Tiffin" (ends 11:00). Sat–Sun: Nashta (ends 11:00), Lunch (16:00), Dinner (23:30). After a session ends, unmarked assigned tasks become "skip".
4. **24-hour lock** = an entry stays editable until 24 hours after its **day** ends (e.g. Monday's entries lock at Wednesday 00:00 IST). Locking 24h after *creation* would break entries made days in advance ("I'm away on Saturday").
5. **Roti count.** If you don't enter anything, your *usual* count is used (separate usual counts for weekday nashta+tiffin and for each weekend meal). Marking yourself "bahar hoon" removes you from that session's roti total and from task assignment.
6. **Roti points** = rotis/5 × 1 pt. If several people mark "roti", points are split by the rotis each says they made.
   Other tasks done by several people are split equally.
7. **Cover bonus.** If you do a task that was assigned to someone else (and they didn't do it), you get the task points **plus** `coverBonus` (default +1). The assigned person gets a skip (no negative points, but their fair share still counts, so their balance goes down).
8. **Fairness metric = balance**, not raw points: `balance = points earned − fair share`, where fair share of each session = total work actually done ÷ people present (not away). Someone who was away for a week does not "owe" for that week.
9. **Planning window** = from the 1st of last month. Balances start at 0 there. (Keeps reads small on the free plan; older months are still visible in History.)
10. **Notifications.** Real scheduled push ("6am: aaj tumhara kaam…") needs a server (Cloud Functions ⇒ paid Blaze plan). On the free plan the site shows the "Aaj tumhara kaam" card on open, pops an in-site alert + vibration when someone sends you a swap or flags your entry, and has a **WhatsApp share** button for today's plan.
11. **Votes.** A proposal passes with 3 "haan" votes. Proposals are tied to the settings version they were made against, so an old proposal can't overwrite a newer decision.
12. **PINs** are Firebase Auth passwords for hidden emails `<name>@flat.local`. Only the owner changes them (re-run the seed with `--reset-pins`, or Firebase console → Authentication).

## Data model (Firestore)

Every document has `userId` = the uid of the person who owns it, and `lastAuditId` = the audit record written with it.
Member uids are fixed: `shiv`, `chavi`, `upasana`, `shristi`, `payal`.

| Collection / id | Fields | Who can write |
|---|---|---|
| `members/{uid}` | userId, name, usualRotisWeekday, usualRotisWeekend, notifications, lastAuditId | Created by seed. Owner may update only usual rotis + notifications |
| `entries/{date}_{meal}_{uid}` | userId, sessionId (`date_meal`), date, meal (`wd`/`b`/`l`/`d`), rotisPlanned, rotisEaten (null until entered), away, tasksDone[], rotisMade, lastAuditId | Owner only; never deleted; locked after the day + 24h |
| `swaps/{auto}` | userId (requester A), toUid (B), sessionId, date, task, giveBack (task or null), status (`pending`/`cancelled`), lastAuditId | A creates; A may cancel only before B answers |
| `swapReplies/{swapId}` | userId (B), swapId, date, accept, lastAuditId | Only B (the `toUid`), once |
| `flags/{auto}` | userId (raiser), targetUid, sessionId, date, text, lastAuditId | Anyone, for themselves; never edited or deleted |
| `proposals/{auto}` | userId, values{7 point fields}, basedOn (settings version), note, date, lastAuditId | Anyone, as themselves; immutable |
| `votes/{proposalId}_{uid}` | userId, proposalId, approve, date, lastAuditId | Each person, once, as themselves |
| `settings/points` | values{…}, version, proposalId, approvers[3], userId (who applied), lastAuditId | Only by applying a proposal with 3 approving votes |
| `audit/{auto}` | userId (actor), coll, docId, action (text), before, after, at (server time), date | Create only, coupled to the write; never updated/deleted |

**The plan is never stored.** It is computed on each phone from the data above by a deterministic function, so no one can "edit" the plan; you can only change your own inputs (availability, rotis) or agree to a swap.

## Assignment algorithm

```
for each session S in date order (from window start to today+7):
    present  = members not marked "away" for S
    rotis    = Σ rotisPlanned (or usual) of present
    tasks    = [aata, roti, kaatna, sabji, bartan]   (aata/roti dropped if rotis == 0)
    pts[t]   = aata 2 | roti rotis/5 | kaatna 2 | sabji 3 | bartan 3 (×1.5 weekend lunch/dinner)

    # balances use ACTUAL work only for days ≤ S.date−2 (already locked, can't change)
    # and the PLAN for the last day + earlier sessions today. So late ticks never reshuffle today.
    balance[u] = Σ actual(earned−fairShare) for sessions on days ≤ min(S.date−2, today−1)
               + Σ planned(earned−fairShare) for later sessions before S

    cap = ceil(|tasks| / |present|) + (|present| ≥ 3 ? 1 : 0)
    load[u] = 0
    for t in tasks sorted by pts desc (ties: fixed task order):
        candidates = present with < cap tasks in S
        score(u) = balance[u] + load[u]
                 + 2000 if u had t in an earlier session today
                 + 1000 if u had t yesterday
        pick u with lowest score; tie → rotation order (member index − session number) mod 5
        assign t → u; load[u] += pts[t]
        reason = why u (lowest balance / rotation / who was skipped and why)

    apply accepted swaps (A→B, optional giveBack) if A still holds that task
    actual(S) = points for tasks people ticked themselves (+cover bonus), skips after session end
```

Properties (covered by `tests/engine.test.js`): deterministic; away people never assigned; no same task on consecutive weekdays; no same task twice in a weekend day; the most-owed person gets the heaviest task; ticking work late doesn't change today's or tomorrow's plan; only accepted swaps change the plan.

## Screens

1. **Login** – 5 name buttons + 6-digit PIN. "Galat PIN" / too-many-tries messages.
2. **Aaj (home)** – "Aaj tumhara kaam" card + WhatsApp share; swap inbox (accept/reject/cancel); **⚡ Abhi kya hua — live feed** of everyone's actions; one card per session: total rotis, my khana (away toggle, kitni khaoge / kitni khayi), plan with "Kyun?" reasons, ✅ / skip / covered-by, "Mera kaam ho gaya ✅", per-task "Maine … ✅" ticks + rotis made, read-only "Sab ka haal" for others, 🚩 flags.
3. **7 Din** – next 7 days, my tasks highlighted; tap a session to mark away / roti count in advance.
4. **Hisaab** – week / month / last month: points bars with fair share & balance, "kaun kiska kaam udhaar", task heatmap, per-person stats (points, tasks, rotis made, skips, covers, bonus), waste leaderboard (funny titles), waste totals (today/week/month) and weekly waste trend per person.
5. **History** – full audit log with date + person filters, showing old → new values.
6. **Settings** – my usual rotis, alerts on/off, current points, proposals + voting, logout.

## Security rules (firestore.rules) — what each block does

- `isMember()` — signed in **and** uid is one of the 5. Any other Firebase account gets nothing.
- `ownsNew()` / `ownsOld()` — `request.resource.data.userId == request.auth.uid` and `resource.data.userId == request.auth.uid`. Used on every write so you can't create data in someone else's name or touch theirs.
- `audited(coll, id, before)` — the same batch/transaction must create a **new** `audit/{lastAuditId}` whose `userId` is you, whose `coll/docId` is this document, whose `before` equals the stored old value and whose `after` equals exactly what you're writing. So every change is logged truthfully, and the log can't be skipped.
- `members` — no create/delete from the site; you may update only your own doc and only `usualRotis*`, `notifications`.
- `entries` — doc id must be `<date>_<meal>_<your uid>` (you can't write into someone else's id), field types/ranges validated, tasks only from the 5 known ones, no ticking work for a day that hasn't started, `editable(date)` = up to 15 days ahead and until 24h after the day ends. No deletes.
- `swaps` / `swapReplies` — requester creates as themselves; the reply's doc id is the swap id, and only the `toUid` person can create it, once. Requester can cancel only while no reply exists.
- `flags` — create only, as yourself, 1–300 chars. No update/delete — disputes can't be erased.
- `proposals` / `votes` — create only, as yourself; vote id `<proposal>_<you>` ⇒ one vote each, no voting for others.
- `settings/points` — the only shared document. An update is allowed only if: version goes +1, the proposal was made against the current version, the new values are **exactly** the proposal's values, and 3 distinct listed approvers each have a `votes` doc with `approve == true`.
- `audit` — create only when coupled to a real write (`getAfter(target).lastAuditId == this id`), `at` must be server time. No update/delete ever.
- everything else — denied.

Proved by `tests/rules.test.js` (28 tests on the Firestore emulator), e.g. Shiv can't create/update Chavi's entry, can't write into her doc id, can't skip or fake the audit, can't vote for her, can't answer a swap meant for Payal, can't change points with 2 votes or with values different from what was voted.
