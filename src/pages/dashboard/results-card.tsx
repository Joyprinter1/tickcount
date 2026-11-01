// @ts-nocheck — reads the signed-in Deriv account's own trade history
import React from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';

const PERIODS = [
    { id: 1, label: 'Today' },
    { id: 7, label: '7 days' },
    { id: 30, label: '30 days' },
];
const NAMES = {
    DIGITOVER: 'Digits Over', DIGITUNDER: 'Digits Under', DIGITEVEN: 'Digits Even', DIGITODD: 'Digits Odd',
    DIGITMATCH: 'Digits Matches', DIGITDIFF: 'Digits Differs', CALL: 'Rise', PUT: 'Fall', CALLE: 'Rise (equals)',
    PUTE: 'Fall (equals)', ONETOUCH: 'Touch', NOTOUCH: 'No Touch', EXPIRYRANGE: 'Ends Between', EXPIRYMISS: 'Ends Outside',
    RANGE: 'Stays Between', UPORDOWN: 'Goes Outside', ASIANU: 'Asian Up', ASIAND: 'Asian Down', RESETCALL: 'Reset Call',
    RESETPUT: 'Reset Put', TICKHIGH: 'High Tick', TICKLOW: 'Low Tick', RUNHIGH: 'Only Ups', RUNLOW: 'Only Downs',
    MULTUP: 'Multiplier Up', MULTDOWN: 'Multiplier Down',
};
let KES = 129;
try {
    const c = JSON.parse(localStorage.getItem('td.kes') || 'null');
    if (c?.r > 50 && c.r < 400) KES = c.r;
    if (!c || Date.now() - c.at > 432e5) {
        fetch('https://open.er-api.com/v6/latest/USD')
            .then(r => r.json())
            .then(j => {
                const r = j?.rates?.KES;
                if (r > 50 && r < 400) {
                    KES = r;
                    localStorage.setItem('td.kes', JSON.stringify({ r, at: Date.now() }));
                }
            })
            .catch(() => {});
    }
} catch (e) {}
const money = (n, cur) =>
    `${n > 0 ? '+' : ''}${(Math.round(n * 100) / 100).toFixed(2)} ${cur}${cur === 'USD' ? ` (≈ KSh ${Math.round(n * KES).toLocaleString('en-KE')})` : ''}`;

const ResultsCard = () => {
    const [days, setDays] = React.useState(7);
    const [state, setState] = React.useState({ loading: true });

    const load = React.useCallback(async () => {
        setState({ loading: true });
        try {
            if (!api_base?.api || !api_base.is_authorized) {
                setState({ error: 'Log in to Deriv to see your results.' });
                return;
            }
            const from = Math.floor(Date.now() / 1000) - days * 86400;
            const res = await api_base.api.send({
                profit_table: 1,
                description: 1,
                sort: 'DESC',
                limit: 500,
                date_from: String(from),
            });
            if (res?.error) throw new Error(res.error.message);
            const rows = res?.profit_table?.transactions ?? [];
            const cur = api_base.account_info?.currency || '';
            const by = {};
            let wins = 0, losses = 0, net = 0;
            rows.forEach(t => {
                const p = Number(t.sell_price) - Number(t.buy_price);
                if (!Number.isFinite(p)) return;
                const type = String(t.shortcode || '').split('_')[0] || 'OTHER';
                const o = (by[type] ??= { type, n: 0, w: 0, p: 0 });
                o.n += 1; o.p += p; net += p;
                if (p > 0) { o.w += 1; wins += 1; } else losses += 1;
            });
            const list = Object.values(by).filter(x => x.n >= 2).sort((a, b) => b.p - a.p);
            setState({ wins, losses, net, cur, list, total: rows.length, capped: rows.length >= 500 });
        } catch (e) {
            setState({ error: e?.message || 'Could not load your results.' });
        }
    }, [days]);

    React.useEffect(() => { load(); }, [load]);

    const s = state;
    const best = s.list?.[0];
    const worst = s.list && s.list.length > 1 ? s.list[s.list.length - 1] : null;
    const rate = s.total ? Math.round((s.wins / s.total) * 100) : 0;

    return (
        <section className='td-results'>
            <div className='td-results__head'>
                <span>MY RESULTS</span>
                <div className='td-results__tabs'>
                    {PERIODS.map(p => (
                        <button key={p.id} type='button' className={days === p.id ? 'on' : ''} onClick={() => setDays(p.id)}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>
            {s.loading && <p className='td-results__msg'>Loading…</p>}
            {s.error && <p className='td-results__msg'>{s.error}</p>}
            {!s.loading && !s.error && (
                s.total === 0 ? (
                    <p className='td-results__msg'>No trades in this period.</p>
                ) : (
                    <>
                        <div className='td-results__stats'>
                            <div><b className='win'>{s.wins}</b><span>Wins</span></div>
                            <div><b className='loss'>{s.losses}</b><span>Losses</span></div>
                            <div><b>{rate}%</b><span>Win rate</span></div>
                            <div><b className={s.net >= 0 ? 'win' : 'loss'}>{money(s.net, s.cur)}</b><span>Profit / loss</span></div>
                        </div>
                        {best && (
                            <p className='td-results__line'>
                                Best: <b>{NAMES[best.type] || best.type}</b> ({best.w}/{best.n} won, {money(best.p, s.cur)})
                                {worst && (<> &middot; Worst: <b>{NAMES[worst.type] || worst.type}</b> ({worst.w}/{worst.n} won, {money(worst.p, s.cur)})</>)}
                            </p>
                        )}
                        {s.list.length > 0 && (
                            <div className='td-results__list'>
                                {s.list.map(x => (
                                    <div key={x.type}>
                                        <span>{NAMES[x.type] || x.type}</span>
                                        <span>{x.w}/{x.n} won</span>
                                        <b className={x.p >= 0 ? 'win' : 'loss'}>{money(x.p, s.cur)}</b>
                                    </div>
                                ))}
                            </div>
                        )}
                        {s.capped && <p className='td-results__msg'>Showing your latest 500 trades.</p>}
                    </>
                )
            )}
        </section>
    );
};

export default ResultsCard;
