/**
 * Builds a complete Deriv Bot (Blockly) strategy for a Tickdesk signal, laid out like a
 * typical "martingale with loss counter" bot: every setting is a named variable under
 * "Run once at start", so the user can change it in the builder before tapping Run.
 *
 * Only standard Deriv Bot blocks are used. Pure function (string in, string out).
 */
export type TSignalBotOptions = {
    market: string;
    submarket: string;
    symbol: string;
    tradetype: 'overunder' | 'evenodd' | 'matchesdiffers';
    contract: string; // e.g. DIGITOVER
    prediction: number | null; // barrier digit, null for even/odd
    trigger: number[]; // last digits that start a trade
    runs: number;
    stake?: number;
    martingale?: number;
    take_profit?: number;
    stop_loss?: number;
    martingale_level?: number;
};

const CONTRACT_LABELS: Record<string, string> = {
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITMATCH: 'Match',
    DIGITDIFF: 'Differs',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const buildSignalBotXml = (o: TSignalBotOptions) => {
    let n = 0;
    const id = () => `tb_${++n}`;
    const vars: Record<string, string> = {};
    const v = (name: string) => (vars[name] ??= `tv_${Object.keys(vars).length + 1}`);

    const field = (name: string, value: string | number) => `<field name="${name}">${esc(String(value))}</field>`;
    const varField = (name: string) => `<field name="VAR" id="${v(name)}" variabletype="">${esc(name)}</field>`;
    const num = (x: number) => `<block type="math_number" id="${id()}">${field('NUM', x)}</block>`;
    const get = (name: string) => `<block type="variables_get" id="${id()}">${varField(name)}</block>`;
    const value = (name: string, inner: string) => `<value name="${name}">${inner}</value>`;
    const set = (name: string, inner: string, next = '') =>
        `<block type="variables_set" id="${id()}">${varField(name)}${value('VALUE', inner)}${next ? `<next>${next}</next>` : ''}</block>`;
    const change = (name: string, inner: string, next = '') =>
        `<block type="math_change" id="${id()}">${varField(name)}${value('DELTA', inner)}${next ? `<next>${next}</next>` : ''}</block>`;
    const cmp = (op: string, a: string, b: string) =>
        `<block type="logic_compare" id="${id()}">${field('OP', op)}${value('A', a)}${value('B', b)}</block>`;
    const logic = (op: 'AND' | 'OR', a: string, b: string) =>
        `<block type="logic_operation" id="${id()}">${field('OP', op)}${value('A', a)}${value('B', b)}</block>`;
    const arith = (op: string, a: string, b: string) =>
        `<block type="math_arithmetic" id="${id()}">${field('OP', op)}${value('A', a)}${value('B', b)}</block>`;
    const chain = (blocks: ((next: string) => string)[]) =>
        blocks.reduceRight((next, make) => make(next), '');

    const has_prediction = o.tradetype !== 'evenodd' && o.prediction !== null;
    const triggers = Array.from(new Set(o.trigger.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 9))).slice(0, 3);
    const stake = o.stake && o.stake > 0 ? o.stake : 1;
    const martingale = o.martingale && o.martingale > 0 ? o.martingale : 2;
    const take_profit = o.take_profit && o.take_profit > 0 ? o.take_profit : 10;
    const stop_loss = o.stop_loss && o.stop_loss > 0 ? o.stop_loss : 10;
    const level = o.martingale_level && o.martingale_level > 0 ? o.martingale_level : 5;
    const runs = Math.max(1, Math.floor(Number(o.runs)) || 10);
    const search_names = triggers.map((_, i) => `Search Number ${i + 1}`);

    // ---- Run once at start ----
    const init: [string, number][] = [
        ...triggers.map((d, i): [string, number] => [search_names[i], d]),
        ['Stake', stake],
        ['Initial Stake', stake],
        ...(has_prediction
            ? ([
                  ['Prediction', o.prediction as number],
                  ['Prediction before loss', o.prediction as number],
                  ['Prediction after loss', o.prediction as number],
              ] as [string, number][])
            : []),
        ['Martingale', martingale],
        ['Take Profit', take_profit],
        ['Stop Loss', stop_loss],
        ['Martingale Level', level],
        ['Max Runs', runs],
        ['Loss Counter', 0],
        ['Total Profit', 0],
        ['Runs', 0],
    ];
    const init_xml = chain(init.map(([name, x]) => (next: string) => set(name, num(x), next)));

    // ---- Trade options ----
    const trade_options = `<block type="trade_definition_tradeoptions" id="${id()}">
<mutation has_first_barrier="false" has_second_barrier="false" has_prediction="${has_prediction}"></mutation>
${field('DURATIONTYPE_LIST', 't')}${field('CURRENCY_LIST', 'USD')}
<value name="DURATION"><shadow type="math_number" id="${id()}">${field('NUM', 1)}</shadow></value>
<value name="AMOUNT"><shadow type="math_number" id="${id()}">${field('NUM', 1)}</shadow>${get('Stake')}</value>
${has_prediction ? `<value name="PREDICTION"><shadow type="math_number_positive" id="${id()}">${field('NUM', 0)}</shadow>${get('Prediction')}</value>` : ''}
</block>`;

    // ---- Before purchase: wait for the trigger digit(s), then buy ----
    const purchase = `<block type="purchase" id="${id()}">${field('PURCHASE_LIST', o.contract)}</block>`;
    const digit_checks = search_names.map(name => cmp('EQ', `<block type="last_digit" id="${id()}"></block>`, get(name)));
    const trigger_condition = digit_checks.length ? digit_checks.reduce((a, b) => logic('OR', a, b)) : '';
    // Journal line each time a search number shows up: "Search number 6 found - buying Match 4".
    const label = `${CONTRACT_LABELS[o.contract] ?? o.contract}${has_prediction ? ` ${o.prediction}` : ''}`;
    const text_item = (inner: string, next = '') =>
        `<block type="text_statement" id="${id()}"><value name="TEXT">${inner}</value>${next ? `<next>${next}</next>` : ''}</block>`;
    const text_shadow = (t: string) => `<shadow type="text" id="${id()}"><field name="TEXT">${esc(t)}</field></shadow>`;
    const search_note = !trigger_condition
        ? ''
        : `<block type="text_join" id="${id()}"><field name="VARIABLE" id="${v('Search Message')}" variabletype="">Search Message</field><statement name="STACK">${text_item(
        text_shadow('Search number '),
        text_item(
            `${text_shadow('')}<block type="last_digit" id="${id()}"></block>`,
            text_item(text_shadow(` found - buying ${label}`))
        )
    )}</statement><next><block type="notify" id="${id()}">${field('NOTIFICATION_TYPE', 'info')}${field('NOTIFICATION_SOUND', 'silent')}<value name="MESSAGE">${text_shadow('abc')}${get('Search Message')}</value><next>${purchase}</next></block></next></block>`;
    const before_purchase_stack = trigger_condition
        ? `<block type="controls_if" id="${id()}">${value('IF0', trigger_condition)}<statement name="DO0">${search_note}</statement></block>`
        : purchase;

    // ---- After purchase: bookkeeping, martingale, stop rules ----
    const next_stake = arith(
        'DIVIDE',
        `<block type="math_round" id="${id()}">${field('OP', 'ROUND')}${value('NUM', arith('MULTIPLY', arith('MULTIPLY', get('Stake'), get('Martingale')), num(100)))}</block>`,
        num(100)
    );
    const on_win = chain([
        next => set('Loss Counter', num(0), next),
        next => set('Stake', get('Initial Stake'), next),
        ...(has_prediction ? [(next: string) => set('Prediction', get('Prediction before loss'), next)] : []),
    ]);
    const on_loss = chain([
        next => change('Loss Counter', num(1), next),
        next => set('Stake', next_stake, next),
        ...(has_prediction ? [(next: string) => set('Prediction', get('Prediction after loss'), next)] : []),
    ]);
    const keep_going = [
        cmp('LT', get('Total Profit'), get('Take Profit')),
        cmp('GT', get('Total Profit'), arith('MINUS', num(0), get('Stop Loss'))),
        cmp('LT', get('Runs'), get('Max Runs')),
        cmp('LTE', get('Loss Counter'), get('Martingale Level')),
    ].reduce((a, b) => logic('AND', a, b));
    const profit = `<block type="read_details" id="${id()}">${field('DETAIL_INDEX', 4)}</block>`;
    const after_purchase_stack = chain([
        next => change('Total Profit', profit, next),
        next => change('Runs', num(1), next),
        next =>
            `<block type="controls_if" id="${id()}"><mutation else="1"></mutation>${value(
                'IF0',
                `<block type="contract_check_result" id="${id()}">${field('CHECK_RESULT', 'win')}</block>`
            )}<statement name="DO0">${on_win}</statement><statement name="ELSE">${on_loss}</statement>${next ? `<next>${next}</next>` : ''}</block>`,
        () =>
            `<block type="controls_if" id="${id()}">${value('IF0', keep_going)}<statement name="DO0"><block type="trade_again" id="${id()}"></block></statement></block>`,
    ]);

    const body = `<block type="trade_definition" id="${id()}" x="0" y="0">
<statement name="TRADE_OPTIONS">
<block type="trade_definition_market" id="${id()}" deletable="false" movable="false">${field('MARKET_LIST', o.market)}${field('SUBMARKET_LIST', o.submarket)}${field('SYMBOL_LIST', o.symbol)}
<next><block type="trade_definition_tradetype" id="${id()}" deletable="false" movable="false">${field('TRADETYPECAT_LIST', 'digits')}${field('TRADETYPE_LIST', o.tradetype)}
<next><block type="trade_definition_contracttype" id="${id()}" deletable="false" movable="false">${field('TYPE_LIST', 'both')}
<next><block type="trade_definition_candleinterval" id="${id()}" deletable="false" movable="false">${field('CANDLEINTERVAL_LIST', 60)}
<next><block type="trade_definition_restartbuysell" id="${id()}" deletable="false" movable="false">${field('TIME_MACHINE_ENABLED', 'FALSE')}
<next><block type="trade_definition_restartonerror" id="${id()}" deletable="false" movable="false">${field('RESTARTONERROR', 'TRUE')}</block></next>
</block></next></block></next></block></next></block></next></block>
</statement>
<statement name="INITIALIZATION">${init_xml}</statement>
<statement name="SUBMARKET">${trade_options}</statement>
</block>
<block type="after_purchase" id="${id()}" x="760" y="0"><statement name="AFTERPURCHASE_STACK">${after_purchase_stack}</statement></block>
<block type="before_purchase" id="${id()}" x="0" y="640"><statement name="BEFOREPURCHASE_STACK">${before_purchase_stack}</statement></block>`;

    const variables = Object.entries(vars)
        .map(([name, vid]) => `<variable type="" id="${vid}" islocal="false" iscloud="false">${esc(name)}</variable>`)
        .join('');

    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true"><variables>${variables}</variables>${body}</xml>`;
};
