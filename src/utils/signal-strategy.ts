/**
 * Turns the plain Deriv Martingale template (src/xml/martingale.xml) into a signal bot:
 *  - waits for the signal's trigger digit(s) before each purchase, and
 *  - stops trading after the signal's number of runs.
 *
 * Uses only standard DOM calls so it can be unit-tested in any browser.
 */
export type TSignalExtras = {
    trigger?: number[];
    runs?: number;
    has_prediction?: boolean;
};

const RUNS_VAR_ID = 'signal_runs_var';
const RUNS_VAR_NAME = 'signal:runs';

type TAttrs = Record<string, string>;

const make = (doc: Document, tag: string, attrs: TAttrs = {}, children: (Element | string)[] = []) => {
    // Same namespace as the parsed template, otherwise serialising adds xmlns="" to new nodes.
    const el = doc.createElementNS(doc.documentElement.namespaceURI, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    children.forEach(c => el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c));
    return el;
};

const num = (doc: Document, n: number) =>
    make(doc, 'block', { type: 'math_number' }, [make(doc, 'field', { name: 'NUM' }, [String(n)])]);

const valueOf = (doc: Document, name: string, block: Element) => make(doc, 'value', { name }, [block]);

const compare = (doc: Document, op: string, a: Element, b: Element) =>
    make(doc, 'block', { type: 'logic_compare' }, [
        make(doc, 'field', { name: 'OP' }, [op]),
        valueOf(doc, 'A', a),
        valueOf(doc, 'B', b),
    ]);

const logic = (doc: Document, op: 'AND' | 'OR', a: Element, b: Element) =>
    make(doc, 'block', { type: 'logic_operation' }, [
        make(doc, 'field', { name: 'OP' }, [op]),
        valueOf(doc, 'A', a),
        valueOf(doc, 'B', b),
    ]);

const child = (parent: Element, selector: string) => parent.querySelector(selector);

const cleanDigits = (digits?: number[]) =>
    Array.from(new Set((digits ?? []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 9)));

export const applySignalExtras = (root: Element, extras: TSignalExtras) => {
    const doc = root.ownerDocument as Document;
    const digits = cleanDigits(extras.trigger);
    const runs = Math.floor(Number(extras.runs));

    // 1. Contracts without a barrier (even/odd) must not carry a prediction input.
    if (extras.has_prediction === false) {
        const mutation = child(root, 'block[type="trade_definition_tradeoptions"] > mutation');
        mutation?.setAttribute('has_prediction', 'false');
        child(root, 'block[type="trade_definition_tradeoptions"] > value[name="PREDICTION"]')?.remove();
    }

    // 2. Trigger digits: only purchase when the last digit is one of them.
    if (digits.length) {
        const purchase = child(
            root,
            'block[type="before_purchase"] > statement[name="BEFOREPURCHASE_STACK"] > block[type="purchase"]'
        );
        if (!purchase) throw new Error('purchase block not found');
        const stack = purchase.parentElement as Element;
        const checks = digits.map(d =>
            compare(doc, 'EQ', make(doc, 'block', { type: 'last_digit' }), num(doc, d))
        );
        const condition = checks.reduce((acc, c) => logic(doc, 'OR', acc, c));
        const wrapper = make(doc, 'block', { type: 'controls_if' }, [
            valueOf(doc, 'IF0', condition),
            make(doc, 'statement', { name: 'DO0' }),
        ]);
        stack.replaceChild(wrapper, purchase);
        wrapper.querySelector('statement[name="DO0"]')?.appendChild(purchase);
    }

    // 3. Runs: count finished trades and stop asking to trade again after N.
    if (runs >= 1) {
        const stack = child(root, 'block[type="after_purchase"] > statement[name="AFTERPURCHASE_STACK"]');
        const first = stack?.firstElementChild;
        if (!stack || !first || first.getAttribute('type') !== 'controls_if') throw new Error('after_purchase not as expected');
        const if0 = first.querySelector(':scope > value[name="IF0"]');
        const old_condition = if0?.firstElementChild;
        if (!if0 || !old_condition) throw new Error('trade-again condition not found');

        let variables = child(root, 'variables');
        if (!variables) {
            variables = make(doc, 'variables');
            root.insertBefore(variables, root.firstChild);
        }
        variables.appendChild(
            make(doc, 'variable', { type: '', id: RUNS_VAR_ID, islocal: 'false', iscloud: 'false' }, [RUNS_VAR_NAME])
        );
        const varField = () =>
            make(doc, 'field', { name: 'VAR', id: RUNS_VAR_ID, variabletype: '' }, [RUNS_VAR_NAME]);

        const below_limit = compare(
            doc,
            'LT',
            make(doc, 'block', { type: 'variables_get' }, [varField()]),
            num(doc, runs)
        );
        // Keep the original condition first: it has side effects (martingale bookkeeping).
        if0.removeChild(old_condition);
        if0.appendChild(logic(doc, 'AND', old_condition, below_limit));

        // Count this finished trade before the condition is evaluated.
        const counter = make(doc, 'block', { type: 'math_change' }, [
            varField(),
            make(doc, 'value', { name: 'DELTA' }, [
                make(doc, 'shadow', { type: 'math_number' }, [make(doc, 'field', { name: 'NUM' }, ['1'])]),
            ]),
            make(doc, 'next'),
        ]);
        stack.replaceChild(counter, first);
        counter.querySelector(':scope > next')?.appendChild(first);
    }
};
