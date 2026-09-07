import { ID_DELIMITER } from './stateFactory.js';
import { state } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';
import { markUnsavedChanges } from './saveLoad.js';
import { actionInsertRow, actionInsertCol } from './actions.js';
import { loadCustomCircuits, prepareCustomCircuitsForGateLibrary, deleteCustomCircuit } from './customCircuits.js';
import { blockLogic } from './blockLogic.js';

const GATES = {
    AND: {
        name: "AND Gate",
        width: 2,
        height: 3,
        layout: [
            [0, 0, "one", 0, 0],
            [0, 1, "notc", 0, 0],
            [1, 0, "zero", 0, 0],
            [1, 1, "notcf", 3, 0],
            [2, 0, "empty", 0, 0],
            [2, 1, "one", 1, 0]
        ],
        nodeState: [
            [0, 0], [0, 0, 0], [0, 0], [0, 0, 0], [0, 0], [0, 0, 0], [0, 0]
        ],
        highlightColor: "rgba(255, 0, 0, 0.3)"
    },
    
    OR: {
        name: "OR Gate",
        width: 2,
        height: 4,
        layout: [
            [0, 0, "empty", 0, 0],
            [0, 1, "one", 3, 0],
            [1, 0, "transfer", 0, 0],
            [1, 1, "notc", 3, 0],
            [2, 0, "transfer", 0, 0],
            [2, 1, "notc", 3, 0],
            [3, 0, "one", 0, 0],
            [3, 1, "notcf", 2, 0]
        ],
        nodeState: [
            [0, 0], [0, 0, 0], [0, 0], [0, 0, 0], [0, 0], [0, 0, 0], [0, 0], [0, 0, 0], [0, 0]
        ],
        highlightColor: "rgba(0, 0, 255, 0.3)"
    },
    
    NOR: {
        name: "NOR Gate",
        width: 3,
        height: 2,
        layout: [
            [0, 0, "one", 0, 0],
            [0, 1, "notc", 0, 0],
            [0, 2, "notc", 0, 0],
            [1, 0, "empty", 0, 0],
            [1, 1, "transfer", 1, 0],
            [1, 2, "transfer", 1, 0]
        ],
        nodeState: [
            [0, 0, 0], [0, 0, 0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 0, 0]
        ],
        highlightColor: "rgba(0, 128, 0, 0.3)"
    },
    
    XOR: {
        name: "XOR Gate",
        width: 5,
        height: 5,
        layout: [
            [0, 0, "transfer", 0, 0],
            [0, 1, "duplicator", 0, 0],
            [0, 2, "deflector", 0, 0],
            [0, 3, "empty", 0, 0],
            [0, 4, "empty", 0, 0],
            [1, 0, "transfer", 0, 0],
            [1, 1, "notcd", 3, 0],
            [1, 2, "notc", 2, 0],
            [1, 3, "deflector", 0, 0],
            [1, 4, "empty", 0, 0],
            [2, 0, "deflectorf", 1, 0],
            [2, 1, "notc", 2, 0],
            [2, 2, "transfer", 2, 0],
            [2, 3, "notc", 2, 0],
            [2, 4, "one", 2, 0],
            [3, 0, "deflectorf", 2, 0],
            [3, 1, "transfer", 0, 0],
            [3, 2, "notc", 0, 0],
            [3, 3, "transfer", 0, 0],
            [3, 4, "transfer", 0, 0],
            [4, 0, "empty", 0, 0],
            [4, 1, "empty", 0, 0],
            [4, 2, "one", 1, 0],
            [4, 3, "empty", 0, 0],
            [4, 4, "empty", 0, 0]
        ],
        nodeState: [
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0]
        ],
        highlightColor: "rgba(128, 0, 128, 0.3)"
    },
    
    XNOR: {
        name: "XNOR Gate",
        width: 5,
        height: 3,
        layout: [
            [0, 0, "transfer", 0, 0],
            [0, 1, "duplicator", 0, 0],
            [0, 2, "deflector", 0, 0],
            [0, 3, "empty", 0, 0],
            [0, 4, "empty", 0, 0],
            [1, 0, "transfer", 0, 0],
            [1, 1, "notcd", 3, 0],
            [1, 2, "notcf", 2, 0],
            [1, 3, "deflector", 0, 0],
            [1, 4, "empty", 0, 0],
            [2, 0, "transfer", 2, 0],
            [2, 1, "notc", 2, 0],
            [2, 2, "transfer", 2, 0],
            [2, 3, "notc", 2, 0],
            [2, 4, "one", 2, 0]
        ],
        nodeState: [
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0]
        ],
        highlightColor: "rgba(255, 165, 0, 0.3)"
    },
    
    NOT: {
        name: "NOT Gate",
        width: 1,
        height: 2,
        layout: [
            [0, 0, "notc", 0, 0],
            [1, 0, "one", 1, 0]
        ],
        nodeState: [
            [0], [0, 0], [0], [0, 0], [0]
        ],
        highlightColor: "rgba(255, 192, 203, 0.3)"
    }
};

