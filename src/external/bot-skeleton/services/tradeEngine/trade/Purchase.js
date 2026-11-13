import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';
import { getSignalDigit, isScanBot } from '../Interface/TicksInterface';

let delayIndex = 0;
let purchase_reference;

export default Engine =>
    class Purchase extends Engine {
        purchase(contract_type) {
            // Prevent calling purchase twice
            if (this.store.getState().scope !== BEFORE_PURCHASE) {
                return Promise.resolve();
            }

            this.hedgeContractId = '';
            this.hedgeData = null;
            this.hedgeWaiting = null;

            // Market rotation / recovery contract (variables "ROTATE|..." and "RECOVER|..."), see getSwitch.
            let trade_options = this.tradeOptions;
            if (!this.is_proposal_subscription_required) {
                const sw = this.getSwitch(contract_type, this.tradeOptions);
                if (sw) {
                    contract_type = sw.type;
                    trade_options = sw.options;
                }
            }

            const onSuccess = response => {
                // Don't unnecessarily send a forget request for a purchased contract.
                const { buy } = response;

                contractStatus({
                    id: 'contract.purchase_received',
                    data: buy.transaction_id,
                    buy,
                });

                this.contractId = buy.contract_id;
                this.store.dispatch(purchaseSuccessful());

                // Copy trading (owner only, see utils/copy-broadcast): never allowed to affect the bot.
                try {
                    if (typeof window !== 'undefined' && window.__tickdeskCopy) {
                        window.__tickdeskCopy({
                            parameters: tradeOptionToBuy(contract_type, this.withLiveDigit(contract_type, trade_options)).parameters,
                            isVirtual: /^VR/i.test(String(this.accountInfo?.loginid ?? '')),
                            masterContractId: buy.contract_id,
                        });
                    }
                } catch (e) {
                    // ignore
                }

                if (this.is_proposal_subscription_required) {
                    this.renewProposalsOnPurchase();
                }

                delayIndex = 0;
                this.buyHedgeLeg();
                log(LogTypes.PURCHASE, { transaction_id: buy.transaction_id });
                info({
                    accountID: this.accountInfo.loginid,
                    totalRuns: this.updateAndReturnTotalRuns(),
                    transaction_ids: { buy: buy.transaction_id },
                    contract_type,
                    buy_price: buy.buy_price,
                });
            };

            if (this.is_proposal_subscription_required) {
                const { id, askPrice } = this.selectProposal(contract_type);

                const action = () => api_base.api.send({ buy: id, price: askPrice });

                this.isSold = false;

                contractStatus({
                    id: 'contract.purchase_sent',
                    data: askPrice,
                });

                if (!this.options.timeMachineEnabled) {
                    return doUntilDone(action).then(onSuccess);
                }

                return recoverFromError(
                    action,
                    (errorCode, makeDelay) => {
                        // if disconnected no need to resubscription (handled by live-api)
                        if (errorCode !== 'DisconnectError') {
                            this.renewProposalsOnPurchase();
                        } else {
                            this.clearProposals();
                        }

                        const unsubscribe = this.store.subscribe(() => {
                            const { scope, proposalsReady } = this.store.getState();
                            if (scope === BEFORE_PURCHASE && proposalsReady) {
                                makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                                unsubscribe();
                            }
                        });
                    },
                    ['PriceMoved', 'InvalidContractProposal'],
                    delayIndex++
                ).then(onSuccess);
            }
            const trade_option = tradeOptionToBuy(contract_type, this.withLiveDigit(contract_type, trade_options));
            const action = () => api_base.api.send(trade_option);

            this.isSold = false;

            contractStatus({
                id: 'contract.purchase_sent',
                data: this.tradeOptions.amount,
            });

            if (!this.options.timeMachineEnabled) {
                return doUntilDone(action).then(onSuccess);
            }

            return recoverFromError(
                action,
                (errorCode, makeDelay) => {
                    if (errorCode === 'DisconnectError') {
                        this.clearProposals();
                    }
                    const unsubscribe = this.store.subscribe(() => {
                        const { scope } = this.store.getState();
                        if (scope === BEFORE_PURCHASE) {
                            makeDelay().then(() => this.observer.emit('REVERT', 'before'));
                            unsubscribe();
                        }
                    });
                },
                ['PriceMoved', 'InvalidContractProposal'],
                delayIndex++
            ).then(onSuccess);
        }
        // Rotating / recovery bots. Variable "ROTATE|SYM1,SYM2,..." makes every purchase use the next market in the list;
        // variable "RECOVER|DIGITEVEN,DIGITODD" makes the purchase after a lost trade use the next contract in that list (no barrier).
        // Both are applied here, at purchase time, by buying with a fresh request (no proposal needed).
        getSwitch(contract_type, options) {
            try {
                const ws = typeof window !== 'undefined' && window.Blockly?.derivWorkspace;
                const vars = ws && ws.getAllVariables ? ws.getAllVariables() : [];
                let rotate = null;
                let recover = null;
                for (const v of vars) {
                    const name = String(v.name ?? (v.getName ? v.getName() : ''));
                    if (name.startsWith('ROTATE|')) rotate = name.slice(7).split(',').filter(x => /^[A-Za-z0-9_]+$/.test(x));
                    if (name.startsWith('RECOVER|')) recover = name.slice(8).split(',').filter(x => /^[A-Z]+$/.test(x));
                }
                if (!(rotate && rotate.length) && !(recover && recover.length)) return null;
                const st = (this.switchState = this.switchState || { i: 0, loss: false, rec: 0 });
                const next = { ...options };
                let type = contract_type;
                if (rotate && rotate.length) next.symbol = rotate[st.i++ % rotate.length];
                if (!st.loss) st.rec = 0;
                if (recover && recover.length && st.loss) {
                    // consecutive losses walk through the list: e.g. DIGITEVEN, then DIGITODD, then DIGITEVEN...
                    type = recover[st.rec++ % recover.length];
                    delete next.prediction;
                    delete next.barrierOffset;
                }
                return { type, options: next };
            } catch (e) {
                return null;
            }
        }

        // Live Matches bots (variable "LIVE|SIGNAL"): the trade options are fixed when the run starts, so the digit to
        // match is read from the live signal at the moment of purchase instead of the fixed Prediction.
        withLiveDigit(contract_type, options) {
            try {
                if (contract_type !== 'DIGITMATCH') return options;
                const ws = typeof window !== 'undefined' && window.Blockly?.derivWorkspace;
                const vars = ws && ws.getAllVariables ? ws.getAllVariables() : [];
                const live = vars.some(v => String(v.name ?? (v.getName ? v.getName() : '')) === 'LIVE|SIGNAL');
                const m = globalThis.__tdMatch;
                globalThis.__tdMatch = undefined;
                const d = live ? (m && Date.now() - m.at < 5000 ? m.d : getSignalDigit(Date.now(), globalThis.localStorage, undefined, isScanBot() ? 'sc.signal' : 'td.signal')) : -1;
                return d >= 0 ? { ...options, prediction: d } : options;
            } catch (e) {
                return options;
            }
        }
        // Tickdesk hedging: a bot variable named "HEDGE|TYPE|digit|barrier|barrier2" asks for a second contract
        // of the same market and duration to be bought together with the main one.
        getHedgeSpec() {
            try {
                const ws = typeof window !== 'undefined' && window.Blockly?.derivWorkspace;
                const vars = ws && ws.getAllVariables ? ws.getAllVariables() : [];
                for (const v of vars) {
                    const name = String(v.name ?? (v.getName ? v.getName() : ''));
                    if (!name.startsWith('HEDGE|')) continue;
                    const [, type, digit, b1, b2] = name.split('|');
                    if (!/^[A-Z]+$/.test(type || '')) return null;
                    return {
                        type,
                        prediction: digit !== undefined && digit !== '' ? Number(digit) : undefined,
                        b1: b1 || undefined,
                        b2: b2 || undefined,
                    };
                }
            } catch (e) {
                // ignore
            }
            return null;
        }

        buyHedgeLeg() {
            const spec = this.getHedgeSpec();
            if (!spec) return;
            this.hedgeContractId = 'pending';
            const options = { ...this.tradeOptions };
            if (spec.prediction !== undefined) options.prediction = spec.prediction;
            if (spec.b1) options.barrierOffset = spec.b1;
            if (spec.b2) options.secondBarrierOffset = spec.b2;
            const request = tradeOptionToBuy(spec.type, options);
            doUntilDone(() => api_base.api.send(request))
                .then(response => {
                    const id = response?.buy?.contract_id;
                    this.hedgeContractId = id || '';
                    if (id) {
                        api_base.api.send({ proposal_open_contract: 1, contract_id: id });
                    } else {
                        this.flushHedge();
                    }
                })
                .catch(() => {
                    this.hedgeContractId = '';
                    this.flushHedge();
                });
        }

        getPurchaseReference = () => purchase_reference;
        regeneratePurchaseReference = () => {
            purchase_reference = getUUID();
        };
    };
