// The Signals page stores its current digit in the browser; only a fresh value (under 20 s old) counts.
export const getSignalDigit = (now = Date.now(), storage = globalThis.localStorage) => {
    try {
        const s = JSON.parse(storage.getItem('td.signal') || 'null');
        const d = Number(s?.digit);
        return Number.isInteger(d) && d >= 0 && d <= 9 && now - Number(s?.at) < 20000 ? d : -1;
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
        getSignalDigit: () => Promise.resolve(getSignalDigit()),
        getSignalSide: () => Promise.resolve(getSignalSide()),
        getTicks: (...args) => tradeEngine.getTicks(...args),
        checkDirection: (...args) => tradeEngine.checkDirection(...args),
        getOhlcFromEnd: (...args) => tradeEngine.getOhlcFromEnd(...args),
        getOhlc: (...args) => tradeEngine.getOhlc(...args),
        getLastDigitList: (...args) => tradeEngine.getLastDigitList(...args),
    };
};

export default getTicksInterface;
