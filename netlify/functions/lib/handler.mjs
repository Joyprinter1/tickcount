// Tickdesk bot library API. Pure logic: the storage object is passed in, so it can be tested without Netlify.
import { handleCopy } from './copy.mjs';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

export const CATEGORIES = ['Over / Under', 'Even / Odd', 'Rise / Fall', 'Matches / Differs', 'Only Ups / Downs', 'Other'];
const MAX_XML = 1_500_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;


// ---------- site settings (social links) ----------
const SOCIALS = {
    whatsapp: { label: 'WhatsApp', hosts: ['wa.me', 'whatsapp.com', 'chat.whatsapp.com', 'api.whatsapp.com'] },
    telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me', 'telegram.org'] },
    youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
    tiktok: { label: 'TikTok', hosts: ['tiktok.com'] },
};
// Accepts a full https link, an @handle, or (WhatsApp) a phone number. Returns '' for empty, null for invalid.
export function normalizeSocial(kind, raw) {
    const v = String(raw ?? '').trim();
    if (!v) return '';
    const spec = SOCIALS[kind];
    if (!spec || v.length > 200) return null;
    let url = v;
    if (kind === 'whatsapp' && /^0[0-9\s-]{6,16}$/.test(v)) return null; // needs a country code
    if (kind === 'whatsapp' && /^\+?[0-9][0-9\s-]{6,16}$/.test(v)) url = `https://wa.me/${v.replace(/\D/g, '')}`;
    else if (kind === 'telegram' && /^@?[A-Za-z0-9_]{4,32}$/.test(v)) url = `https://t.me/${v.replace(/^@/, '')}`;
    else if (kind === 'youtube' && /^@[A-Za-z0-9_.-]{2,40}$/.test(v)) url = `https://www.youtube.com/${v}`;
    else if (kind === 'tiktok' && /^@[A-Za-z0-9_.]{2,40}$/.test(v)) url = `https://www.tiktok.com/${v}`;
    else if (!/^https?:\/\//i.test(v)) url = `https://${v}`;
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
        if (!spec.hosts.some(h => host === h || host.endsWith('.' + h))) return null;
        u.protocol = 'https:';
        return u.toString();
    } catch {
        return null;
    }
}
export const THEME_SURFACES = ['slate', 'navy', 'charcoal', 'forest', 'plum', 'black'];
// Returns a clean { accent, accent2, surface } or null when the input is not a valid theme.
export function normalizeTheme(t) {
    if (!t || typeof t !== 'object') return null;
    const hex = v => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toUpperCase() : null);
    const accent = hex(t.accent);
    const accent2 = hex(t.accent2);
    if (!accent || !accent2 || !THEME_SURFACES.includes(t.surface)) return null;
    const out = { accent, accent2, surface: t.surface };
    if (typeof t.preset === 'string' && /^[a-z0-9-]{1,24}$/.test(t.preset)) out.preset = t.preset;
    return out;
}
const DEFAULT_SITE = { socials: { whatsapp: '', telegram: '', youtube: '', tiktok: '' } };

const json = (data, status = 200, extra = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
    });

const b64 = s => Buffer.from(s).toString('base64url');
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const publicBot = b => ({
    id: b.id,
    name: b.name,
    category: b.category,
    description: b.description,
    accent: b.accent,
    downloadable: !!b.downloadable,
    published: b.published !== false,
    createdAt: b.createdAt,
});

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => ({
    salt,
    hash: scryptSync(password, salt, 64).toString('hex'),
});
const checkPassword = (password, rec) => {
    const a = Buffer.from(scryptSync(password, rec.salt, 64).toString('hex'));
    const b = Buffer.from(rec.hash);
    return a.length === b.length && timingSafeEqual(a, b);
};

const failures = new Map(); // per-instance brake on password guessing
const tooMany = ip => (failures.get(ip) ?? { n: 0, until: 0 }).until > Date.now();
const noteFail = ip => {
    const f = failures.get(ip) ?? { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= 5) {
        f.until = Date.now() + 60_000 * Math.min(f.n - 4, 15);
    }
    failures.set(ip, f);
};

