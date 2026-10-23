import React from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { transaction_elements } from '@/constants/transactions';
import { useStore } from '@/hooks/useStore';
import './session-card.scss';

type TSession = { profit: number; trades: number; won: number; lost: number; currency: string };

/**
 * Shown when a bot run ends: the session's profit or loss, trades, wins, losses and win rate.
 * It only reads what the bot already recorded and never touches the bot itself.
 */
const SessionCard = observer(() => {
    const { run_panel, transactions, client } = useStore();
    const [session, setSession] = React.useState<TSession | null>(null);

    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const dispose = reaction(
            () => run_panel.is_running,
            (running, was_running) => {
                if (!was_running || running) return;
                const run_id = run_panel.run_id;
                // Give the last contract a moment to be recorded as closed.
                timer = setTimeout(() => {
                    try {
                        const rows = transactions.transactions.filter(
                            t => t.type === transaction_elements.CONTRACT && typeof t.data === 'object'
                        );
                        let profit = 0;
                        let won = 0;
                        let lost = 0;
                        rows.forEach(t => {
                            const c = t.data as unknown as { run_id?: string; is_completed?: boolean; profit?: number | string };
                            if (c.run_id !== run_id || !c.is_completed) return;
                            const p = Number(c.profit) || 0;
                            profit += p;
                            if (p > 0) won += 1;
                            else lost += 1;
                        });
                        const trades = won + lost;
                        if (trades > 0) {
                            setSession({
                                profit: Math.round(profit * 100) / 100,
                                trades,
                                won,
                                lost,
                                currency: client?.currency || 'USD',
                            });
                        }
                    } catch {
                        // never let a summary problem affect trading
                    }
                }, 700);
            }
        );
        return () => {
            dispose();
            if (timer) clearTimeout(timer);
        };
    }, [run_panel, transactions, client]);

    if (!session) return null;
    const tone = session.profit > 0 ? 'win' : session.profit < 0 ? 'loss' : 'flat';
    const title = tone === 'win' ? 'Session profit' : tone === 'loss' ? 'Session loss' : 'Session ended';
    const sign = session.profit > 0 ? '+' : session.profit < 0 ? '-' : '';
    const rate = Math.round((session.won / session.trades) * 100);

    return (
        <div className='td-session' role='dialog' aria-modal='true' aria-label={title}>
            <div className={`td-session__card td-session__card--${tone}`}>
                <div className='td-session__badge' aria-hidden='true'>
                    {tone === 'win' ? '✓' : tone === 'loss' ? '!' : '–'}
                </div>
                <div className='td-session__eyebrow'>BOT STOPPED</div>
                <div className='td-session__title'>{title}</div>
                <div className='td-session__sub'>Trading session has ended.</div>
                <div className='td-session__amount'>
                    {sign}
                    {Math.abs(session.profit).toFixed(2)} {session.currency}
                </div>
                <div className='td-session__grid'>
                    <div>
                        <span>Trades</span>
                        <b>{session.trades}</b>
                    </div>
                    <div>
                        <span>Won</span>
                        <b>{session.won}</b>
                    </div>
                    <div>
                        <span>Lost</span>
                        <b>{session.lost}</b>
                    </div>
                    <div>
                        <span>Win rate</span>
                        <b>{rate}%</b>
                    </div>
                </div>
                <button type='button' className='td-session__btn' onClick={() => setSession(null)} autoFocus>
                    CONTINUE
                </button>
            </div>
        </div>
    );
});

export default SessionCard;
