import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

// Live digit published by the Signals page (DerivScope). Returns -1 when there is no fresh signal.
window.Blockly.Blocks.signal_digit = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Signal Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the digit the Signals page is currently recommending, or -1 if it is not live'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Signal Digit'),
            description: localize(
                'This block gives you the digit that the Signals page is recommending right now (the most frequent recent digit). It returns -1 when the Signals page is not open or its data is older than 20 seconds.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.signal_digit = () => [
    'Bot.getSignalDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
