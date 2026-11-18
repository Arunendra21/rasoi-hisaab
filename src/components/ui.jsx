import { createContext, useCallback, useContext, useState } from 'react';
import { MEMBER_BY_ID } from '../lib/constants.js';

export function Card({ className = '', children }) {
  return <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100 ${className}`}>{children}</div>;
}

const VARIANTS = {
  primary: 'bg-orange-500 text-white active:bg-orange-600 disabled:bg-orange-200',
  green: 'bg-emerald-500 text-white active:bg-emerald-600 disabled:bg-emerald-200',
  soft: 'bg-orange-50 text-orange-700 active:bg-orange-100 disabled:opacity-50',
  ghost: 'bg-transparent text-stone-600 active:bg-stone-100 disabled:opacity-50',
  red: 'bg-rose-50 text-rose-700 active:bg-rose-100 disabled:opacity-50',
};

export function Button({ variant = 'primary', big, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-2xl font-extrabold transition ${big ? 'min-h-[60px] px-5 text-lg' : 'min-h-[44px] px-4 text-base'} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Avatar({ uid, size = 'md' }) {
  const m = MEMBER_BY_ID[uid];
  const s = size === 'sm' ? 'h-7 w-7 text-sm' : size === 'lg' ? 'h-14 w-14 text-2xl' : 'h-9 w-9 text-lg';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${s}`}
      style={{ background: `${m?.color}22`, boxShadow: `inset 0 0 0 2px ${m?.color}` }}
      aria-hidden="true"
    >
      {m?.emoji}
    </span>
  );
}

export function Name({ uid, me }) {
  const m = MEMBER_BY_ID[uid];
  return (
    <span className="font-extrabold text-stone-800">
      {m?.name}
      {uid === me ? ' (tum)' : ''}
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, max = 30, disabled, label }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="kam karo"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="h-12 w-12 rounded-2xl bg-orange-100 text-2xl font-black text-orange-700 active:bg-orange-200 disabled:opacity-40"
      >
        −
      </button>
      <span className="w-12 text-center text-3xl font-black tabular-nums text-stone-800">{value}</span>
      <button
        type="button"
        aria-label="badhao"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="h-12 w-12 rounded-2xl bg-orange-100 text-2xl font-black text-orange-700 active:bg-orange-200 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl px-4 text-left font-bold disabled:opacity-50 ${checked ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-700'}`}
    >
      <span>{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-rose-500' : 'bg-stone-300'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-stone-800">{title}</h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-stone-100 text-xl" aria-label="band karo">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-2 mt-1 flex items-center justify-between">
      <h3 className="text-sm font-black uppercase tracking-wide text-stone-500">{children}</h3>
      {right}
    </div>
  );
}

// ---- toast ----
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((text, kind = 'ok') => {
    setMsg({ text, kind, id: Math.random() });
    setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
          <div
            role="status"
            className={`rounded-2xl px-4 py-3 text-center font-bold shadow-lg ${msg.kind === 'err' ? 'bg-rose-600 text-white' : 'bg-stone-900 text-white'}`}
          >
            {msg.text}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
