/**
 * Fast mode: makes the loaded bot trade the shortest tick duration it allows (1 tick, or 2 for Only Ups / Only Downs).
 * It only edits the duration number in the bot, so everything else (stake, martingale, entry digit...) stays as it was.
 * Turning it off puts the original duration back.
 */
type TBlock = {
    id: string;
    type: string;
    getFieldValue: (name: string) => string;
    setFieldValue: (value: string, name: string) => void;
    getInputTargetBlock: (name: string) => TBlock | null;
    getField: (name: string) => { getText: () => string } | null;
};

const ONE_TICK_TYPES = ['overunder', 'matchesdiffers', 'evenodd', 'risefall'];
const STORE = 'td.fast.orig';

const findHolder = (ws: { getAllBlocks: (ordered: boolean) => TBlock[] }) => {
    const blocks = ws.getAllBlocks(false);
    const options = blocks.find(b => b.type === 'trade_definition_tradeoptions');
    const trade_type = blocks.find(b => b.type === 'trade_definition_tradetype')?.getFieldValue('TRADETYPE_LIST');
    if (!options) return { error: 'Load a bot first.' };
    if (options.getFieldValue('DURATIONTYPE_LIST') !== 't') return { error: 'Fast mode works on tick trades only.' };
    const min = trade_type === 'runs' ? 2 : ONE_TICK_TYPES.includes(trade_type) ? 1 : 0;
    if (!min) return { error: 'Fast mode is not available for this trade type.' };
    let target = options.getInputTargetBlock('DURATION');
    if (target?.type === 'variables_get') {
        const name = target.getField('VAR')?.getText();
        const setter = blocks.find(b => b.type === 'variables_set' && b.getField('VAR')?.getText() === name);
        target = setter ? setter.getInputTargetBlock('VALUE') : null;
    }
    if (!target || target.type.indexOf('math_number') !== 0) return { error: 'Fast mode could not find the duration in this bot.' };
    return { holder: target, min };
};

export const applyFastMode = (on: boolean): { ok: boolean; message?: string } => {
    try {
        const ws = (window as any).Blockly?.derivWorkspace;
        if (!ws) return { ok: false, message: 'Open the Bot Builder first.' };
        const found = findHolder(ws) as { holder?: TBlock; min?: number; error?: string };
        if (!found.holder || !found.min) return { ok: false, message: found.error };
        const { holder, min } = found;
        const current = Number(holder.getFieldValue('NUM'));
        let saved: { id: string; value: string } | null = null;
        try {
            saved = JSON.parse(localStorage.getItem(STORE) || 'null');
        } catch (e) {
            saved = null;
        }
        if (on) {
            if (current !== min) {
                try {
                    localStorage.setItem(STORE, JSON.stringify({ id: holder.id, value: String(current) }));
                } catch (e) {
                    // ignore
                }
                holder.setFieldValue(String(min), 'NUM');
            }
        } else if (saved && saved.id === holder.id) {
            holder.setFieldValue(saved.value, 'NUM');
            try {
                localStorage.removeItem(STORE);
            } catch (e) {
                // ignore
            }
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, message: 'Fast mode could not be applied.' };
    }
};
