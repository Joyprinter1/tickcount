import React from 'react';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { reloadPage } from '@/utils/navigation-utils';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import { Localize, localize } from '@deriv-com/translations';
import Dialog from './shared_ui/dialog';

const BotStopped = observer(() => {
    const { dashboard, run_panel } = useStore();
    const { is_web_socket_intialised } = dashboard;
    // Closing the message must not reload the page: a reload wipes the Journal and Transactions you want to read.
    const [is_hidden, setIsHidden] = React.useState(false);
    React.useEffect(() => {
        if (is_web_socket_intialised) setIsHidden(false);
    }, [is_web_socket_intialised]);
    const showJournal = () => {
        setIsHidden(true);
        run_panel.setActiveTabIndex(2);
        run_panel.toggleDrawer(true);
    };
    const onClickClose = () => setIsHidden(true);
    return (
        <Dialog
            is_visible={!is_web_socket_intialised && !is_hidden}
            is_mobile_full_width
            className={'dc-dialog bot-stopped-dialog'}
            cancel_button_text={localize('View Journal')}
            confirm_button_text={localize('Back to Bot')}
            onCancel={showJournal}
            onConfirm={reloadPage}
            login={() => {}} // Empty function as login is not needed for this dialog
        >
            <div className='dc-dialog__content__header'>
                <Text data-testid='data-title' weight='bold' as='p' align='left' size='s' color='prominent'>
                    <Localize i18n_default_text="You're back online" />
                </Text>
                <div
                    data-testid='data-close-button'
                    onClick={onClickClose}
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            onClickClose();
                        }
                    }}
                    tabIndex={0}
                >
                    <LegacyClose1pxIcon height='20px' width='20px' fill='var(--text-general)' />
                </div>
            </div>
            <Text as='p' align='left' size='xs' color='prominent'>
                <Localize i18n_default_text='The bot has stopped, but your trade may still be running. Tap View Journal to read what happened (nothing is cleared). Back to Bot refreshes the page and clears the Journal.' />
            </Text>
        </Dialog>
    );
});

export default BotStopped;
