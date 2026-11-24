import { useEffect } from 'react';
import { clearAuthInfo, storeAuthInfo } from '@/external/deriv-core';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/**
 * Owner's personal token (set up in Admin → Token API, in this browser only).
 * The admin page saves the token and leaves a one-time command ("on" / "off"); this picks it up:
 *  on  -> sign this browser in with the saved token (same sign-in the Token login button does)
 *  off -> sign out, but only if it was this token that signed in.
 * The token never leaves the browser except to Deriv itself.
 */
const TOKEN = 'tickdesk.mytoken';
const CMD = 'tickdesk.mytoken.cmd';
const ACTIVE = 'tickdesk.mytoken.active';
const STATUS = 'tickdesk.mytoken.status';

const get = (k: string) => {
    try {
        return localStorage.getItem(k);
    } catch {
        return null;
    }
};
const set = (k: string, v: string | null) => {
    try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
    } catch {
        // ignore
    }
};

let busy = false;

const run = async () => {
    const cmd = get(CMD);
    if (!cmd || busy) return;
    busy = true;
    set(CMD, null);
    try {
        if (cmd === 'off') {
            if (get(ACTIVE) === '1') {
                clearAuthInfo();
                DerivWSAccountsService.clearStoredAccounts();
                DerivWSAccountsService.clearCache();
                ['active_loginid', 'account_type', 'accountsList', 'authToken', 'clientAccounts'].forEach(k =>
                    set(k, null)
                );
                set(ACTIVE, null);
                set(STATUS, 'off');
                window.location.replace(window.location.origin + window.location.pathname);
            } else {
                set(STATUS, 'off');
            }
            return;
        }
        if (cmd === 'on') {
            const t = (get(TOKEN) || '').trim();
            if (!t) {
                set(STATUS, 'error:No token saved yet.');
                return;
            }
            DerivWSAccountsService.clearCache();
            const accounts = await DerivWSAccountsService.fetchAccountsList(t);
            if (!accounts || accounts.length === 0) throw new Error('No Deriv accounts were found for this token.');
            await DerivWSAccountsService.fetchOTPWebSocketURL(t, accounts[0].account_id);
            storeAuthInfo({
                access_token: t,
                token_type: 'Bearer',
                expires_in: 0,
                expires_at: 0,
                scope: 'trade',
                refresh_token: '',
            });
            DerivWSAccountsService.storeAccounts(accounts);
            set('active_loginid', accounts[0].account_id);
            set('account_type', accounts[0].account_type === 'demo' ? 'demo' : 'real');
            set(ACTIVE, '1');
            set(STATUS, 'on');
            window.location.replace(window.location.origin + window.location.pathname);
        }
    } catch (e) {
        DerivWSAccountsService.clearStoredAccounts();
        const msg = String((e as Error)?.message ?? '');
        set(
            STATUS,
            'error:' +
                (/40[13]/.test(msg)
                    ? 'Deriv rejected this token. Check it is correct, not expired, and made for the current Deriv API.'
                    : 'Could not sign in with this token. Try again.')
        );
    } finally {
        busy = false;
    }
};

const MyToken = () => {
    useEffect(() => {
        run();
        const onStore = (e: StorageEvent) => {
            if (e.key === CMD) run();
        };
        window.addEventListener('storage', onStore);
        return () => window.removeEventListener('storage', onStore);
    }, []);
    return null;
};

export default MyToken;
