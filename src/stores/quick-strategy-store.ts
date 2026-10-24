// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { action, makeObservable, observable, reaction } from 'mobx';
import { ApiHelpers, config as qs_config, load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { buildSignalBotXml, type TSignalBotOptions } from '@/utils/signal-bot-xml';
import { applySignalExtras, TSignalExtras } from '@/utils/signal-strategy';
import { addDynamicBlockToDOM } from '@/utils/xml-dom-quick-strategy';
import { STRATEGIES } from '../pages/bot-builder/quick-strategy/config';
import { TFormData } from '../pages/bot-builder/quick-strategy/types';
import { getSetting, storeSetting } from '../utils/settings';
import RootStore from './root-store';

export type TTickdeskSignal = {
    symbol: string;
    contract: string;
    barrier: number | null;
    trigger: number[];
    runs: number;
    ticks?: number;
    minutes?: number;
    offset?: number;
    growth_rate?: number;
    tick_count?: number;
    stake?: number;
    tp?: number;
    sl?: number;
};

const SIGNAL_TRADE_TYPES: Record<string, string> = {
    DIGITOVER: 'overunder',
    DIGITUNDER: 'overunder',
    DIGITEVEN: 'evenodd',
    DIGITODD: 'evenodd',
    DIGITMATCH: 'matchesdiffers',
    DIGITDIFF: 'matchesdiffers',
    CALL: 'risefall',
    PUT: 'risefall',
    RUNHIGH: 'runs',
    RUNLOW: 'runs',
    TICKHIGH: 'highlowticks',
    TICKLOW: 'highlowticks',
    RESETCALL: 'reset',
    RESETPUT: 'reset',
    EXPIRYRANGE: 'endsinout',
    EXPIRYMISS: 'endsinout',
    ACCU: 'accumulator',
};

export type TActiveSymbol = {
    group: string;
    text: string;
    value: string;
};

export type TLossThresholdWarningData = {
    show: boolean;
    loss_amount?: string | number;
    currency?: string;
    highlight_field?: Array<string>;
    already_shown?: boolean;
};

interface IQuickStrategyStore {
    additional_data: Record<string, unknown>;
    current_duration_min_max: {
        min: number;
        max: number;
    };
    root_store: RootStore;
    is_open: boolean;
    selected_strategy: string;
    selected_strategy_for_notofy: string;
    form_data: TFormData;
    loss_threshold_warning_data: {
        show: boolean;
    };
    is_contract_dialog_open: boolean;
    is_stop_bot_dialog_open: boolean;
    is_options_loading: boolean;
    setLossThresholdWarningData: (data: TLossThresholdWarningData) => void;
    setFormVisibility: (is_open: boolean) => void;
    setSelectedStrategy: (strategy: string) => void;
    setValue: (name: string, value: string) => void;
    onSubmit: (data: TFormData, signal_extras?: TSignalExtras) => void;
    loadSignal: (signal: TTickdeskSignal) => Promise<void>;
    loadBotXml: (xml: string, name?: string) => Promise<void>;
    toggleStopBotDialog: () => void;
    setCurrentDurationMinMax: (min: number, max: number) => void;
    setOptionsLoading: (is_loading: boolean) => void;
}

export default class QuickStrategyStore implements IQuickStrategyStore {
    root_store: RootStore;
    is_open = false;
    selected_strategy = 'MARTINGALE';
    selected_strategy_for_notofy = '';
    form_data: TFormData = {
        symbol: qs_config().QUICK_STRATEGY.DEFAULT.symbol,
        tradetype: qs_config().QUICK_STRATEGY.DEFAULT.tradetype,
        durationtype: qs_config().QUICK_STRATEGY.DEFAULT.durationtype,
        action: 'RUN',
    };
    is_contract_dialog_open = false;
    is_stop_bot_dialog_open = false;
    is_options_loading = false;
    current_duration_min_max = {
        min: 0,
        max: 10,
    };
    loss_threshold_warning_data: TLossThresholdWarningData = {
        show: false,
    };
    additional_data = {};

    constructor(root_store: RootStore) {
        makeObservable(this, {
            additional_data: observable,
            current_duration_min_max: observable,
            form_data: observable,
            is_contract_dialog_open: observable,
            is_open: observable,
            is_stop_bot_dialog_open: observable,
            is_options_loading: observable,
            initializeLossThresholdWarningData: action,
            selected_strategy: observable,
            selected_strategy_for_notofy: observable,
            loss_threshold_warning_data: observable,
            onSubmit: action,
            loadSignal: action,
            loadBotXml: action,
            setAdditionalData: action,
            setCurrentDurationMinMax: action,
            setFormVisibility: action,
            setSelectedStrategy: action,
            setLossThresholdWarningData: action,
            setValue: action,
            toggleStopBotDialog: action,
            setOptionsLoading: action,
        });
        this.root_store = root_store;

        // Initialize selected_strategy_for_notofy from localStorage if available
        const savedStrategy = getSetting('selected_strategy_for_notofy');
        if (savedStrategy) {
            this.selected_strategy_for_notofy = savedStrategy;
        }
        reaction(
            () => this.is_open,
            () => {
                if (!this.is_open) {
                    this.selected_strategy = 'MARTINGALE';
                }
            }
        );
    }

    setAdditionalData = (data: Record<string, unknown>) => {
        this.additional_data = {
            ...this.additional_data,
            ...data,
        };
    };

    setLossThresholdWarningData = (data: TLossThresholdWarningData) => {
        this.loss_threshold_warning_data = {
            ...this.loss_threshold_warning_data,
            ...data,
        };
    };

    initializeLossThresholdWarningData = () => {
        this.loss_threshold_warning_data = {
            show: false,
            highlight_field: [],
            already_shown: false,
        };
    };

    setFormVisibility = (is_open: boolean) => {
        this.is_open = is_open;
    };

    setSelectedStrategy = (strategy: string) => {
        this.selected_strategy = strategy;
    };

    setValue = (name: string, value: string | number | boolean) => {
        this.form_data[name as keyof TFormData] = value;
    };

    setCurrentDurationMinMax = (min = 0, max = 10) => {
        this.current_duration_min_max = {
            min,
            max,
        };
    };

    onSubmit = async (data: TFormData, signal_extras?: TSignalExtras) => {
        const { contracts_for } = ApiHelpers?.instance ?? {};
        if (!contracts_for) return;
        const market = await contracts_for.getMarketBySymbol(data.symbol);
        const submarket = await contracts_for.getSubmarketBySymbol(data.symbol);
        const trade_type_cat = await contracts_for.getTradeTypeCategoryByTradeType(data.tradetype);
        const selected_strategy = STRATEGIES()[this.selected_strategy];
        this.selected_strategy_for_notofy = this.selected_strategy;
        // Persist the selected strategy for notifications in localStorage
        storeSetting('selected_strategy_for_notofy', this.selected_strategy);
        const strategy_xml = await import(/* webpackChunkName: `[request]` */ `../xml/${selected_strategy.name}.xml`);
        const strategy_dom = window.Blockly.utils.xml.textToDom(strategy_xml.default);
        addDynamicBlockToDOM('PREDICTION', 'last_digit_prediction', trade_type_cat, strategy_dom);

        const modifyValueInputs = (key: string, value: number) => {
            const el_value_inputs = strategy_dom?.querySelectorAll(`value[strategy_value="${key}"]`);
            el_value_inputs?.forEach((el_value_input: HTMLElement) => {
                if (key.includes('boolean'))
                    if (value)
                        el_value_input.innerHTML = `<block type="logic_boolean"><field name="BOOL">TRUE</field></block>`;
                    else
                        el_value_input.innerHTML = `<block type="logic_boolean"><field name="BOOL">FALSE</field></block>`;
                else
                    el_value_input.innerHTML = `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;
            });
        };

        const modifyFieldDropdownValues = (name: string, value: string) => {
            const name_list = `${name.toUpperCase()}_LIST`;
            const el_blocks = strategy_dom?.querySelectorAll(`field[name="${name_list}"]`);
            el_blocks?.forEach((el_block: HTMLElement) => {
                el_block.innerHTML = value;
            });
        };
        const { unit, action, type, growth_rate, ...rest_data } = data;
        const fields_to_update = {
            market,
            submarket,
            tradetypecat: trade_type_cat,
            dalembert_unit: unit,
            oscar_unit: unit,
            type: 'both',
            ...rest_data,
            purchase: type,
            growthrate: growth_rate ? growth_rate.toString() : undefined,
        };

        Object.keys(fields_to_update).forEach(key => {
            const value = fields_to_update[key as keyof typeof fields_to_update];

            if (!isNaN(value as number) && key !== 'growthrate') {
                modifyValueInputs(key, value as number);
            } else if (typeof value === 'string') {
                modifyFieldDropdownValues(key, value);
            }
        });

        if (signal_extras) {
            try {
                applySignalExtras(strategy_dom, signal_extras);
            } catch (e) {
                // Never block the user: fall back to the plain template with the signal's settings.
                // eslint-disable-next-line no-console
                console.warn('Signal extras could not be applied, loading the plain strategy.', e);
            }
        }

        const { derivWorkspace: workspace } = Blockly;

        if (action === 'RUN') {
            workspace
                ?.waitForBlockEvent({
                    block_type: 'trade_definition',
                    event_type: window.Blockly.Events.BLOCK_CREATE,
                    timeout: 5000,
                })
                .then(() => {
                    this.root_store.run_panel.onRunButtonClick();
                });
        }

        this.setFormVisibility(false);

        await load({
            block_string: window.Blockly.Xml.domToText(strategy_dom),
            file_name: selected_strategy.label,
            workspace,
            from: save_types.UNSAVED,
            drop_event: null,
            strategy_id: null,
            showIncompatibleStrategyDialog: null,
        });
    };

    loadSignal = async (signal: TTickdeskSignal) => {
        const tradetype = SIGNAL_TRADE_TYPES[signal.contract];
        if (!tradetype) throw new Error(`Unsupported contract ${signal.contract}`);
        const has_prediction = tradetype === 'overunder' || tradetype === 'matchesdiffers';
        const is_directional = tradetype === 'risefall' || tradetype === 'runs' || tradetype === 'highlowticks' || tradetype === 'reset' || tradetype === 'endsinout' || tradetype === 'accumulator';

        // 1. Preferred: the full signal bot (every setting is a variable the user can edit).
        try {
            const { contracts_for } = ApiHelpers?.instance ?? {};
            const market = await contracts_for?.getMarketBySymbol(signal.symbol);
            const submarket = await contracts_for?.getSubmarketBySymbol(signal.symbol);
            if (market && submarket) {
                const xml = buildSignalBotXml({
                    market,
                    submarket,
                    symbol: signal.symbol,
                    tradetype: tradetype as TSignalBotOptions['tradetype'],
                    contract: signal.contract,
                    prediction: has_prediction || tradetype === 'highlowticks' ? Number(signal.barrier ?? 0) : null,
                    trigger: signal.trigger,
                    runs: signal.runs,
                    ticks: signal.ticks,
                    minutes: signal.minutes,
                    offset: signal.offset,
                    growth_rate: signal.growth_rate,
                    tick_count: signal.tick_count,
                    stake: 1,
                });
                this.setFormVisibility(false);
                const result = await load({
                    block_string: xml,
                    file_name: 'Tickdesk signal',
                    workspace: window.Blockly.derivWorkspace,
                    from: save_types.UNSAVED,
                    drop_event: null,
                    strategy_id: null,
                    showIncompatibleStrategyDialog: null,
                });
                if (!result?.error) return;
                // eslint-disable-next-line no-console
                console.warn('Signal bot was rejected by the builder, loading the simple bot instead.', result.error);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Signal bot could not be built, loading the simple bot instead.', e);
        }

        if (is_directional) throw new Error('This signal bot could not be loaded.');

        // 2. Fallback: Deriv's Martingale bot with the signal's settings (known to load).
        this.selected_strategy = 'MARTINGALE';
        const stake = Number(signal.stake) > 0 ? Number(signal.stake) : 1;
        await this.onSubmit(
            {
                symbol: signal.symbol,
                tradetype,
                type: signal.contract,
                durationtype: 't',
                duration: 1,
                stake,
                loss: Number(signal.sl) > 0 ? Number(signal.sl) : stake * 10,
                profit: Number(signal.tp) > 0 ? Number(signal.tp) : stake * 10,
                size: 1,
                unit: 1,
                last_digit_prediction: has_prediction ? Number(signal.barrier ?? 0) : 0,
                action: 'EDIT',
            } as unknown as TFormData,
            { trigger: signal.trigger, runs: signal.runs, has_prediction }
        );
    };

    // Free Bots page: load a ready-made bot file into the builder (the user taps Run).
    loadBotXml = async (xml: string, name = 'Free bot') => {
        this.setFormVisibility(false);
        const result = await load({
            block_string: xml,
            file_name: name,
            workspace: window.Blockly.derivWorkspace,
            from: save_types.UNSAVED,
            drop_event: null,
            strategy_id: null,
            showIncompatibleStrategyDialog: null,
        });
        if (result?.error) throw new Error(String(result.error));
    };

    toggleStopBotDialog = (): void => {
        this.is_contract_dialog_open = !this.is_contract_dialog_open;
        this.is_stop_bot_dialog_open = !this.is_stop_bot_dialog_open;
        this.setFormVisibility(false);
    };

    setOptionsLoading = (is_loading: boolean): void => {
        this.is_options_loading = is_loading;
    };
}
