import classnames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import ThemedScrollbars from '../shared_ui/themed-scrollbars';
import SummaryCard from './summary-card';

const MARKET_NAMES: Record<string, string> = {
    R_10: 'Vol 10', R_25: 'Vol 25', R_50: 'Vol 50', R_75: 'Vol 75', R_100: 'Vol 100',
    '1HZ10V': 'Vol 10 (1s)', '1HZ15V': 'Vol 15 (1s)', '1HZ25V': 'Vol 25 (1s)', '1HZ30V': 'Vol 30 (1s)',
    '1HZ50V': 'Vol 50 (1s)', '1HZ75V': 'Vol 75 (1s)', '1HZ90V': 'Vol 90 (1s)', '1HZ100V': 'Vol 100 (1s)',
};

// Bots that rotate markets carry a variable "ROTATE|SYM1,SYM2,..." (see Purchase.js): show the list, the market of the
// current / last trade and the next one at the top of the Summary.
const getRotation = (): string[] => {
    try {
        const ws = (window as any).Blockly?.derivWorkspace;
        const vars: any[] = ws?.getAllVariables ? ws.getAllVariables() : [];
        for (const v of vars) {
            const name = String(v.name ?? (v.getName ? v.getName() : ''));
            if (name.startsWith('ROTATE|')) return name.slice(7).split(',').filter(Boolean);
        }
    } catch (e) {
        // ignore
    }
    return [];
};
const label = (sym: string) => MARKET_NAMES[sym] ?? sym;

const RotationStrip = ({ current }: { current?: string }) => {
    const list = getRotation();
    if (!list.length) return null;
    const at = current ? list.indexOf(current) : -1;
    const next = list[(at + 1) % list.length];
    return (
        <div className='summary-rotation' data-testid='summary-rotation'>
            <div className='summary-rotation__line'>
                {current ? (
                    <>
                        Trading: <b>{label(current)}</b> · Next: <b>{label(next)}</b>
                    </>
                ) : (
                    <>
                        Starts on: <b>{label(list[0])}</b>
                    </>
                )}
            </div>
            <div className='summary-rotation__chips'>
                {list.map(m => (
                    <span key={m} className={m === current ? 'is-now' : m === next && current ? 'is-next' : ''}>
                        {label(m)}
                    </span>
                ))}
            </div>
        </div>
    );
};

type TSummary = {
    is_drawer_open: boolean;
};

const Summary = observer(({ is_drawer_open }: TSummary) => {
    const { dashboard, summary_card } = useStore();
    const { is_contract_loading, contract_info, is_bot_running } = summary_card;
    const { active_tour } = dashboard;
    const { isDesktop } = useDevice();
    return (
        <div
            className={classnames({
                'run-panel-tab__content': isDesktop,
                'run-panel-tab__content--mobile': !isDesktop && is_drawer_open,
                'run-panel-tab__content--summary-tab': (isDesktop && is_drawer_open) || active_tour,
            })}
            data-testid='mock-summary'
        >
            <RotationStrip current={(contract_info as any)?.underlying_symbol ?? (contract_info as any)?.underlying} />
            <ThemedScrollbars
                className={classnames({
                    summary: (!is_contract_loading && !contract_info) || is_bot_running,
                    'summary--loading':
                        (!isDesktop && is_contract_loading) || (!isDesktop && !is_contract_loading && contract_info),
                })}
            >
                <SummaryCard
                    is_contract_loading={is_contract_loading}
                    contract_info={contract_info}
                    is_bot_running={is_bot_running}
                />
            </ThemedScrollbars>
        </div>
    );
});

export default Summary;
