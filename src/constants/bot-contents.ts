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
    ANALYSIS: 2,
    SIGNALS: 3,
    DERIVSCOPE: 4,
    FREE_BOTS: 5,
    CHART: 6,
    TUTORIAL: 7,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = ['id-dbot-dashboard', 'id-bot-builder', 'id-analysis', 'id-signals', 'id-derivscope', 'id-free-bots', 'id-charts', 'id-tutorials'];

export const DEBOUNCE_INTERVAL_TIME = 500;