export async function handle(req, store, env = {}, deps = {}) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)\/?/, '').replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    const method = req.method.toUpperCase();
    const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'local';

    const getIndex = async () => (await store.get('index', { type: 'json' })) ?? [];
    const putIndex = list => store.setJSON('index', list);
    const getConfig = async () => (await store.get('config', { type: 'json' })) ?? null;
    const body = async () => {
        try {
            return await req.json();
        } catch {
            return null;
        }
    };

    const makeToken = secret => {
        const payload = b64(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
        return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    };
    const isAdmin = async () => {
        const auth = req.headers.get('authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const [payload, sig] = token.split('.');
        if (!payload || !sig) return false;
        const cfg = await getConfig();
        if (!cfg) return false;
        const want = createHmac('sha256', cfg.secret).update(payload).digest('base64url');
        if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return false;
        try {
            return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
        } catch {
            return false;
        }
    };

    // ---------- public ----------
    if (method === 'GET' && parts[0] === 'bots' && parts.length === 1) {
        const list = await getIndex();
        return json({ bots: list.filter(b => b.published !== false).map(publicBot), categories: CATEGORIES });
    }
    if (method === 'GET' && parts[0] === 'bots' && parts[2] === 'xml') {
        const bot = (await getIndex()).find(b => b.id === parts[1] && b.published !== false);
        if (!bot) return json({ error: 'Bot not found.' }, 404);
        if (!bot.downloadable) return json({ error: 'This premium bot is locked right now.' }, 403);
        const xml = await store.get(`xml/${bot.id}`, { type: 'text' });
        if (!xml) return json({ error: 'Bot file is missing.' }, 404);
        return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' } });
    }

    if (method === 'GET' && parts[0] === 'settings' && parts.length === 1) {
        const site = (await store.get('site', { type: 'json' })) ?? DEFAULT_SITE;
        return json({ socials: { ...DEFAULT_SITE.socials, ...(site.socials ?? {}) }, theme: normalizeTheme(site.theme) }, 200, { 'cache-control': 'public, max-age=60' });
    }

    // ---------- copy trading: client side + owner's trade signal ----------
    if (parts[0] === 'copy') {
        const res = await handleCopy({ req, parts, method, store, env, body, isAdmin, deps });
        if (res) return res;
    }

    // ---------- admin ----------
    if (parts[0] !== 'admin') return json({ error: 'Not found.' }, 404);
    const sub = parts[1];

    if (method === 'GET' && sub === 'status') {
        const cfg = await getConfig();
        return json({ setup: !!cfg, envPassword: !!env.ADMIN_PASSWORD });
    }

    if (method === 'POST' && (sub === 'setup' || sub === 'login')) {
        if (tooMany(ip)) return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);
        const b = await body();
        const password = typeof b?.password === 'string' ? b.password : '';
        let cfg = await getConfig();
        if (sub === 'setup') {
            if (cfg) return json({ error: 'The admin password is already set. Log in instead.' }, 409);
            if (password.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
            cfg = { ...hashPassword(password), secret: randomBytes(32).toString('hex'), createdAt: Date.now() };
            await store.setJSON('config', cfg);
            return json({ token: makeToken(cfg.secret) });
        }
        if (!cfg) return json({ error: 'No admin password yet. Create one first.' }, 409);
        const ok = checkPassword(password, cfg) || (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD);
        if (!ok) {
            noteFail(ip);
            return json({ error: 'Wrong password.' }, 401);
        }
        failures.delete(ip);
        return json({ token: makeToken(cfg.secret) });
    }

    if (!(await isAdmin())) return json({ error: 'Please log in.' }, 401);

    if (sub === 'settings') {
        const site = (await store.get('site', { type: 'json' })) ?? DEFAULT_SITE;
        if (method === 'GET') return json({ socials: { ...DEFAULT_SITE.socials, ...(site.socials ?? {}) }, theme: normalizeTheme(site.theme) });
        if (method === 'POST') {
            const b = (await body()) ?? {};
            const next = { ...DEFAULT_SITE.socials, ...(site.socials ?? {}) };
            for (const k of Object.keys(SOCIALS)) {
                if (b.socials && k in b.socials) {
                    const n = normalizeSocial(k, b.socials[k]);
                    if (n === null) return json({ error: `That ${SOCIALS[k].label} link does not look right.` }, 400);
                    next[k] = n;
                }
            }
            let theme = normalizeTheme(site.theme);
            if ('theme' in b) {
                if (b.theme === null) theme = null;
                else {
                    theme = normalizeTheme(b.theme);
                    if (!theme) return json({ error: 'That colour theme is not valid. Use hex colours like #F2B544.' }, 400);
                }
            }
            await store.setJSON('site', { ...site, socials: next, theme });
            return json({ socials: next, theme });
        }
    }

    if (sub === 'copy') {
        const res = await handleCopy({ req, parts, method, store, env, body, isAdmin, deps });
        if (res) return res;
    }

    if (method === 'GET' && sub === 'bots') {
        return json({ bots: (await getIndex()).map(b => ({ ...publicBot(b), size: b.size ?? 0 })), categories: CATEGORIES });
    }

    if (method === 'POST' && sub === 'bots' && parts.length === 2) {
        const b = await body();
        if (!b) return json({ error: 'Invalid request.' }, 400);
        const xml = typeof b.xml === 'string' ? b.xml.trim() : '';
        if (!xml || xml.length > MAX_XML) return json({ error: 'Choose a bot XML file under 1.5 MB.' }, 400);
        if (!/^(<\?xml[^>]*\?>\s*)?<xml[\s>]/i.test(xml) || !/<\/xml>\s*$/i.test(xml)) {
            return json({ error: 'That file does not look like a Deriv bot (.xml).' }, 400);
        }
        const name = clean(b.name, 60);
        if (!name) return json({ error: 'Give the bot a name.' }, 400);
        const bot = {
            id: randomBytes(6).toString('hex'),
            name,
            category: CATEGORIES.includes(b.category) ? b.category : 'Other',
            description: clean(b.description, 160),
            accent: /^#[0-9a-fA-F]{6}$/.test(b.accent || '') ? b.accent : '#F2B544',
            downloadable: b.downloadable === true,
            published: b.published !== false,
            createdAt: Date.now(),
            size: xml.length,
        };
        await store.set(`xml/${bot.id}`, xml);
        const list = await getIndex();
        list.unshift(bot);
        await putIndex(list);
        return json({ bot: publicBot(bot) }, 201);
    }

    if (method === 'POST' && sub === 'downloads') {
        const b = await body();
        const on = b?.downloadable === true;
        const list = await getIndex();
        list.forEach(x => (x.downloadable = on));
        await putIndex(list);
        return json({ ok: true, downloadable: on });
    }

    if (method === 'POST' && sub === 'password') {
        const b = await body();
        const cfg = await getConfig();
        if (!cfg || !checkPassword(String(b?.current ?? ''), cfg)) return json({ error: 'Current password is wrong.' }, 401);
        const next = String(b?.next ?? '');
        if (next.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
        await store.setJSON('config', { ...cfg, ...hashPassword(next), secret: randomBytes(32).toString('hex') });
        return json({ ok: true });
    }

    if (sub === 'bots' && parts.length === 3) {
        const id = parts[2];
        const list = await getIndex();
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return json({ error: 'Bot not found.' }, 404);
        if (method === 'DELETE') {
            list.splice(i, 1);
            await putIndex(list);
            await store.delete(`xml/${id}`);
            return json({ ok: true });
        }
        if (method === 'PATCH') {
            const b = (await body()) ?? {};
            const bot = list[i];
            if (b.name !== undefined) bot.name = clean(b.name, 60) || bot.name;
            if (b.description !== undefined) bot.description = clean(b.description, 160);
            if (b.category !== undefined && CATEGORIES.includes(b.category)) bot.category = b.category;
            if (/^#[0-9a-fA-F]{6}$/.test(b.accent || '')) bot.accent = b.accent;
            if (typeof b.downloadable === 'boolean') bot.downloadable = b.downloadable;
            if (typeof b.published === 'boolean') bot.published = b.published;
            await putIndex(list);
            return json({ bot: publicBot(bot) });
        }
    }

    return json({ error: 'Not found.' }, 404);
}
