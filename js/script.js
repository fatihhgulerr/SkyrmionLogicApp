import { createGateLibraryUI } from './gateLibrary.js';
import { saveDesign, loadDesign, markUnsavedChanges, setupBeforeUnloadHandler } from './saveLoad.js';
import { 
    copySelectedCells, 
    pasteClipboard, 
    clearSelection, 
    rotateSelectedCells,
    setupArrowKeyNavigation
} from './selection.js';
import { state, BLOCKS } from './stateFactory.js';
import { initCustomCircuits } from './customCircuits.js';
import { 
    createUndoRedoButtons, 
    setupUndoRedoKeyboardShortcuts,
    saveStateForUndo
} from './undoRedo.js';
import {
    handleColInputChange, handleRowInputChange,
    updateSimContainer,
    handleAddColLeft,
    handleAddColRight,
    handleAddRowTop,
    handleAddRowBottom,
    handleDelCol,
    handleDelRow,
    handleRot,
    handleBlockButtonClick,
    handleOrderTextChange,
    handleStepClick,
    handleResetSimClick,
    handleImageTypeClick
} from './callBacks.js'
import { initPipeFeature, resetPipeMode } from './pipe.js';
import { initZoom } from './zoom.js';
import { initVerilogImport } from './verilogImport.js';

const addColLeft = document.querySelector('#addColLeft');
const addColRight = document.querySelector('#addColRight');
const addRowTop = document.querySelector('#addRowTop');
const addRowBottom = document.querySelector('#addRowBottom');
const delCol = document.querySelector('#delCol');
const delRow = document.querySelector('#delRow');
const rot = document.querySelector('#rot');
const order = document.querySelector('#order');
const step = document.querySelector('#step');
const resetSim = document.querySelector('#resetSim');
const imageType = document.querySelector('#imageType');

const saveDesignBtn = document.querySelector('#saveDesign');
const loadDesignBtn = document.querySelector('#loadDesign');

saveDesignBtn.addEventListener('click', () => {
    saveStateForUndo(); 
    saveDesign();
});
loadDesignBtn.addEventListener('click', () => {
    saveStateForUndo(); 
    loadDesign();
});

setupBeforeUnloadHandler();
initZoom();

// Create gate library UI and initialize custom circuits
createGateLibraryUI();
initCustomCircuits();
initPipeFeature();
initVerilogImport();

// Create undo/redo buttons and setup keyboard shortcuts
createUndoRedoButtons();
setupUndoRedoKeyboardShortcuts();

// Setup arrow key navigation
setupArrowKeyNavigation();

// Create a rotate selection button
const rotateSelectionBtn = document.createElement('button');
rotateSelectionBtn.id = 'rotateSelection';
rotateSelectionBtn.className = 'iconButton';
rotateSelectionBtn.title = 'Rotate Selected Cells (R)';
rotateSelectionBtn.innerHTML = '🔄'; 
rotateSelectionBtn.addEventListener('click', rotateSelectedCells);

// Add the rotate selection button after the regular rotate button
rot.parentNode.insertBefore(rotateSelectionBtn, rot.nextSibling);

//make a button for each element in BLOCKS
const blockButtons = document.querySelector('#blockButtons');
let blockKeys = Object.keys(BLOCKS);

for (let block of blockKeys) {
    const button = document.createElement('button');
    button.classList.add('blockButton');
    button.id = block;
    button.dataset.blockName = BLOCKS[block];
    const img = document.createElement('img');
    img.src = state.imageFolder + block + '.png';
    img.alt = block;
    button.appendChild(img);
    button.addEventListener('click', handleBlockButtonClick);
    blockButtons.appendChild(button);
}
console.log(state);

document.addEventListener('keydown', function(e) {
    console.log('Key pressed:', e.key, 'Modifiers:', e.metaKey, e.ctrlKey);
    
    // Skip if target is an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Copy: Cmd/Ctrl+C
    if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        console.log('Copy shortcut detected');
        e.preventDefault();
        copySelectedCells();
    }
    
    // Paste: Cmd/Ctrl+V
    if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
        console.log('Paste shortcut detected');
        e.preventDefault();
        if (state.focused[0] !== null && state.focused[1] !== null) {
            pasteClipboard(state.focused[0], state.focused[1]);
        } else {
            console.log('No focus cell to paste to');
        }
    }
    
    // Rotate selection: R key
    if (e.key === 'r' || e.key === 'R') {
        console.log('Rotate key detected');
        e.preventDefault();
        rotateSelectedCells();
    }
    
    // Clear selection and exit pipe mode on Escape
    if (e.key === 'Escape') {
        console.log('Escape key pressed, clearing selection and exiting pipe mode');
        clearSelection();
        resetPipeMode();
    }
});

addColLeft.addEventListener('click', handleAddColLeft);
addColRight.addEventListener('click', handleAddColRight);
addRowTop.addEventListener('click', handleAddRowTop);
addRowBottom.addEventListener('click', handleAddRowBottom);
delCol.addEventListener('click', handleDelCol);
delRow.addEventListener('click', handleDelRow);
rot.addEventListener('click', handleRot);
order.addEventListener('change', handleOrderTextChange);
step.addEventListener('click', handleStepClick);
resetSim.addEventListener('click', handleResetSimClick);
imageType.addEventListener('click', handleImageTypeClick);

// Initialize the UI
updateSimContainer();
