import { getRoundedNumber } from '@/components/shared';
import { api_base } from '../../api/api-base';
import { contract as broadcastContract, contractStatus } from '../utils/broadcast';
import { openContractReceived, sell } from './state/actions';

export default Engine =>
    class OpenContract extends Engine {
        observeOpenContract() {
            if (!api_base.api) return;
            const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;

                    // Tickdesk hedging: the second leg is bought next to the main contract (see Purchase.js).
                    const hid = this.hedgeContractId;
                    if (hid && hid !== 'pending' && contract?.contract_id === hid) {
                        this.hedgeData = contract;
                        if (contract.is_sold) this.flushHedge();
                        return;
                    }

                    if (!contract || !this.expectedContractId(contract?.contract_id)) {
                        return;
                    }

                    // Wait until both legs of a hedge have finished, then report them as one trade.
                    if (contract.is_sold && this.hedgeContractId && !this.hedgeData?.is_sold) {
                        this.hedgeWaiting = contract;
                        clearTimeout(this.hedgePoll);
                        this.hedgePoll = setTimeout(() => {
                            if (!this.hedgeWaiting) return;
                            if (this.hedgeContractId && this.hedgeContractId !== 'pending') {
                                api_base.api.send({ proposal_open_contract: 1, contract_id: this.hedgeContractId });
                            }
                            this.hedgePoll = setTimeout(() => {
                                this.hedgeContractId = '';
                                this.flushHedge();
                            }, 20000);
                        }, 8000);
                        return;
                    }

                    this.processOpenContract(contract);
                }
            });
            api_base.pushSubscription(subscription);
        }

        flushHedge() {
            const waiting = this.hedgeWaiting;
            if (!waiting) return;
            this.hedgeWaiting = null;
            clearTimeout(this.hedgePoll);
            this.processOpenContract(waiting);
        }

        mergeHedge(contract) {
            const h = this.hedgeData;
            if (!this.hedgeContractId || !h || !h.is_sold) return contract;
            const add = key => (Number(contract[key]) || 0) + (Number(h[key]) || 0);
            return {
                ...contract,
                buy_price: add('buy_price'),
                sell_price: add('sell_price'),
                bid_price: add('bid_price'),
                payout: add('payout'),
                profit: Math.round(add('profit') * 100) / 100,
            };
        }

        processOpenContract(raw) {
            const contract = this.mergeHedge(raw);
            this.setContractFlags(contract);

            this.data.contract = contract;

            broadcastContract({ accountID: api_base.account_info.loginid, ...contract });

            if (this.isSold) {
                this.contractId = '';
                this.hedgeContractId = '';
                this.hedgeData = null;
                clearTimeout(this.transaction_recovery_timeout);
                this.updateTotals(contract);
                contractStatus({
                    id: 'contract.sold',
                    data: contract.transaction_ids.sell,
                    contract,
                });

                if (this.afterPromise) {
                    this.afterPromise();
                }

                this.store.dispatch(sell());
            } else {
                this.store.dispatch(openContractReceived());
            }
        }

        waitForAfter() {
            return new Promise(resolve => {
                this.afterPromise = resolve;
            });
        }

        setContractFlags(contract) {
            const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

            this.isSold = Boolean(is_sold);
            this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
            this.isExpired = Boolean(is_expired);
            this.hasEntryTick = Boolean(entry_tick);
        }

        expectedContractId(contractId) {
            return this.contractId && contractId === this.contractId;
        }

        getSellPrice() {
            const { bid_price: bidPrice, buy_price: buyPrice, currency } = this.data.contract;
            return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
        }
    };
