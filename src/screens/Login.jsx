import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { EMAIL_DOMAIN, MEMBERS } from '../lib/constants.js';
import { Avatar, Button } from '../components/ui.jsx';

export default function Login() {
  const [who, setWho] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!who || pin.length !== 6) return;
    setBusy(true);
    setErr('');
    try {
      await signInWithEmailAndPassword(auth, `${who}@${EMAIL_DOMAIN}`, pin);
    } catch (ex) {
      const c = ex?.code || '';
      if (c === 'auth/too-many-requests') setErr('Bahut baar galat PIN daala 🙈 Thodi der baad try karo.');
      else if (c === 'auth/network-request-failed') setErr('Internet nahi chal raha 📶');
      else setErr('Galat PIN 🙅 Dobara try karo.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10 pt-10">
      <div className="mb-8 text-center">
        <div className="text-6xl">🫓</div>
        <h1 className="mt-2 text-3xl font-black text-orange-600">Rasoi Hisaab</h1>
        <p className="mt-1 font-bold text-stone-500">Kaun kya karega — sab saaf saaf, bina ladai ke</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-lg font-black">1. Apna naam chuno</legend>
          <div className="grid grid-cols-2 gap-3">
            {MEMBERS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setWho(m.id); setErr(''); }}
                aria-pressed={who === m.id}
                className={`flex min-h-[64px] items-center gap-3 rounded-2xl px-3 text-left text-lg font-extrabold ring-2 transition ${who === m.id ? 'bg-white shadow-md' : 'bg-white/60 ring-transparent'}`}
                style={who === m.id ? { '--tw-ring-color': m.color } : undefined}
              >
                <Avatar uid={m.id} />
                {m.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pin" className="mb-3 block text-lg font-black">2. PIN daalo</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="h-16 w-full rounded-2xl bg-white text-center text-3xl font-black tracking-[0.5em] ring-2 ring-orange-200 focus:outline-none focus:ring-orange-500"
          />
        </div>

        {err && <p className="rounded-2xl bg-rose-100 p-3 text-center font-bold text-rose-700" role="alert">{err}</p>}

        <Button big type="submit" className="w-full" disabled={!who || pin.length !== 6 || busy}>
          {busy ? 'Ruko…' : 'Andar chalo 🚪'}
        </Button>
        <p className="text-center text-sm font-semibold text-stone-500">PIN bhool gaye? Flat owner se reset karwao.</p>
      </form>
    </div>
  );
}
