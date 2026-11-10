import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

// Live digit published by the Signals page (DerivScope). Returns -1 when there is no fresh signal.
window.Blockly.Blocks.signal_search = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Signal Search Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the search digit (the most frequent digit) of the Matches gap strategy, or -1 if it is not live'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Signal Search Digit'),
            description: localize(
                'This block gives you the search digit of the Matches gap strategy: the most frequent recent digit that the bot waits for before it trades. It returns -1 when DerivScope is not open or its data is older than 20 seconds.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.signal_search = () => [
    'Bot.getSignalSearch()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
