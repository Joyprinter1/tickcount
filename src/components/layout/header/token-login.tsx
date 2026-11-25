import { useState } from 'react';
import Button from '@/components/shared_ui/button';
import { storeAuthInfo } from '@/external/deriv-core';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/**
 * "Token" login: the person pastes their own Deriv API token and is signed in with it.
 * The token is checked with Deriv straight from the browser and kept in this browser only (the same place the
 * normal Log in keeps its token). It is never sent to our own server. Log out clears it.
 */
const TokenLogin = () => {
    const [open, setOpen] = useState(false);
    const [token, setToken] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const close = () => {
        if (busy) return;
        setOpen(false);
        setToken('');
        setError('');
        setShow(false);
    };

    const submit = async () => {
        const t = token.trim();
        if (t.length < 8 || t.length > 300 || /\s/.test(t)) {
            setError('Paste your Deriv API token, with no spaces.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            DerivWSAccountsService.clearCache();
            const accounts = await DerivWSAccountsService.fetchAccountsList(t);
            if (!accounts || accounts.length === 0) throw new Error('No Deriv accounts were found for this token.');
            // make sure Deriv will open a trading connection with it before we sign in
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
            localStorage.setItem('active_loginid', accounts[0].account_id);
            localStorage.setItem('account_type', accounts[0].account_type === 'demo' ? 'demo' : 'real');
            window.location.replace(window.location.origin + window.location.pathname);
        } catch (e) {
            DerivWSAccountsService.clearStoredAccounts();
            const msg = String((e as Error)?.message ?? '');
            setError(
                /40[13]/.test(msg)
                    ? 'Deriv rejected this token. Check that it is correct, has not expired, and was created for the current Deriv API.'
                    : msg && !/Failed to fetch$/.test(msg)
                      ? msg
                      : 'Could not reach Deriv. Check your internet and try again.'
            );
            setBusy(false);
        }
    };

    return (
        <>
            <Button tertiary onClick={() => setOpen(true)}>
                Token
            </Button>
            {open && (
                <div
                    role='dialog'
                    aria-modal='true'
                    aria-label='Log in with a token'
                    onClick={close}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: 'rgba(0,0,0,.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff',
                            color: '#151717',
                            borderRadius: 12,
                            width: 'min(420px, 100%)',
                            padding: 20,
                            boxShadow: '0 12px 40px rgba(0,0,0,.35)',
                            fontSize: 14,
                            lineHeight: 1.45,
                        }}
                    >
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Log in with a token</div>
                        <div style={{ marginBottom: 12 }}>
                            Paste your own Deriv API token. Create it on your Deriv account&apos;s API token page with
                            only the <b>Read</b> and <b>Trade</b> permissions.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type={show ? 'text' : 'password'}
                                value={token}
                                autoFocus
                                autoComplete='off'
                                spellCheck={false}
                                placeholder='API token'
                                onChange={e => setToken(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !busy && submit()}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    padding: '10px 12px',
                                    border: '1px solid #c4c4c4',
                                    borderRadius: 8,
                                    fontSize: 14,
                                    background: '#fff',
                                    color: '#151717',
                                }}
                            />
                            <button
                                type='button'
                                onClick={() => setShow(s => !s)}
                                style={{
                                    border: '1px solid #c4c4c4',
                                    background: '#f5f5f5',
                                    color: '#151717',
                                    borderRadius: 8,
                                    padding: '0 12px',
                                    cursor: 'pointer',
                                }}
                            >
                                {show ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        {error && (
                            <div role='alert' style={{ color: '#c40000', marginTop: 10 }}>
                                {error}
                            </div>
                        )}
                        <div style={{ color: '#555', marginTop: 12, fontSize: 12.5 }}>
                            Your token stays in this browser only and is never sent to our server. It gives full trading
                            access to the account, so never share it or paste it on any other site. Log out removes it.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <Button tertiary onClick={close} disabled={busy}>
                                Cancel
                            </Button>
                            <Button primary onClick={submit} disabled={busy || !token.trim()}>
                                {busy ? 'Checking…' : 'Log in'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TokenLogin;
