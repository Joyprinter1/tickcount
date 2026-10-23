/**
 * On slow or patchy mobile connections a lazily loaded part of the app (a JS or CSS chunk) can fail to download.
 * React then shows the "Sorry for the interruption" screen, and if that happens while Deriv is sending the user
 * back after login, the login looks like it failed. This retries failed chunk downloads a few times before giving up.
 */
import React from 'react';

const CHUNK_ERROR = /Loading (CSS )?chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

export const isChunkError = (e: unknown): boolean => {
    const err = e as { name?: string; message?: string } | null;
    return !!err && (err.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(err.message ?? e)));
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// A failed stylesheet <link> stays in the page and would make the next attempt think the CSS is already there.
const dropFailedStylesheet = (e: unknown) => {
    try {
        const url = /\((https?:[^)\s]+)\)/.exec(String((e as Error)?.message ?? ''))?.[1];
        if (!url) return;
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(l => {
            if (l.href === url) l.remove();
        });
    } catch {
        /* ignore */
    }
};

export async function retryImport<T>(factory: () => Promise<T>, tries = 4): Promise<T> {
    let last: unknown;
    for (let i = 0; i < tries; i++) {
        try {
            return await factory();
        } catch (e) {
            last = e;
            if (!isChunkError(e) || i === tries - 1) break;
            dropFailedStylesheet(e);
            await sleep(700 * (i + 1));
        }
    }
    throw last;
}

export const installLazyRetry = () => {
    try {
        const react = React as unknown as { lazy: (f: () => Promise<unknown>) => unknown; __tdRetry?: boolean };
        if (react.__tdRetry) return;
        const original = react.lazy;
        react.lazy = factory => original(() => retryImport(factory));
        react.__tdRetry = true;
    } catch {
        // If React cannot be patched the app simply works as before.
    }
};
