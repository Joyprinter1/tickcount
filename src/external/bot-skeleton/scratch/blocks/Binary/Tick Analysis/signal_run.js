import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

// Live tick direction published by the Signals page (DerivScope). Returns 0 when there is no fresh streak.
window.Blockly.Blocks.signal_run = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Signal Run'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns 1 when the Signals page sees an up streak, -1 for a down streak, 0 when there is no live streak'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Signal Run'),
            description: localize(
                'This block tells you what the Signals page sees in the tick movement right now: 1 for consecutive ups, -1 for consecutive downs, 0 when there is no streak. It returns 0 when the Signals page is not open or its data is older than 20 seconds.'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.signal_run = () => [
    'Bot.getSignalRun()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
