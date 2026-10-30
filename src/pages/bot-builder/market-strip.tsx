// @ts-nocheck — reads the vendored Blockly workspace
import React from 'react';
import { getSymbolDisplayNameSync } from '@/utils/symbol-display-name';

/**
 * Small card on the Bot Builder: follows the market chosen in the loaded bot.
 * Shows the last-digit spread of the last 1000 ticks and, for Up/Down trade types,
 * the direction of the last 10 one-minute candles. Read-only; it never touches the bot.
 */
const EPS = ['wss://ws.derivws.com/websockets/v3?app_id=1089', 'wss://api.derivws.com/trading/v1/options/ws/public'];
const UPDOWN = ['callput', 'callputequal', 'higherlower'];

type TCandle = { o: number; h: number; l: number; c: number; t: number };

const digitOf = (q: number, pip: number) => {
    const s = Number(q).toFixed(pip);
    return Number(s[s.length - 1]);
};

const readBot = () => {
    try {
        const ws = window.Blockly?.derivWorkspace;
        const blocks = ws?.getAllBlocks?.(false) ?? [];
        const m = blocks.find(b => b.type === 'trade_definition_market');
        const t = blocks.find(b => b.type === 'trade_definition_tradetype');
        return {
            symbol: (m?.getFieldValue('SYMBOL_LIST') as string) || '',
            category: (t?.getFieldValue('TRADETYPECAT_LIST') as string) || '',
        };
    } catch (e) {
        return { symbol: '', category: '' };
    }
};

