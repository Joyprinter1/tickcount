import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

// Live Even/Odd read published by the Signals page (DerivScope). Returns text 'even', 'odd' or '' when there is no fresh signal.
window.Blockly.Blocks.signal_side = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Signal Side'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns even or odd as the Signals page currently reads it, or empty text if there is no clear read'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Signal Side'),
            description: localize(
                'This block gives you the Even/Odd read from the Signals page right now: "even" or "odd". It is empty when there is no clear read, when the Signals page is not open, or when its data is older than 20 seconds.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.signal_side = () => [
    'Bot.getSignalSide()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
