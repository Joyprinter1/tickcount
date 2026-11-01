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
    tradetype: 'overunder' | 'evenodd' | 'matchesdiffers' | 'risefall' | 'runs' | 'highlowticks' | 'reset' | 'endsinout' | 'accumulator' | 'asian' | 'touchnotouch' | 'multiplier' | 'callputequal' | 'higherlower';
    contract: string; // e.g. DIGITOVER, CALL, RUNHIGH
    ticks?: number; // duration in ticks (Rise/Fall, Only Ups/Downs, High/Low Tick, Reset)
    minutes?: number; // duration in minutes (Ends Between/Outside)
    offset?: number; // barrier distance for Ends Between/Outside (high = +offset, low = -offset) and Touch/No Touch
    side?: '+' | '-'; // Touch/No Touch: barrier above (+) or below (-) the entry price
    multiplier_value?: number; // multiplier, e.g. 100 (falls back to Deriv's first allowed value)
    growth_rate?: number; // accumulator growth rate, e.g. 0.01 for 1%
    tick_count?: number; // accumulator: sell after this many ticks
    prediction: number | null; // barrier digit, null for even/odd
    search_once?: boolean; // default true: wait for the search digit before the first trade only, then trade every tick
    prediction_after_loss?: number; // barrier digit used after a losing trade (defaults to `prediction`)
    trigger: number[]; // last digits that start a trade
    runs: number;
    stake?: number;
    martingale?: number;
    take_profit?: number;
    stop_loss?: number;
    martingale_level?: number;
    hedge?: string; // 'HEDGE|TYPE|digit|barrier|barrier2': second contract bought with every trade (see Purchase.js)
};

const CONTRACT_LABELS: Record<string, string> = {
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITMATCH: 'Match',
    DIGITDIFF: 'Differs',
    CALL: 'Rise',
    PUT: 'Fall',
    RUNHIGH: 'Only Ups',
    RUNLOW: 'Only Downs',
    TICKHIGH: 'High Tick',
    TICKLOW: 'Low Tick',
    RESETCALL: 'Reset Call',
    RESETPUT: 'Reset Put',
    EXPIRYRANGE: 'Ends Between',
    EXPIRYMISS: 'Ends Outside',
    ACCU: 'Accumulator',
    ASIANU: 'Asian Up',
    ASIAND: 'Asian Down',
    ONETOUCH: 'Touch',
    NOTOUCH: 'No Touch',
    MULTUP: 'Multiplier Up',
    MULTDOWN: 'Multiplier Down',
    CALLE: 'Rise Equals',
    PUTE: 'Fall Equals',
};

