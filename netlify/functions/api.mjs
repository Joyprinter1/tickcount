import { getStore } from '@netlify/blobs';
import { handle } from './lib/handler.mjs';

export default async (req) => {
    try {
        const store = getStore({ name: 'tickdesk-bots', consistency: 'strong' });
        return await handle(req, store, { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, COPY_KEY: process.env.COPY_KEY, DERIV_APP_ID: process.env.DERIV_APP_ID });
    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: 'Server error. Please try again.' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    }
};

export const config = { path: '/api/*' };
