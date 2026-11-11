// The Signals page stores its current digit in the browser; only a fresh value (under 20 s old) counts.
// When the board also lists the greyed digits (`digits`), the live last digit counts if it is any of them.
export const getSignalDigit = (now = Date.now(), storage = globalThis.localStorage, last = undefined) => {
    try {
        const s = JSON.parse(storage.getItem('td.signal') || 'null');
        const d = Number(s?.digit);
        if (!(Number.isInteger(d) && d >= 0 && d <= 9 && now - Number(s?.at) < 20000)) return -1;
        const list = Array.isArray(s?.digits) ? s.digits.map(Number) : [];
        return Number.isInteger(last) && list.includes(last) ? last : d;
    } catch (e) {
        return -1;
    }
};

// Matches gap strategy: the search digit (most frequent digit) is stored next to the trade digit; falls back to the digit.
export const getSignalSearch = (now = Date.now(), storage = globalThis.localStorage) => {
    try {
        const s = JSON.parse(storage.getItem('td.signal') || 'null');
        const trade = Number(s?.digit);
        const d = s?.search === undefined || s?.search === null ? trade : Number(s.search);
        return Number.isInteger(trade) && trade >= 0 && Number.isInteger(d) && d >= 0 && d <= 9 && now - Number(s?.at) < 20000 ? d : -1;
    } catch (e) {
        return -1;
    }
};

// The Signals page also stores its Even/Odd read ('EVEN' / 'ODD' / '' when there is no clear read); fresh under 20 s only.
export const getSignalSide = (now = Date.now(), storage = globalThis.localStorage) => {
    try {
        const s = JSON.parse(storage.getItem('td.signalEO') || 'null');
        const side = String(s?.side || '').toUpperCase();
        return (side === 'EVEN' || side === 'ODD') && now - Number(s?.at) < 20000 ? side.toLowerCase() : '';
    } catch (e) {
        return '';
    }
};

const getTicksInterface = tradeEngine => {
    return {
        getDelayTickValue: (...args) => tradeEngine.getDelayTickValue(...args),
        getCurrentStat: (...args) => tradeEngine.getCurrentStat(...args),
        getStatList: (...args) => tradeEngine.getStatList(...args),
        getLastTick: (...args) => tradeEngine.getLastTick(...args),
        getLastDigit: (...args) => tradeEngine.getLastDigit(...args),
        getSignalDigit: () =>
            Promise.resolve(tradeEngine.getLastDigit()).then(last => {
                const d = getSignalDigit(Date.now(), globalThis.localStorage, Number(last));
                // remember a hit so the purchase buys Matches on exactly this digit
                if (d >= 0 && d === Number(last)) globalThis.__tdMatch = { d, at: Date.now() };
                return d;
            }),
        getSignalSide: () => Promise.resolve(getSignalSide()),
        getSignalSearch: () => Promise.resolve(getSignalSearch()),
        getTicks: (...args) => tradeEngine.getTicks(...args),
        checkDirection: (...args) => tradeEngine.checkDirection(...args),
        getOhlcFromEnd: (...args) => tradeEngine.getOhlcFromEnd(...args),
        getOhlc: (...args) => tradeEngine.getOhlc(...args),
        getLastDigitList: (...args) => tradeEngine.getLastDigitList(...args),
    };
};

export default getTicksInterface;