// Deriv's trade type category / trade type names for each kind of signal bot.
const TRADE_CATEGORY: Record<string, [string, string]> = {
    overunder: ['digits', 'overunder'],
    evenodd: ['digits', 'evenodd'],
    matchesdiffers: ['digits', 'matchesdiffers'],
    risefall: ['callput', 'callput'],
    runs: ['runs', 'runs'],
    highlowticks: ['highlowticks', 'highlowticks'],
    reset: ['reset', 'reset'],
    endsinout: ['inout', 'endsinout'],
    accumulator: ['accumulator', 'accumulator'],
    asian: ['asian', 'asians'],
    touchnotouch: ['touchnotouch', 'touchnotouch'],
    multiplier: ['multiplier', 'multiplier'],
    callputequal: ['callput', 'callputequal'],
    higherlower: ['callput', 'higherlower'],
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

    const has_prediction =
        (o.tradetype === 'overunder' || o.tradetype === 'matchesdiffers' || o.tradetype === 'highlowticks') &&
        o.prediction !== null;
    const is_inout = o.tradetype === 'endsinout';
    const is_accu = o.tradetype === 'accumulator';
    const is_touch = o.tradetype === 'touchnotouch';
    const is_mult = o.tradetype === 'multiplier';
    const is_hl = o.tradetype === 'higherlower';
    const has_barrier = is_inout || is_touch || is_hl;
    const uses_ticks =
        o.tradetype === 'risefall' ||
        o.tradetype === 'runs' ||
        o.tradetype === 'highlowticks' ||
        o.tradetype === 'reset' ||
        o.tradetype === 'asian' ||
        o.tradetype === 'callputequal' ||
        o.tradetype === 'higherlower' ||
        o.tradetype === 'touchnotouch';
    const uses_duration = uses_ticks || is_inout;
    const dur_name = is_inout ? 'Minutes' : 'Ticks';
    const ticks = Math.max(
        1,
        Math.floor(Number(o.ticks)) || (o.tradetype === 'runs' ? 2 : o.tradetype === 'highlowticks' || o.tradetype === 'reset' || o.tradetype === 'asian' || o.tradetype === 'touchnotouch' || o.tradetype === 'higherlower' ? 5 : 1)
    );
    const minutes = Math.max(2, Math.floor(Number(o.minutes)) || 2);
    const duration = is_inout ? minutes : ticks;
    const offset = o.offset && o.offset > 0 ? o.offset : 1;
    const growth_rate = o.growth_rate && o.growth_rate > 0 ? o.growth_rate : 0.01;
    const tick_count = Math.max(1, Math.floor(Number(o.tick_count)) || 5);
    const triggers = Array.from(new Set(o.trigger.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 9))).slice(0, 1);
    const stake = o.stake && o.stake > 0 ? o.stake : 1;
    const martingale = o.martingale && o.martingale >= 1 ? o.martingale : 2;
    // 0 means "off": use a limit far above anything a session can reach.
    const limit = (x: number | undefined) => (x === undefined ? 10 : x > 0 ? x : 1000000);
    const take_profit = limit(o.take_profit);
    const stop_loss = limit(o.stop_loss);
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
                  ['Prediction after loss', Number.isInteger(o.prediction_after_loss) ? (o.prediction_after_loss as number) : (o.prediction as number)],
              ] as [string, number][])
            : []),
        ...(uses_duration ? ([[dur_name, duration]] as [string, number][]) : []),
        ...(has_barrier ? ([['Barrier Offset', offset]] as [string, number][]) : []),
        ...(is_accu ? ([['Tick Count', tick_count]] as [string, number][]) : []),
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
<mutation has_first_barrier="${has_barrier}" has_second_barrier="${is_inout}" has_prediction="${has_prediction}"></mutation>
${field('DURATIONTYPE_LIST', is_inout ? 'm' : 't')}${field('CURRENCY_LIST', 'USD')}${is_inout ? field('BARRIEROFFSETTYPE_LIST', '+') + field('SECONDBARRIEROFFSETTYPE_LIST', '-') : is_touch || is_hl ? field('BARRIEROFFSETTYPE_LIST', o.side === '-' ? '-' : '+') : ''}
<value name="DURATION"><shadow type="math_number" id="${id()}">${field('NUM', uses_duration ? duration : 1)}</shadow>${uses_duration ? get(dur_name) : ''}</value>
<value name="AMOUNT"><shadow type="math_number" id="${id()}">${field('NUM', 1)}</shadow>${get('Stake')}</value>
${is_touch || is_hl ? `<value name="BARRIEROFFSET"><shadow type="math_number" id="${id()}">${field('NUM', offset)}</shadow>${get('Barrier Offset')}</value>` : ''}${is_inout ? `<value name="BARRIEROFFSET"><shadow type="math_number" id="${id()}">${field('NUM', offset)}</shadow>${get('Barrier Offset')}</value><value name="SECONDBARRIEROFFSET"><shadow type="math_number" id="${id()}">${field('NUM', offset)}</shadow>${get('Barrier Offset')}</value>` : ''}
${has_prediction ? `<value name="PREDICTION"><shadow type="math_number_positive" id="${id()}">${field('NUM', 0)}</shadow>${get('Prediction')}</value>` : ''}
</block>`;

    // ---- Before purchase: wait for the trigger digit(s), then buy ----
    const purchase_block = () => `<block type="purchase" id="${id()}">${field('PURCHASE_LIST', o.contract)}</block>`;
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
    )}</statement><next><block type="notify" id="${id()}">${field('NOTIFICATION_TYPE', 'info')}${field('NOTIFICATION_SOUND', 'silent')}<value name="MESSAGE">${text_shadow('abc')}${get('Search Message')}</value><next>${purchase_block()}</next></block></next></block>`;
    const accu_block = `<block type="trade_definition_accumulator" id="${id()}">${field('GROWTHRATE_LIST', growth_rate)}
<value name="AMOUNT"><shadow type="math_number_positive" id="${id()}">${field('NUM', 1)}</shadow>${get('Stake')}</value>
<statement name="ACCUMULATOR_PARAMS"><block type="accumulator_take_profit" id="${id()}" disabled="true"><value name="AMOUNT"><shadow type="math_number_positive" id="${id()}">${field('NUM', 0)}</shadow></value></block></statement></block>`;
    const accu_reset = chain([
        next => set('Current Tick Value', num(0), next),
        next => set('Is Bought', `<block type="logic_boolean" id="${id()}">${field('BOOL', 'FALSE')}</block>`, next),
        () => purchase_block(),
    ]);
    const mult_tp = o.take_profit && o.take_profit > 0 && o.take_profit < 1000000 ? o.take_profit : stake * 2;
    const mult_sl = Math.min(stake, o.stop_loss && o.stop_loss > 0 && o.stop_loss < 1000000 ? o.stop_loss : stake);
    const mult_block = `<block type="trade_definition_multiplier" id="${id()}">${field('MULTIPLIERTYPE_LIST', o.multiplier_value && o.multiplier_value > 0 ? o.multiplier_value : 100)}
<value name="AMOUNT"><shadow type="math_number_positive" id="${id()}">${field('NUM', 1)}</shadow>${get('Stake')}</value>
<statement name="MULTIPLIER_PARAMS"><block type="multiplier_take_profit" id="${id()}"><value name="AMOUNT"><shadow type="math_number_positive" id="${id()}">${field('NUM', mult_tp)}</shadow></value><next><block type="multiplier_stop_loss" id="${id()}"><value name="AMOUNT"><shadow type="math_number_positive" id="${id()}">${field('NUM', mult_sl)}</shadow></value></block></next></block></statement></block>`;
    const before_purchase_stack = is_accu
        ? accu_reset
        : trigger_condition
        ? o.search_once === false
            ? `<block type="controls_if" id="${id()}">${value('IF0', trigger_condition)}<statement name="DO0">${search_note}</statement></block>`
            : // Search only before the first trade; after that trade on every tick.
              `<block type="controls_if" id="${id()}"><mutation elseif="1"></mutation>${value('IF0', cmp('GT', get('Runs'), num(0)))}<statement name="DO0">${purchase_block()}</statement>${value('IF1', trigger_condition)}<statement name="DO1">${search_note}</statement></block>`
        : purchase_block();

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

    // Accumulators have no expiry: count ticks while the trade is open, then sell at market.
    const accu_extra = !is_accu
        ? ''
        : `<block type="during_purchase" id="${id()}" x="760" y="360"><statement name="DURING_PURCHASE_STACK">${set(
              'Is Bought',
              `<block type="logic_boolean" id="${id()}">${field('BOOL', 'TRUE')}</block>`,
              `<block type="controls_if" id="${id()}">${value(
                  'IF0',
                  logic(
                      'AND',
                      `<block type="check_sell" id="${id()}"></block>`,
                      cmp('GT', get('Current Tick Value'), get('Tick Count'))
                  )
              )}<statement name="DO0"><block type="sell_at_market" id="${id()}"></block></statement></block>`
          )}</statement></block>
<block type="tick_analysis" id="${id()}" x="760" y="560"><statement name="TICKANALYSIS_STACK"><block type="controls_if" id="${id()}">${value(
              'IF0',
              get('Is Bought')
          )}<statement name="DO0">${change('Current Tick Value', num(1))}</statement></block></statement></block>`;

    const body = `<block type="trade_definition" id="${id()}" x="0" y="0">
<statement name="TRADE_OPTIONS">
<block type="trade_definition_market" id="${id()}" deletable="false" movable="false">${field('MARKET_LIST', o.market)}${field('SUBMARKET_LIST', o.submarket)}${field('SYMBOL_LIST', o.symbol)}
<next><block type="trade_definition_tradetype" id="${id()}" deletable="false" movable="false">${field('TRADETYPECAT_LIST', TRADE_CATEGORY[o.tradetype][0])}${field('TRADETYPE_LIST', TRADE_CATEGORY[o.tradetype][1])}
<next><block type="trade_definition_contracttype" id="${id()}" deletable="false" movable="false">${field('TYPE_LIST', is_accu ? 'ACCU' : 'both')}
<next><block type="trade_definition_candleinterval" id="${id()}" deletable="false" movable="false">${field('CANDLEINTERVAL_LIST', 60)}
<next><block type="trade_definition_restartbuysell" id="${id()}" deletable="false" movable="false">${field('TIME_MACHINE_ENABLED', 'FALSE')}
<next><block type="trade_definition_restartonerror" id="${id()}" deletable="false" movable="false">${field('RESTARTONERROR', 'TRUE')}</block></next>
</block></next></block></next></block></next></block></next></block>
</statement>
<statement name="INITIALIZATION">${init_xml}</statement>
<statement name="SUBMARKET">${is_accu ? accu_block : is_mult ? mult_block : trade_options}</statement>
</block>
<block type="after_purchase" id="${id()}" x="760" y="0"><statement name="AFTERPURCHASE_STACK">${after_purchase_stack}</statement></block>
<block type="before_purchase" id="${id()}" x="0" y="640"><statement name="BEFOREPURCHASE_STACK">${before_purchase_stack}</statement></block>${is_accu ? accu_extra : ''}`;

    if (o.hedge) v(o.hedge);
    const variables = Object.entries(vars)
        .map(([name, vid]) => `<variable type="" id="${vid}" islocal="false" iscloud="false">${esc(name)}</variable>`)
        .join('');

    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true"><variables>${variables}</variables>${body}</xml>`;
};
