import { useEffect, useState } from 'react';

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
