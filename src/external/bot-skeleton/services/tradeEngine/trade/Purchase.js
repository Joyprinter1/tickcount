import { LogTypes } from '../../../constants/messages';
import { api_base } from '../../api/api-base';
import { contractStatus, info, log } from '../utils/broadcast';
import { doUntilDone, getUUID, recoverFromError, tradeOptionToBuy } from '../utils/helpers';
import { purchaseSuccessful } from './state/actions';
import { BEFORE_PURCHASE } from './state/constants';
import { getSignalDigit } from '../Interface/TicksInterface';

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
            this.legIds = [];
            this.legData = {};
            this.legsPendingBuys = 0;

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
                            parameters: tradeOptionToBuy(contract_type, this.withLiveDigit(contract_type, this.tradeOptions)).parameters,
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
                this.buyTripleLegs(contract_type);
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
            const trade_option = tradeOptionToBuy(contract_type, this.withLiveDigit(contract_type, this.tradeOptions));
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
        // Live Matches bots (variable "LIVE|SIGNAL"): the trade options are fixed when the run starts, so the digit to
        // match is read from the live signal at the moment of purchase instead of the fixed Prediction.
        withLiveDigit(contract_type, options) {
            try {
                if (contract_type !== 'DIGITMATCH') return options;
                const ws = typeof window !== 'undefined' && window.Blockly?.derivWorkspace;
                const vars = ws && ws.getAllVariables ? ws.getAllVariables() : [];
                const names = vars.map(v => String(v.name ?? (v.getName ? v.getName() : '')));
                const live = names.includes('LIVE|SIGNAL');
                if (live && names.includes('LIVE|TRIPLE')) {
                    const list = this.getBoardDigits();
                    if (list.length > 1) return { ...options, prediction: list[0] };
                }
                const m = globalThis.__tdMatch;
                globalThis.__tdMatch = undefined;
                const d = live ? (m && Date.now() - m.at < 5000 ? m.d : getSignalDigit()) : -1;
                return d >= 0 ? { ...options, prediction: d } : options;
            } catch (e) {
                return options;
            }
        }
        // The digits on the live board: main digit first, then the greyed ones.
        getBoardDigits() {
            try {
                const s = JSON.parse(globalThis.localStorage.getItem('td.signal') || 'null');
                if (!(Date.now() - Number(s?.at) < 20000)) return [];
                const list = [Number(s.digit), ...(Array.isArray(s.digits) ? s.digits.map(Number) : [])];
                return list.filter((d, i) => Number.isInteger(d) && d >= 0 && d <= 9 && list.indexOf(d) === i);
            } catch (e) {
                return [];
            }
        }

        // "All 3 at once" Matches: next to the main contract (main digit) buy Match on the two greyed digits.
        buyTripleLegs(contract_type) {
            try {
                if (contract_type !== 'DIGITMATCH') return;
                const ws = typeof window !== 'undefined' && window.Blockly?.derivWorkspace;
                const vars = ws && ws.getAllVariables ? ws.getAllVariables() : [];
                if (!vars.some(v => String(v.name ?? (v.getName ? v.getName() : '')) === 'LIVE|TRIPLE')) return;
                const extra = this.getBoardDigits().slice(1, 3);
                this.legsPendingBuys = extra.length;
                extra.forEach(digit => {
                    const request = tradeOptionToBuy('DIGITMATCH', { ...this.tradeOptions, prediction: digit });
                    doUntilDone(() => api_base.api.send(request))
                        .then(response => {
                            const id = response?.buy?.contract_id;
                            this.legsPendingBuys -= 1;
                            if (id) {
                                this.legIds.push(id);
                                api_base.api.send({ proposal_open_contract: 1, contract_id: id });
                            } else {
                                this.flushLegs();
                            }
                        })
                        .catch(() => {
                            this.legsPendingBuys -= 1;
                            this.flushLegs();
                        });
                });
            } catch (e) {
                this.legsPendingBuys = 0;
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