const MarketStrip = ({ visible }: { visible: boolean }) => {
    const [bot, setBot] = React.useState({ symbol: '', category: '' });
    const [digits, setDigits] = React.useState<number[]>([]);
    const [candles, setCandles] = React.useState<TCandle[]>([]);
    const [open, setOpen] = React.useState(() => {
        try {
            return localStorage.getItem('td.strip') !== '0';
        } catch (e) {
            return true;
        }
    });
    const pip = React.useRef(2);

    React.useEffect(() => {
        if (!visible) return;
        const read = () => {
            const next = readBot();
            setBot(prev => (prev.symbol === next.symbol && prev.category === next.category ? prev : next));
        };
        read();
        const id = window.setInterval(read, 1000);
        return () => window.clearInterval(id);
    }, [visible]);

    const wants_candles = UPDOWN.includes(bot.category);

    React.useEffect(() => {
        setDigits([]);
        setCandles([]);
        if (!visible || !open || !bot.symbol) return;
        let ws: WebSocket | null = null;
        let stopped = false;
        let ep = 0;
        let retry: number | undefined;
        const connect = () => {
            if (stopped) return;
            let opened = false;
            try {
                ws = new WebSocket(EPS[ep % EPS.length]);
            } catch (e) {
                ep++;
                retry = window.setTimeout(connect, 3000);
                return;
            }
            const sock = ws;
            sock.addEventListener('open', () => {
                opened = true;
                sock.send(
                    JSON.stringify({
                        ticks_history: bot.symbol,
                        count: 1000,
                        end: 'latest',
                        style: 'ticks',
                        subscribe: 1,
                        req_id: 1,
                    })
                );
                if (wants_candles) {
                    sock.send(
                        JSON.stringify({
                            ticks_history: bot.symbol,
                            count: 10,
                            end: 'latest',
                            style: 'candles',
                            granularity: 60,
                            subscribe: 1,
                            req_id: 2,
                        })
                    );
                }
            });
            sock.addEventListener('message', ev => {
                let m;
                try {
                    m = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }
                if (m.msg_type === 'history' && m.history) {
                    pip.current = m.pip_size || 2;
                    setDigits(m.history.prices.map(p => digitOf(p, pip.current)));
                } else if (m.msg_type === 'tick' && m.tick) {
                    pip.current = m.tick.pip_size || pip.current;
                    const d = digitOf(m.tick.quote, pip.current);
                    setDigits(prev => (prev.length ? [...prev.slice(-999), d] : prev));
                } else if (m.msg_type === 'candles' && m.candles) {
                    setCandles(
                        m.candles.map(c => ({ o: +c.open, h: +c.high, l: +c.low, c: +c.close, t: +c.epoch }))
                    );
                } else if (m.msg_type === 'ohlc' && m.ohlc) {
                    const c = { o: +m.ohlc.open, h: +m.ohlc.high, l: +m.ohlc.low, c: +m.ohlc.close, t: +m.ohlc.open_time };
                    setCandles(prev => {
                        if (!prev.length) return prev;
                        const last = prev[prev.length - 1];
                        if (last.t === c.t) return [...prev.slice(0, -1), c];
                        return [...prev.slice(-9), c];
                    });
                }
            });
            sock.addEventListener('close', () => {
                if (stopped || ws !== sock) return;
                if (!opened) ep++;
                retry = window.setTimeout(connect, 3000);
            });
        };
        connect();
        return () => {
            stopped = true;
            window.clearTimeout(retry);
            try {
                ws?.close();
            } catch (e) {
                // ignore
            }
        };
    }, [bot.symbol, wants_candles, visible, open]);

    if (!visible || !bot.symbol) return null;

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            localStorage.setItem('td.strip', next ? '1' : '0');
        } catch (e) {
            // ignore
        }
    };

    const name = getSymbolDisplayNameSync(bot.symbol) || bot.symbol;
    const counts = Array(10).fill(0);
    digits.forEach(d => {
        counts[d]++;
    });
    const total = digits.length || 1;
    const order = [...counts.keys()].sort((a, b) => counts[b] - counts[a] || a - b);
    const role: Record<number, string> = {};
    if (digits.length >= 50) {
        role[order[0]] = '#1E9E4A';
        role[order[1]] = '#2F4BE0';
        role[order[9]] = '#E02F2F';
        role[order[8]] = '#F2E01A';
    }
    const last = digits.length ? digits[digits.length - 1] : null;

    const up = candles.filter(c => c.c > c.o).length;
    const down = candles.filter(c => c.c < c.o).length;
    const trend = !candles.length ? '' : up - down >= 2 ? 'UP' : down - up >= 2 ? 'DOWN' : 'SIDEWAYS';
    const hi = Math.max(...candles.map(c => c.h), 0);
    const lo = Math.min(...candles.map(c => c.l), Infinity);
    const H = 34;
    const y = (v: number) => (hi === lo ? H / 2 : ((hi - v) / (hi - lo)) * (H - 4) + 2);

    const box: React.CSSProperties = {
        position: 'absolute',
        top: 8,
        insetInlineEnd: 12,
        insetInlineStart: 'auto',
        zIndex: 20,
        maxWidth: 'calc(100vw - 80px)',
        background: 'var(--general-main-1, #fff)',
        color: 'var(--text-general, #0e0e0e)',
        border: '1px solid var(--border-normal, #d6dadb)',
        borderRadius: 12,
        padding: open ? '6px 8px 8px' : '4px 10px',
        boxShadow: '0 2px 8px rgba(0,0,0,.18)',
        font: '600 12px/1.2 system-ui, sans-serif',
    };

    return (
        <div style={box} data-testid='market-strip'>
            <button
                type='button'
                onClick={toggle}
                aria-expanded={open}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}
            >
                <span style={{ fontWeight: 800, fontSize: 13 }}>{name}</span>
                <span aria-hidden='true'>{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, padding: 3, overflowX: 'auto' }}>
                        {counts.map((n, d) => (
                            <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: '50%',
                                        background: role[d] || '#BFC3C7',
                                        color: role[d] && role[d] !== '#F2E01A' ? '#fff' : '#111',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        lineHeight: 1,
                                        outline: last === d ? '3px solid #E02F2F' : 'none',
                                        outlineOffset: 1,
                                    }}
                                >
                                    <b>{d}</b>
                                    <span style={{ fontSize: 8 }}>{digits.length ? ((n / total) * 100).toFixed(1) : '–'}%</span>
                                </div>
                                <span style={{ color: '#E02F2F', fontSize: 9, height: 9 }}>{last === d ? '▲' : ''}</span>
                            </div>
                        ))}
                    </div>
                    {wants_candles && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <svg width={candles.length * 12 + 4} height={H} aria-label='Last 10 one-minute candles'>
                                {candles.map((c, i) => {
                                    const x = i * 12 + 8;
                                    const col = c.c >= c.o ? '#1E9E4A' : '#E02F2F';
                                    const top = y(Math.max(c.o, c.c));
                                    const bottom = y(Math.min(c.o, c.c));
                                    return (
                                        <g key={c.t}>
                                            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
                                            <rect x={x - 3} y={top} width={6} height={Math.max(2, bottom - top)} fill={col} />
                                        </g>
                                    );
                                })}
                            </svg>
                            <div>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        color: trend === 'UP' ? '#1E9E4A' : trend === 'DOWN' ? '#E02F2F' : 'inherit',
                                    }}
                                >
                                    {trend === 'UP' ? '↑ Trend up' : trend === 'DOWN' ? '↓ Trend down' : trend ? '↔ Sideways' : '…'}
                                </div>
                                <div style={{ fontWeight: 500, opacity: 0.8 }}>
                                    {candles.length ? `${up} up · ${down} down (1 min)` : 'Loading candles'}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MarketStrip;