export function getGateDefinition(gateType) {
    const gate = GATES[gateType];
    return gate ? JSON.parse(JSON.stringify(gate)) : null;
}

export function isPartOfGate(row, col) {
    if (!state.gateCells) return { isGateCell: false };
    
    for (const gateId in state.gateCells) {
        const gate = state.gateCells[gateId];
        
        if (gate.cells.some(cell => cell.initialRow === row && cell.initialCol === col)) {
            return {
                isGateCell: true,
                gateId: gateId,
                gateType: gate.type
            };
        }
    }
    
    return { isGateCell: false };
}

function getAllGates() {
    const allGates = { ...GATES };
    const customGates = prepareCustomCircuitsForGateLibrary();
    return { ...allGates, ...customGates };
}

export function createGateLibraryUI() {
    const gateLibraryButton = document.createElement('button');
    gateLibraryButton.id = 'gateLibrary';
    gateLibraryButton.textContent = 'Gate Library';
    gateLibraryButton.addEventListener('click', showGateLibrary);
    
    const controlsSection = document.querySelector('.controls');
    const geometryButton = document.querySelector('#imageType');
    controlsSection.insertBefore(gateLibraryButton, geometryButton.nextSibling);
}

function showGateLibrary() {
    const existingDialog = document.querySelector('#gateLibraryDialog');
    if (existingDialog) {
        existingDialog.remove();
    }
    
    const dialog = document.createElement('div');
    dialog.id = 'gateLibraryDialog';
    dialog.className = 'gate-library-dialog';
    
    const heading = document.createElement('h2');
    heading.textContent = 'Gate Library';
    dialog.appendChild(heading);
    
    for (const [gateKey, gate] of Object.entries(GATES)) {
        const gateButton = document.createElement('button');
        gateButton.className = 'gate-button';
        gateButton.textContent = gate.name;
        gateButton.dataset.gateKey = gateKey;
        gateButton.addEventListener('click', () => {
            selectGate(gateKey);
            dialog.remove();
        });
        dialog.appendChild(gateButton);
    }
    
    const customCircuits = loadCustomCircuits();
    if (Object.keys(customCircuits).length > 0) {
        const customSectionDiv = document.createElement('div');
        customSectionDiv.className = 'custom-circuits-section';
        
        const customHeading = document.createElement('h3');
        customHeading.className = 'custom-circuits-heading';
        customHeading.textContent = 'Custom Circuits';
        customSectionDiv.appendChild(customHeading);
        
        for (const [circuitKey, circuit] of Object.entries(customCircuits)) {
            const circuitContainer = document.createElement('div');
            circuitContainer.className = 'gate-button-container';
            
            const circuitButton = document.createElement('button');
            circuitButton.className = 'gate-button custom-gate-button';
            circuitButton.textContent = circuit.name;
            circuitButton.dataset.gateKey = circuitKey;
            circuitButton.addEventListener('click', () => {
                selectGate(circuitKey);
                dialog.remove();
            });
            
            const deleteButton = document.createElement('span');
            deleteButton.className = 'delete-circuit-btn';
            deleteButton.textContent = '×';
            deleteButton.title = 'Delete this custom circuit';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (deleteCustomCircuit(circuitKey)) {
                    circuitContainer.remove();
                    if (customSectionDiv.querySelectorAll('.gate-button-container').length === 0) {
                        customSectionDiv.remove();
                    }
                }
            });
            
            circuitContainer.appendChild(circuitButton);
            circuitContainer.appendChild(deleteButton);
            customSectionDiv.appendChild(circuitContainer);
        }
        
        dialog.appendChild(customSectionDiv);
    }
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => dialog.remove());
    dialog.appendChild(closeButton);
    
    document.body.appendChild(dialog);
}

let selectedGate = null;

function selectGate(gateKey) {
    const allGates = getAllGates();
    
    if (!allGates[gateKey]) {
        console.error(`Gate ${gateKey} not found`);
        return;
    }
    
    selectedGate = gateKey;
    document.body.classList.add('gate-selected');
    alert(`${allGates[gateKey].name} selected. Click on a cell to place it.`);
}

let gateIdCounter = 0;

