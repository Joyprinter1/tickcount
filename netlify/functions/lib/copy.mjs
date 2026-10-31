// Tickdesk copy trading: encrypted token vault, client records, and the fan-out of the owner's trades.
// Client tokens are encrypted at rest and are never returned by any endpoint.
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';

const API_BASE = 'https://api.derivws.com/trading/v1/options';
const MAX_CLIENTS = 300;
const PER_CLIENT_MS = 7000;
const LOG_MAX = 100;
const TRADES_MAX = 600;
const BATCH_MS = 20000;

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const sha = s => createHash('sha256').update(s).digest('hex');

// ---------- vault ----------
async function getSettings(store) {
    let s = await store.get('copy/settings', { type: 'json' });
    if (!s) {
        s = { enabled: false, markup: 0, key: randomBytes(32).toString('hex') };
        await store.setJSON('copy/settings', s);
    }
    return s;
}
const keyFor = (settings, env) => createHash('sha256').update(env.COPY_KEY || settings.key).digest();
const seal = (text, key) => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
};
const unseal = (box, key) => {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
    d.setAuthTag(Buffer.from(box.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
};

// ---------- Deriv ----------
export function makeDeriv({ fetchFn = fetch, WS = globalThis.WebSocket, appId }) {
    const headers = token => ({ Authorization: `Bearer ${token}`, 'Deriv-App-ID': appId, Accept: 'application/json' });
    const withTimeout = (p, ms, msg) =>
        Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

    async function accounts(token) {
        const r = await withTimeout(fetchFn(`${API_BASE}/accounts`, { headers: headers(token) }), 8000, 'Deriv did not answer in time.');
        if (r.status === 401 || r.status === 403) throw new Error('Deriv rejected this token. Check that it is correct and not expired.');
        if (!r.ok) throw new Error(`Deriv could not check this token (${r.status}).`);
        const j = await r.json();
        return (j?.data ?? []).map(a => ({
            id: String(a.account_id),
            type: a.account_type === 'demo' || /^VR/i.test(String(a.account_id)) ? 'demo' : 'real',
            currency: String(a.currency || 'USD'),
            balance: Number(a.balance) || 0,
        }));
    }

    async function otpUrl(token, accountId) {
        const r = await withTimeout(
            fetchFn(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/otp`, { method: 'POST', headers: headers(token) }),
            8000,
            'Deriv did not answer in time.'
        );
        if (!r.ok) throw new Error(`Deriv would not open a session (${r.status}).`);
        const j = await r.json();
        const url = j?.data?.url;
        if (!url) throw new Error('Deriv did not return a session address.');
        return url;
    }

    // Opens a one-off authenticated session, sends one request, returns the reply.
    async function send(token, accountId, request) {
        const url = await otpUrl(token, accountId);
        return withTimeout(
            new Promise((resolve, reject) => {
                let ws;
                try {
                    ws = new WS(url);
                } catch (e) {
                    reject(new Error('Could not open a Deriv session.'));
                    return;
                }
                const done = (fn, v) => {
                    try {
                        ws.close();
                    } catch {}
                    fn(v);
                };
                ws.addEventListener('open', () => ws.send(JSON.stringify({ ...request, req_id: 1 })));
                ws.addEventListener('message', ev => {
                    let m;
                    try {
                        m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
                    } catch {
                        return;
                    }
                    if (m.req_id !== 1) return;
                    if (m.error) done(reject, new Error(m.error.message || 'Deriv refused the request.'));
                    else done(resolve, m);
                });
                ws.addEventListener('error', () => done(reject, new Error('Connection to Deriv failed.')));
                ws.addEventListener('close', () => reject(new Error('Deriv closed the session.')));
            }),
            PER_CLIENT_MS,
            'Deriv took too long to answer.'
        );
    }

    // One session, several requests (used to check how copied trades finished).
    async function sendBatch(token, accountId, requests) {
        const url = await otpUrl(token, accountId);
        return withTimeout(
            new Promise((resolve, reject) => {
                let ws;
                try {
                    ws = new WS(url);
                } catch (e) {
                    reject(new Error('Could not open a Deriv session.'));
                    return;
                }
                const out = Array(requests.length).fill(null);
                let got = 0;
                const done = (fn, v) => {
                    try {
                        ws.close();
                    } catch {}
                    fn(v);
                };
                ws.addEventListener('open', () => requests.forEach((r, i) => ws.send(JSON.stringify({ ...r, req_id: i + 1 }))));
                ws.addEventListener('message', ev => {
                    let m;
                    try {
                        m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
                    } catch {
                        return;
                    }
                    if (!(m.req_id >= 1 && m.req_id <= requests.length) || out[m.req_id - 1]) return;
                    out[m.req_id - 1] = m.error ? { error: m.error.message || 'failed' } : m;
                    got += 1;
                    if (got >= requests.length) done(resolve, out);
                });
                ws.addEventListener('error', () => done(reject, new Error('Connection to Deriv failed.')));
                ws.addEventListener('close', () => reject(new Error('Deriv closed the session.')));
            }),
            BATCH_MS,
            'Deriv took too long to answer.'
        );
    }

    return { accounts, buy: (token, accountId, request) => send(token, accountId, request), batch: sendBatch };
}

// ---------- helpers ----------
const PARAM_KEYS = ['amount', 'basis', 'contract_type', 'currency', 'duration', 'duration_unit', 'multiplier', 'underlying_symbol', 'symbol', 'selected_tick', 'barrier', 'barrier2'];
export function sanitizeTrade(t) {
    const p = t?.parameters;
    if (!p || typeof p !== 'object') return null;
    const out = {};
    for (const k of PARAM_KEYS) {
        if (p[k] === undefined || p[k] === null || p[k] === '') continue;
        const v = p[k];
        if (typeof v === 'string') out[k] = v.slice(0, 40);
        else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    if (out.symbol && !out.underlying_symbol) out.underlying_symbol = out.symbol;
    delete out.symbol;
    if (!/^[A-Z0-9_]{2,40}$/i.test(String(out.contract_type ?? ''))) return null;
    if (!/^[A-Za-z0-9_]{2,30}$/.test(String(out.underlying_symbol ?? ''))) return null;
    if (!(Number(out.amount) > 0) || Number(out.amount) > 100000) return null;
    return {
        parameters: out,
        isVirtual: t.isVirtual === true,
        masterContractId: String(t.masterContractId ?? '').slice(0, 40),
    };
}

const publicClient = c => ({
    id: c.id,
    name: c.name,
    accountId: c.accountId,
    accountType: c.accountType,
    currency: c.currency,
    balance: c.balance,
    active: !!c.active,
    paused: !!c.paused,
    multiplier: c.multiplier,
    tokenOk: c.tokenOk !== false,
    copied: c.copied ?? 0,
    failed: c.failed ?? 0,
    lastAt: c.lastAt ?? null,
    lastResult: c.lastResult ?? null,
    createdAt: c.createdAt,
});
const mask = id => (id.length > 4 ? id.slice(0, 3) + '•••' + id.slice(-2) : id);

// ---------- routes ----------
// Returns a Response, or null if the route is not a copy route.
export async function handleCopy({ req, parts, method, store, env, body, isAdmin, deps = {} }) {
    const getClients = async () => (await store.get('copy/clients', { type: 'json' })) ?? [];
    const putClients = l => store.setJSON('copy/clients', l);
    const getTrades = async () => (await store.get('copy/trades', { type: 'json' })) ?? [];
    const round2 = x => Math.round(x * 100) / 100;
    const summarize = (trades, pick) => {
        const t = trades.filter(pick);
        const profit = {};
        t.forEach(x => {
            profit[x.currency] = round2((profit[x.currency] ?? 0) + (x.profit || 0));
        });
        return { wins: t.filter(x => x.status === 'won').length, losses: t.filter(x => x.status === 'lost').length, open: t.filter(x => x.status === 'open').length, profit };
    };
    const settings = await getSettings(store);
    const key = keyFor(settings, env);
    const appId = env.DERIV_APP_ID || '34Js8QGWunUAzd4jUbOTD';
    const deriv = deps.deriv ?? makeDeriv({ fetchFn: deps.fetch ?? fetch, WS: deps.WebSocket ?? globalThis.WebSocket, appId });

    const clientFromKey = async () => {
        const k = req.headers.get('x-client-key') || '';
        if (k.length < 20) return [null, null];
        const h = sha(k);
        const list = await getClients();
        const i = list.findIndex(c => c.keyHash && c.keyHash.length === h.length && timingSafeEqual(Buffer.from(c.keyHash), Buffer.from(h)));
        return [list, i];
    };

    // ----- client side -----
    if (parts[0] === 'copy') {
        const sub = parts[1];

        if (method === 'GET' && sub === 'info') {
            return json({ open: true });
        }

        if (method === 'POST' && sub === 'connect') {
            const b = (await body()) ?? {};
            const token = typeof b.token === 'string' ? b.token.trim() : '';
            if (token.length < 8 || token.length > 200 || /\s/.test(token)) return json({ error: 'Paste your Deriv API token (no spaces).' }, 400);
            let accts;
            try {
                accts = await deriv.accounts(token);
            } catch (e) {
                return json({ error: e.message }, 400);
            }
            if (!accts.length) return json({ error: 'No Deriv accounts were found for this token.' }, 400);
            let acct = accts.find(a => a.id === b.accountId);
            if (!acct) {
                if (accts.length > 1) {
                    return json({ choose: accts.map(a => ({ id: a.id, type: a.type, currency: a.currency, balance: a.balance })) });
                }
                acct = accts[0];
            }
            const list = await getClients();
            if (list.length >= MAX_CLIENTS && !list.some(c => c.accountId === acct.id)) return json({ error: 'Copy trading is full right now.' }, 409);
            const clientKey = randomBytes(24).toString('base64url');
            const rec = {
                id: randomBytes(6).toString('hex'),
                name: clean(b.name, 40) || 'Client',
                accountId: acct.id,
                accountType: acct.type,
                currency: acct.currency,
                balance: acct.balance,
                tokenBox: seal(token, key),
                keyHash: sha(clientKey),
                active: false, // the owner switches new clients on
                paused: false,
                multiplier: 1,
                tokenOk: true,
                copied: 0,
                failed: 0,
                createdAt: Date.now(),
            };
            const i = list.findIndex(c => c.accountId === acct.id);
            if (i >= 0) {
                // same Deriv account connecting again: replace the token, keep the owner's on/off decision
                rec.active = list[i].active;
                rec.id = list[i].id;
                rec.copied = list[i].copied ?? 0;
                rec.failed = list[i].failed ?? 0;
                list[i] = rec;
            } else list.push(rec);
            await putClients(list);
            return json({ clientKey, client: { ...publicClient(rec), accountId: mask(rec.accountId) } }, 201);
        }

        if (sub === 'me') {
            const [list, i] = await clientFromKey();
            if (i === null || i < 0) return json({ error: 'Not connected.' }, 401);
            const c = list[i];
            if (method === 'GET') return json({ client: { ...publicClient(c), accountId: mask(c.accountId) } });
            if (method === 'DELETE') {
                list.splice(i, 1);
                await putClients(list);
                return json({ ok: true });
            }
            if (method === 'POST') {
                const b = (await body()) ?? {};
                if (typeof b.paused === 'boolean') c.paused = b.paused;
                if ([0.5, 1, 2, 3].includes(Number(b.multiplier))) c.multiplier = Number(b.multiplier);
                await putClients(list);
                return json({ client: { ...publicClient(c), accountId: mask(c.accountId) } });
            }
        }

        // owner's browser reports a trade it just placed
        if (method === 'POST' && sub === 'signal') {
            if (!(await isAdmin())) return json({ error: 'Not allowed.' }, 401);
            if (!settings.enabled) return json({ ok: true, skipped: 'Live copying is switched off.' });
            const t = sanitizeTrade(await body());
            if (!t) return json({ error: 'Invalid trade.' }, 400);
            if (t.masterContractId) {
                const seen = (await store.get('copy/seen', { type: 'json' })) ?? [];
                if (seen.includes(t.masterContractId)) return json({ ok: true, skipped: 'Already copied.' });
                seen.push(t.masterContractId);
                await store.setJSON('copy/seen', seen.slice(-200));
            }
            const list = await getClients();
            const targets = list.filter(
                c => c.active && !c.paused && c.tokenOk !== false && (c.accountType === 'demo') === t.isVirtual
            );
            const results = await Promise.allSettled(
                targets.map(async c => {
                    const token = unseal(c.tokenBox, key);
                    const params = { ...t.parameters, currency: c.currency };
                    params.amount = Math.round(Number(params.amount) * c.multiplier * 100) / 100;
                    if (!(params.amount > 0)) throw new Error('Stake too small.');
                    if (settings.markup > 0) params.app_markup_percentage = settings.markup;
                    const m = await deriv.buy(token, c.accountId, { buy: '1', price: params.amount, parameters: params });
                    return { id: m?.buy?.contract_id ?? null, stake: params.amount };
                })
            );
            const now = Date.now();
            let ok = 0;
            const newTrades = [];
            const fresh = await getClients();
            results.forEach((r, n) => {
                const c = fresh.find(x => x.id === targets[n].id);
                if (!c) return;
                c.lastAt = now;
                if (r.status === 'fulfilled') {
                    ok += 1;
                    if (r.value?.id) {
                        newTrades.push({
                            cid: String(r.value.id),
                            clientId: c.id,
                            name: c.name,
                            currency: c.currency,
                            at: now,
                            symbol: t.parameters.underlying_symbol,
                            type: t.parameters.contract_type,
                            stake: r.value.stake,
                            markup: settings.markup > 0 ? settings.markup : 0,
                            status: 'open',
                            profit: 0,
                        });
                    }
                    c.copied = (c.copied ?? 0) + 1;
                    c.lastResult = 'copied';
                } else {
                    c.failed = (c.failed ?? 0) + 1;
                    c.lastResult = clean(r.reason?.message, 120) || 'failed';
                    if (/token|reject|unauthor|expired|invalid/i.test(c.lastResult)) c.tokenOk = false;
                }
            });
            await putClients(fresh);
            if (newTrades.length) await store.setJSON('copy/trades', [...newTrades, ...(await getTrades())].slice(0, TRADES_MAX));
            const log = (await store.get('copy/log', { type: 'json' })) ?? [];
            log.unshift({
                at: now,
                trade: `${t.parameters.contract_type} ${t.parameters.underlying_symbol} $${t.parameters.amount}`,
                tried: targets.length,
                ok,
                failed: targets.length - ok,
            });
            await store.setJSON('copy/log', log.slice(0, LOG_MAX));
            return json({ ok: true, tried: targets.length, copied: ok });
        }
        return json({ error: 'Not found.' }, 404);
    }

    // ----- admin side (caller already verified isAdmin) -----
    if (parts[0] === 'admin' && parts[1] === 'copy') {
        const sub = parts[2];
        if (method === 'GET' && !sub) {
            const list = await getClients();
            const log = (await store.get('copy/log', { type: 'json' })) ?? [];
            const trades = await getTrades();
            return json({
                settings: { enabled: !!settings.enabled, markup: settings.markup ?? 0 },
                counts: {
                    total: list.length,
                    active: list.filter(c => c.active && !c.paused && c.tokenOk !== false).length,
                    pending: list.filter(c => !c.active).length,
                },
                clients: list
                    .map(c => ({ ...publicClient(c), accountId: c.accountId, results: summarize(trades, x => x.clientId === c.id) }))
                    .sort((a, b) => b.createdAt - a.createdAt),
                totals: summarize(trades, () => true),
                earn: trades
                    .filter(x => x.at > Date.now() - 32 * 86400000)
                    .map(x => ({ at: x.at, stake: x.stake, markup: x.markup || 0, profit: x.profit || 0, status: x.status, currency: x.currency })),
                trades: trades.slice(0, 40).map(x => ({ at: x.at, name: x.name, symbol: x.symbol, type: x.type, stake: x.stake, status: x.status, profit: x.profit, currency: x.currency })),
                log: log.slice(0, 20),
            });
        }
        if (method === 'POST' && sub === 'settings') {
            const b = (await body()) ?? {};
            if (typeof b.enabled === 'boolean') settings.enabled = b.enabled;
            if (b.markup !== undefined) {
                const m = Number(b.markup);
                if (!(m >= 0 && m <= 3)) return json({ error: 'Markup must be between 0 and 3.' }, 400);
                settings.markup = Math.round(m * 100) / 100;
            }
            await store.setJSON('copy/settings', settings);
            return json({ settings: { enabled: !!settings.enabled, markup: settings.markup } });
        }
        if (method === 'POST' && sub === 'results') {
            const trades = await getTrades();
            const clients = await getClients();
            const open = trades.filter(t => t.status === 'open').slice(0, 200);
            const by = {};
            open.forEach(t => (by[t.clientId] ??= []).push(t));
            let updated = 0;
            await Promise.allSettled(
                Object.entries(by).map(async ([clientId, list]) => {
                    const c = clients.find(x => x.id === clientId);
                    if (!c) {
                        list.forEach(t => (t.status = 'removed'));
                        updated += list.length;
                        return;
                    }
                    const out = await deriv.batch(
                        unseal(c.tokenBox, key),
                        c.accountId,
                        list.map(t => ({ proposal_open_contract: 1, contract_id: Number(t.cid) }))
                    );
                    out.forEach((m, i) => {
                        const k = m?.proposal_open_contract;
                        if (!k || !k.is_sold) return;
                        const profit = round2(Number(k.profit));
                        if (!Number.isFinite(profit)) return;
                        list[i].profit = profit;
                        list[i].status = profit > 0 ? 'won' : 'lost';
                        updated += 1;
                    });
                })
            );
            if (updated) await store.setJSON('copy/trades', trades);
            return json({ ok: true, updated, stillOpen: trades.filter(t => t.status === 'open').length });
        }
        if (method === 'POST' && sub === 'check') {
            const list = await getClients();
            await Promise.allSettled(
                list.map(async c => {
                    try {
                        const a = (await deriv.accounts(unseal(c.tokenBox, key))).find(x => x.id === c.accountId);
                        if (!a) throw new Error('Account not found for this token.');
                        c.balance = a.balance;
                        c.currency = a.currency;
                        c.tokenOk = true;
                    } catch (e) {
                        c.tokenOk = false;
                        c.lastResult = clean(e.message, 120);
                    }
                })
            );
            await putClients(list);
            return json({ ok: true });
        }
        if (sub === 'clients' && parts[3]) {
            const list = await getClients();
            const i = list.findIndex(c => c.id === parts[3]);
            if (i < 0) return json({ error: 'Client not found.' }, 404);
            if (method === 'DELETE') {
                list.splice(i, 1);
                await putClients(list);
                return json({ ok: true });
            }
            if (method === 'PATCH') {
                const b = (await body()) ?? {};
                if (typeof b.active === 'boolean') list[i].active = b.active;
                await putClients(list);
                return json({ client: publicClient(list[i]) });
            }
        }
        return json({ error: 'Not found.' }, 404);
    }
    return null;
}
