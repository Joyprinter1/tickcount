// @ts-nocheck — uses the vendored dashboard stores
import React from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import DashboardBotList from './bot-list/dashboard-bot-list';
import './home.scss';

const QUOTES = [
    'Believe you can and you’re halfway there.',
    'Discipline beats excitement every time.',
    'Small, steady stakes keep you in the game.',
    'Plan the trade, then trade the plan.',
    'Protect your balance first. Profit follows.',
    'Patience is also a position.',
    'A good stop loss is a good night’s sleep.',
];

const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
};

const I = {
    signals: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <path d='M3 17l5-6 4 3 5-7 4 5' />
            <path d='M3 21h18' />
        </svg>
    ),
    upload: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <path d='M12 16V4' />
            <path d='M7 9l5-5 5 5' />
            <path d='M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4' />
        </svg>
    ),
    free: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <rect x='5' y='8' width='14' height='11' rx='3' />
            <path d='M12 8V4' />
            <circle cx='12' cy='3.5' r='1' />
            <circle cx='9.5' cy='13' r='1.1' />
            <circle cx='14.5' cy='13' r='1.1' />
            <path d='M3 12v3M21 12v3' />
        </svg>
    ),
    quick: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <rect x='3' y='3' width='8' height='6' rx='1.5' />
            <rect x='13' y='15' width='8' height='6' rx='1.5' />
            <path d='M7 9v4a2 2 0 002 2h4' />
        </svg>
    ),
    hedge: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <path d='M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z' />
            <path d='M9 12l2 2 4-4' />
        </svg>
    ),
    copy: (
        <svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <rect x='8' y='8' width='12' height='12' rx='2' />
            <path d='M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2' />
        </svg>
    ),
};

const HomeCards = observer(() => {
    const { dashboard, load_modal, quick_strategy } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { setActiveTab } = dashboard;
    const { setFormVisibility } = quick_strategy;
    const { isDesktop } = useDevice();
    const quote = QUOTES[new Date().getDate() % QUOTES.length];

    const tiles = [
        {
            id: 'signals',
            tone: 'gold',
            icon: I.signals,
            title: 'Signals',
            text: 'Live scanners and trade-now robots',
            cta: 'Open DerivScope',
            go: () => setActiveTab(DBOT_TABS.DERIVSCOPE),
        },
        {
            id: 'upload',
            tone: 'blue',
            icon: I.upload,
            title: 'Upload Bot',
            text: 'Import an XML bot from your device',
            cta: 'Import XML',
            go: () => {
                toggleLoadModal();
                setActiveTabIndex(isDesktop ? 1 : 0);
                setActiveTab(DBOT_TABS.BOT_BUILDER);
            },
        },
        {
            id: 'free',
            tone: 'green',
            icon: I.free,
            title: 'Free Bots',
            text: 'Browse ready-made trading strategies',
            cta: 'Browse bots',
            go: () => setActiveTab(DBOT_TABS.FREE_BOTS),
        },
        {
            id: 'quick',
            tone: 'purple',
            icon: I.quick,
            title: 'Quick Bot Builder',
            text: 'Create a bot with custom trade settings',
            cta: 'Start building',
            go: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                setFormVisibility(true);
            },
        },
        {
            id: 'hedge',
            tone: 'cyan',
            icon: I.hedge,
            title: 'Hedging',
            text: 'Two-sided trades from one signal',
            cta: 'Open hedging',
            go: () => setActiveTab(DBOT_TABS.HEDGING),
        },
        {
            id: 'copy',
            tone: 'rose',
            icon: I.copy,
            title: 'Copy Trading',
            text: 'Follow or share trades automatically',
            cta: 'Open copy trading',
            go: () => setActiveTab(DBOT_TABS.COPY_TRADING),
        },
    ];

    return (
        <div className='td-home'>
            <header className='td-home__hello'>
                <h2>{greeting()}</h2>
                <p>&ldquo;{quote}&rdquo;</p>
            </header>
            <div className='td-home__divider'>
                <span>QUICK ACTIONS</span>
            </div>
            <div className='td-home__grid'>
                {tiles.map(t => (
                    <button key={t.id} type='button' className={`td-tile td-tile--${t.tone}`} onClick={t.go}>
                        <span className='td-tile__icon'>{t.icon}</span>
                        <strong>{t.title}</strong>
                        <span className='td-tile__text'>{t.text}</span>
                        <span className='td-tile__cta'>
                            {t.cta}
                            <b aria-hidden='true'>{'↗'}</b>
                        </span>
                    </button>
                ))}
            </div>
            <div className='td-home__list'>
                <DashboardBotList />
            </div>
        </div>
    );
});

export default HomeCards;