export function placeGate(row, col) {
    if (!selectedGate) return false;
    
    const allGates = getAllGates();
    const gate = allGates[selectedGate];
    if (!gate) {
        console.error(`Gate ${selectedGate} not found when trying to place`);
        return false;
    }
    
    const gateId = `gate_${gateIdCounter++}`;
    const maxRow = row + gate.height - 1;
    const maxCol = col + gate.width - 1;
    const rowsToAdd = Math.max(0, maxRow - state.blocks.length + 1);
    const colsToAdd = Math.max(0, maxCol - state.blocks[0].length + 1);
    
    for (let i = 0; i < rowsToAdd; i++) {
        actionInsertRow(state.blocks.length);
    }
    
    for (let i = 0; i < colsToAdd; i++) {
        actionInsertCol(state.blocks[0].length);
    }
    
    const highlightColor = gate.highlightColor;
    
    for (const [gateRow, gateCol, blockType, rotation, order] of gate.layout) {
        const targetRow = row + gateRow;
        const targetCol = col + gateCol;
        
        state.blocks[targetRow][targetCol] = blockType;
        state.rotations[targetRow][targetCol] = rotation;
        state.orders[targetRow][targetCol] = order;
        
        if (!state.gateCells) {
            state.gateCells = {};
        }
        
        if (!state.gateCells[gateId]) {
            state.gateCells[gateId] = {
                type: selectedGate,
                color: highlightColor,
                cells: []
            };
        }
        
        state.gateCells[gateId].cells.push({
            blockType,
            initialRow: targetRow,
            initialCol: targetCol,
            originalBlockType: blockType,
            originalRotation: rotation
        });
    }
    
    if (gate.nodeState) {
        for (let i = 0; i < gate.height; i++) {
            for (let j = 0; j < gate.width; j++) {
                const baseRow = 2 * (row + i);
                const baseCol = j + col;
                
                if (gate.nodeState[2*i] && gate.nodeState[2*i][j] === 1) {
                    state.nodeState[baseRow][baseCol] = 1;
                }
                
                if (gate.nodeState[2*i+1] && gate.nodeState[2*i+1][j+1] === 1) {
                    state.nodeState[baseRow+1][baseCol+1] = 1;
                }
                
                if (gate.nodeState[2*i+2] && gate.nodeState[2*i+2][j] === 1) {
                    state.nodeState[baseRow+2][baseCol] = 1;
                }
                
                if (gate.nodeState[2*i+1] && gate.nodeState[2*i+1][j] === 1) {
                    state.nodeState[baseRow+1][baseCol] = 1;
                }
            }
        }
    }
    
    selectedGate = null;
    document.body.classList.remove('gate-selected');
    markUnsavedChanges();
    updateSimContainer();
    
    return true;
}

export function applyGateHighlights() {
    if (!state.gateCells) return;
    
    const allGates = getAllGates();
    
    Object.keys(state.gateCells).forEach(gateId => {
        const gate = state.gateCells[gateId];
        
        if (!gate.type || !allGates[gate.type]) {
            console.warn('Unknown gate type:', gate.type);
            return;
        }
        
        gate.cells.forEach(cell => {
            const cellSelector = `#${ID_DELIMITER}${cell.initialRow}${ID_DELIMITER}${cell.initialCol}`;
            const cellElement = document.querySelector(cellSelector);
            
            if (cellElement) {
                cellElement.classList.add('gate-cell');
                cellElement.classList.add(`gate-${gate.type}`);
                cellElement.style.backgroundColor = allGates[gate.type].highlightColor;
                cellElement.dataset.gateType = gate.type;
                cellElement.dataset.gateId = gateId;
                
                const currentBlockType = state.blocks[cell.initialRow][cell.initialCol];
                const currentRotation = state.rotations[cell.initialRow][cell.initialCol];
                
                if ((cell.originalBlockType && cell.originalBlockType !== currentBlockType) ||
                    (cell.originalRotation !== undefined && cell.originalRotation !== currentRotation)) {
                    cellElement.dataset.modified = "true";
                    cellElement.classList.add('gate-cell-modified');
                } else {
                    cellElement.dataset.modified = "false";
                    cellElement.classList.remove('gate-cell-modified');
                }
            }
        });
    });
}

export function updateGateCellPositions(action, index) {
    if (!state.gateCells) return;
    
    Object.keys(state.gateCells).forEach(gateId => {
        const gate = state.gateCells[gateId];
        
        gate.cells.forEach(cell => {
            switch (action) {
                case 'insertCol':
                    if (cell.initialCol >= index) {
                        cell.initialCol += 1;
                    }
                    break;
                    
                case 'insertRow':
                    if (cell.initialRow >= index) {
                        cell.initialRow += 1;
                    }
                    break;
                    
                case 'deleteCol':
                    if (cell.initialCol === index) {
                        cell.deleted = true;
                    }
                    else if (cell.initialCol > index) {
                        cell.initialCol -= 1;
                    }
                    break;
                    
                case 'deleteRow':
                    if (cell.initialRow === index) {
                        cell.deleted = true;
                    }
                    else if (cell.initialRow > index) {
                        cell.initialRow -= 1;
                    }
                    break;
            }
        });
        
        gate.cells = gate.cells.filter(cell => !cell.deleted);
        
        if (gate.cells.length === 0) {
            delete state.gateCells[gateId];
        }
    });
}
