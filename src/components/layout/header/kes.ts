import { useEffect, useState, useSyncExternalStore } from 'react';

let rate = 129;
let loaded = false;
const load = () => {
    if (loaded) return;
    loaded = true;
    try {
        const c = JSON.parse(localStorage.getItem('td.kes') || 'null');
        if (c?.r > 50 && c.r < 400) rate = c.r;
        if (c && Date.now() - c.at < 432e5) return;
    } catch (e) {}
    fetch('https://open.er-api.com/v6/latest/USD')
        .then(r => r.json())
        .then(j => {
            const r = j?.rates?.KES;
            if (r > 50 && r < 400) {
                rate = r;
                try {
                    localStorage.setItem('td.kes', JSON.stringify({ r, at: Date.now() }));
                } catch (e) {}
            }
        })
        .catch(() => {});
};

/** Approximate Kenyan shilling value for a USD balance (display only). */
export const useKes = () => {
    const [, tick] = useState(0);
    useEffect(() => {
        load();
        const t = setTimeout(() => tick(n => n + 1), 1500);
        return () => clearTimeout(t);
    }, []);
    return (balance: unknown, currency?: string) => {
        if (currency !== 'USD') return '';
        const n = Number(String(balance ?? '').replace(/,/g, ''));
        if (!Number.isFinite(n)) return '';
        return `≈ KSh ${Math.round(n * rate).toLocaleString('en-KE')}`;
    };
};

// Header currency switch: show the balance in USD or in Kenyan shillings (display only).
type TMode = 'USD' | 'KES';
let mode: TMode = 'USD';
try {
    if (localStorage.getItem('td.curmode') === 'KES') mode = 'KES';
} catch (e) {}
const subs = new Set<() => void>();
export const setKesMode = (m: TMode) => {
    mode = m;
    try {
        localStorage.setItem('td.curmode', m);
    } catch (e) {}
    subs.forEach(f => f());
};
export const useKesMode = (): TMode =>
    useSyncExternalStore(
        cb => {
            subs.add(cb);
            return () => {
                subs.delete(cb);
            };
        },
        () => mode
    );
