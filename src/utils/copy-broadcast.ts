/**
 * Copy trading, owner side. When the owner has switched on "Send my trades from this browser" in the
 * admin page, every contract the bot buys is reported to the Tickdesk server, which places the same
 * trade on the accounts of the clients the owner has activated. For everyone else this does nothing.
 */
type TCopyPayload = {
    parameters: Record<string, unknown>;
    isVirtual: boolean;
    masterContractId?: string | number;
};

const OWNER_KEY = 'tickdesk.copy.owner';

const readToken = (): string => {
    try {
        const raw = window.localStorage.getItem(OWNER_KEY);
        return raw ? String(JSON.parse(raw)?.token ?? '') : '';
    } catch {
        return '';
    }
};

export const installCopyBroadcast = () => {
    (window as unknown as { __tickdeskCopy?: (p: TCopyPayload) => void }).__tickdeskCopy = (payload: TCopyPayload) => {
        const token = readToken();
        if (!token) return;
        fetch('/api/copy/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
            keepalive: true,
        })
            .then(res => {
                // The owner's sign-in expired: stop quietly, the admin page tells them to switch it on again.
                if (res.status === 401) {
                    try {
                        window.localStorage.removeItem(OWNER_KEY);
                    } catch {
                        /* ignore */
                    }
                }
            })
            .catch(() => undefined);
    };
};
