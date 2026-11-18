import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, configMissing } from './firebase.js';
import { MEMBER_IDS, nameOf } from './lib/constants.js';
import { useFlatData } from './hooks/useFlatData.js';
import { Avatar, useToast } from './components/ui.jsx';
import Login from './screens/Login.jsx';
import Today from './screens/Today.jsx';
import Week from './screens/Week.jsx';
import Stats from './screens/Stats.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';

const TABS = [
  { key: 'today', label: 'Aaj', icon: '🏠' },
  { key: 'week', label: '7 Din', icon: '📅' },
  { key: 'stats', label: 'Hisaab', icon: '📊' },
  { key: 'history', label: 'History', icon: '📜' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  if (configMissing) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-black">Setup baaki hai</h1>
        <p className="mt-2">.env file mein Firebase config daalo (docs/SETUP.md dekho), phir dobara build karo.</p>
      </div>
    );
  }
  if (user === undefined) return <Splash />;
  if (!user || !MEMBER_IDS.includes(user.uid)) return <Login />;
  return <Shell uid={user.uid} />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-5xl" aria-label="load ho raha hai">
      <span className="animate-bounce">🫓</span>
    </div>
  );
}

function Shell({ uid }) {
  const [tab, setTab] = useState('today');
  const data = useFlatData(true);
  useLiveAlerts(uid, data);

  if (data.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-black">Data load nahi hua 😕</h1>
        <p className="mt-2 text-stone-600">{data.error.message}</p>
        <button type="button" className="mt-4 font-bold text-orange-600 underline" onClick={() => signOut(auth)}>Logout</button>
      </div>
    );
  }
  if (data.loading) return <Splash />;

  const pendingForMe = data.swaps.filter((s) => s.toUid === uid && s.state === 'pending' && s.date >= data.today).length;
  const screen = {
    today: <Today uid={uid} data={data} />,
    week: <Week uid={uid} data={data} />,
    stats: <Stats uid={uid} data={data} />,
    history: <History uid={uid} data={data} />,
    settings: <Settings uid={uid} data={data} />,
  }[tab];

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-orange-50/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Avatar uid={uid} />
          <div>
            <div className="text-xs font-bold text-stone-500">Namaste 🙏</div>
            <div className="text-lg font-black leading-tight">{nameOf(uid)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          LIVE
        </div>
      </header>

      <main className="px-4">{screen}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); window.scrollTo(0, 0); }}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`relative flex min-h-[64px] flex-col items-center justify-center text-xs font-extrabold ${tab === t.key ? 'text-orange-600' : 'text-stone-500'}`}
            >
              <span className="text-2xl">{t.icon}</span>
              {t.label}
              {t.key === 'today' && pendingForMe > 0 && (
                <span className="absolute right-4 top-2 rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{pendingForMe}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// When something new happens that concerns me (swap request, flag on my entry), pop a toast,
// vibrate, and — if the tab is in the background and I allowed it — a browser notification.
function useLiveAlerts(uid, data) {
  const toast = useToast();
  const seen = useRef(null);
  const enabled = data.members[uid]?.notifications !== false;
  useEffect(() => {
    if (data.loading) return;
    const ids = new Set(data.feed.map((f) => f.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = data.feed.filter((f) => !seen.current.has(f.id) && f.userId !== uid);
    seen.current = ids;
    if (!enabled) return;
    for (const f of fresh) {
      const forMe =
        (f.coll === 'swaps' && f.after?.toUid === uid && f.after?.status === 'pending') ||
        (f.coll === 'flags' && f.after?.targetUid === uid);
      const text = `${nameOf(f.userId)}: ${f.action}`;
      if (forMe) {
        toast(`🔔 ${text}`);
        if (navigator.vibrate) navigator.vibrate(200);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Rasoi Hisaab', { body: text, icon: '/favicon.svg' });
          } catch {
            /* some mobile browsers only allow notifications from a service worker */
          }
        }
      }
    }
  }, [data.feed, data.loading, uid, enabled, toast]);
}
