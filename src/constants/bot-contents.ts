type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    FREE_BOTS: 2,
    ANALYSIS: 3,
    SIGNALS: 4,
    DERIVSCOPE: 5,
    HEDGING: 6,
    COPY_TRADING: 7,
    CHART: 8,
    // Deriv's tutorials tab was removed; old links to it open the dashboard
    TUTORIAL: 0,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = ['id-dbot-dashboard', 'id-bot-builder', 'id-free-bots', 'id-analysis', 'id-signals', 'id-derivscope', 'id-hedging', 'id-copy-trading', 'id-charts'];

export const DEBOUNCE_INTERVAL_TIME = 500;
