# 🫓 Rasoi Hisaab

**Kaun kya karega — sab saaf saaf, bina ladai ke.**

A live, real-time kitchen planner for a shared flat of 5 people. It decides who cooks what, tracks how many rotis everyone eats (and wastes), credits people for the work they actually did, and keeps an audit trail nobody can tamper with. The goal is simple: no more daily kitchen fights.

🔗 **Live:** https://rasoi-hisaab.web.app

---

## ✨ Features

- **Name + PIN login.** Pick your name and enter a 6-digit PIN. There's no sign-up and no email, and you stay logged in on your phone.
- **Live updates.** The "⚡ Abhi kya hua" feed shows every action on every phone within a second.
- **Daily roti planning.** Everyone enters how many rotis they'll eat, the site shows the total to make, and after the meal people enter how many they actually ate.
- **Waste tracking.** Daily, weekly and monthly waste, a (friendly) waste leaderboard 🏆, and a weekly trend for each person.
- **Fair, automatic task plan.** Covers aata, roti, sabji kaatna, sabji banana and bartan, for every session:
  - Mon–Fri: one combined Nashta + Tiffin session
  - Sat–Sun: Nashta, Lunch and Dinner
- **"Kyun?" button.** Every assignment explains itself, e.g. *"Payal ke 8 points baaki sab se kam hain"*.
- **7-day plan.** You can see the week ahead and mark yourself "bahar hoon" in advance.
- **Points for actual work.** Credit goes to whoever did the task, not whoever was assigned it. Covering for someone earns a bonus, and the assigned person gets a skip.
- **Hisaab dashboard.** Points vs. fair share, "kaun kiska kaam udhaar hai" (a settle-up view), a heatmap of who did which task, and per-person stats.
- **Swaps with consent.** A asks B to swap, and the plan only changes after B says yes from B's own login.
- **Disputes.** Anyone can raise a 🚩 flag on an entry. Flags can't be edited or deleted.
- **Group vote on points.** Changing task point values needs 3 out of 5 approvals.
- **Tamper-proof history.** Every change is logged with who, what, the old value, the new value and the time.
- **WhatsApp share.** Send today's plan to the flat group in one tap.
- **Mobile-first Hinglish UI.** Big buttons, colourful design.

## 🔐 Security model

Everyone can **see** everything, but each person can **change only their own data**. This is enforced on the server by Firestore security rules, not just by hiding buttons:

- Every document has a `userId`. A write is accepted only if `request.auth.uid` matches it.
- Each write must create a matching, immutable audit record in the same transaction, with exact before and after values. Otherwise it is rejected.
- Entries lock 24 hours after their day ends, even for the owner.
- Shared point values can only change through a proposal that has 3 distinct approving votes.
- **28 rule tests** run on the Firestore emulator and prove that a logged-in user can't modify another user's data, even from the browser console.

The full explanation is in [docs/DESIGN.md](docs/DESIGN.md).

## 🧠 How the plan is made

The plan is **never stored**. Every phone computes it from the same data with a deterministic algorithm, so nobody can "edit" it.

1. Each person has a **balance** = points earned − fair share. Fair share counts only the sessions they were present for.
2. Tasks are handed out heaviest first, each to the present person with the lowest balance.
3. It avoids giving the same task to the same person on consecutive days, or twice on the same weekend day.
4. Ties are broken by a rotation.
5. People marked "bahar hoon" are skipped.
6. Balances use only locked past data, so ticking work late never reshuffles today's plan.

Pseudocode and the data model are in [docs/DESIGN.md](docs/DESIGN.md).

## 🛠 Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Firebase Authentication, Cloud Firestore (real-time), Firebase Hosting |
| Tests | Vitest, `@firebase/rules-unit-testing` with the Firestore emulator |
| Cost | ₹0: runs entirely on Firebase's free Spark plan (no Cloud Functions) |

## 🚀 Getting started

```bash
git clone https://github.com/Arunendra21/rasoi-hisaab.git
cd rasoi-hisaab
npm install
cp .env.example .env                              # add your Firebase web config
cp scripts/pins.example.json scripts/pins.json    # set the 6-digit PINs
# put your Firebase Admin key at scripts/serviceAccount.json
npm run seed                                      # creates the 5 logins
npm run dev
```

Deploy:

```bash
npx firebase login
npm run deploy
```

Step-by-step setup for beginners is in [docs/SETUP.md](docs/SETUP.md).

> `scripts/pins.json`, `scripts/serviceAccount.json` and `.env` are git-ignored. Never commit them.

## 🧪 Tests

```bash
npm test             # planner / scoring logic
npm run test:rules   # security rules on the Firestore emulator (needs Java)
```

## 📁 Project structure

```
firestore.rules           security rules (owner-only writes, audit coupling, 3-of-5 vote)
scripts/seed.mjs          one-time account + data seed (reads git-ignored pins.json)
src/lib/engine.js         deterministic planner + scoring (pure functions)
src/lib/actions.js        every write = document + audit record in one transaction
src/hooks/useFlatData.js  real-time Firestore listeners
src/screens/              Login, Aaj (live feed), 7 Din, Hisaab, History, Settings
tests/                    planner tests + security-rule tests
docs/                     design notes, setup guide, Hinglish user guide
```

## 📖 For flatmates

How to use it, in Hinglish: [docs/GUIDE-hinglish.md](docs/GUIDE-hinglish.md). In short: *apna naam chuno, PIN daalo, bas!*
