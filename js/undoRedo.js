import { state } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';

const MAX_HISTORY = 50;

export const undoRedoState = {
    undoStack: [],
    redoStack: [],
    isSaving: false 
};

function createStateSnapshot() {
    return {
        blocks: JSON.parse(JSON.stringify(state.blocks)),
        rotations: JSON.parse(JSON.stringify(state.rotations)),
        orders: JSON.parse(JSON.stringify(state.orders)),
        nodeState: JSON.parse(JSON.stringify(state.nodeState)),
        lastRanElement: state.lastRanElement ? [...state.lastRanElement] : null,
        gateCells: state.gateCells ? JSON.parse(JSON.stringify(state.gateCells)) : {},
        stepNumber: state.stepNumber
    };
}
export function saveStateForUndo() {
    if (undoRedoState.isSaving) return;
    const currentState = createStateSnapshot();
    undoRedoState.undoStack.push(currentState);

    if (undoRedoState.undoStack.length > MAX_HISTORY) {
        undoRedoState.undoStack.shift(); 
    }
    undoRedoState.redoStack = [];
    updateUndoRedoButtons();
}

function restoreState(stateSnapshot) {
    undoRedoState.isSaving = true;
    state.blocks = stateSnapshot.blocks;
    state.rotations = stateSnapshot.rotations;
    state.orders = stateSnapshot.orders;
    state.nodeState = stateSnapshot.nodeState;
    state.lastRanElement = stateSnapshot.lastRanElement;
    state.gateCells = stateSnapshot.gateCells;
    state.stepNumber = stateSnapshot.stepNumber;
    updateSimContainer();
    undoRedoState.isSaving = false;
}

export function undo() {
    if (undoRedoState.undoStack.length === 0) return;
    const currentState = createStateSnapshot();
    undoRedoState.redoStack.push(currentState);
    const prevState = undoRedoState.undoStack.pop();
    restoreState(prevState);
    updateUndoRedoButtons();
}

export function redo() {
    if (undoRedoState.redoStack.length === 0) return;
    const currentState = createStateSnapshot();
    undoRedoState.undoStack.push(currentState);
    const nextState = undoRedoState.redoStack.pop();
    restoreState(nextState);
    updateUndoRedoButtons();
}

// Create the undo and redo buttons for the UI
export function createUndoRedoButtons() {
    const controlsSection = document.querySelector('.controls');
    
    const undoButton = document.createElement('button');
    undoButton.id = 'undo';
    undoButton.className = 'iconButton';
    undoButton.title = 'Undo (Ctrl+Z)';
    undoButton.innerHTML = '↩️'; 
    undoButton.addEventListener('click', undo);
    undoButton.disabled = true; 

    const redoButton = document.createElement('button');
    redoButton.id = 'redo';
    redoButton.className = 'iconButton';
    redoButton.title = 'Redo (Ctrl+Y)';
    redoButton.innerHTML = '↪️'; 
    redoButton.addEventListener('click', redo);
    redoButton.disabled = true; 

    const firstButton = controlsSection.querySelector('button');
    controlsSection.insertBefore(redoButton, firstButton);
    controlsSection.insertBefore(undoButton, firstButton);

    saveStateForUndo();
}

export function updateUndoRedoButtons() {
    const undoButton = document.getElementById('undo');
    const redoButton = document.getElementById('redo');
    
    if (undoButton) {
        undoButton.disabled = undoRedoState.undoStack.length === 0;
    }
    
    if (redoButton) {
        redoButton.disabled = undoRedoState.redoStack.length === 0;
    }
}

export function setupUndoRedoKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {

        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || 
            (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
            e.preventDefault();
            redo();
        }
    });
}