import { placeGate, applyGateHighlights, isPartOfGate } from './gateLibrary.js';
import { toggleCellSelection, clearSelection, copySelectedCells, pasteClipboard, rotateSelectedCells } from './selection.js';
import { IMAGE_SIZE, ID_DELIMITER, NODE_ID_DELIMITER, NODE_RATIO } from "./stateFactory.js";
import { state } from "./stateFactory.js";
import { saveStateForUndo } from './undoRedo.js';
import {
    actionFocusedNumbers, actionAddRot,
    actionInsertCol, actionInsertRow,
    actionDelCol, actionDelRow,
    actionToggleNode, actionSetNode,
    actionSetOrder,
    actionStep,
    actionResetSim,
    actionToggleImageType
} from "./actions.js";
import { handlePipeCellClick } from './pipe.js';

const container = document.querySelector('.simContainer');
const orderText = document.querySelector('#order');
let row = null;
let col = null;

export function handleRowInputChange(e) {
    console.log(e.target.value);
    state.rows = Number(e.target.value);
    printState(state);
}

export function handleColInputChange(e) {
    console.log(e.target.value);
    state.cols = Number(e.target.value);
    printState(state);
}

export function printState() {
    console.log(state);
}

export function makeBlockDivs() {
    let blockElementList = [];
    for (var row in state.blocks) {
        for (var column in state.blocks[row]) {
            const blockName = state.blocks[row][column];
            const blockRot = state.rotations[row][column];
            const blockDiv = document.createElement('div');
            blockDiv.classList.add('block');
            blockDiv.addEventListener('click', handleBlockClick);
            const blockImage = document.createElement('img');
            blockImage.src = `${state.imageFolder}${blockName}.png`;
            blockImage.style.transform = `rotate(${-90 * blockRot}deg)`
            const blockOrder = document.createElement('div');
            blockOrder.innerText = state.orders[row][column];
            blockOrder.classList.add('order');
            blockDiv.appendChild(blockImage);
            blockDiv.appendChild(blockOrder);
            blockDiv.style.width = `${IMAGE_SIZE}px`;
            blockDiv.style.height = `${IMAGE_SIZE}px`;
            blockElementList.push(blockDiv);
        }
    }
    return blockElementList;
}

export function stripElement(element) {
    let e = element.firstChild
    while (element.firstChild) {
        e.remove();
        e = element.firstChild;
    }
}

export function updateSimContainer() {
    stripElement(container);
    const colNo = state.blocks[0].length
    container.style.gridTemplateColumns = `repeat(${colNo}, 1fr)`;
    container.style.width = `${IMAGE_SIZE * colNo}px`
    const blockElementList = makeBlockDivs();
    blockElementList.forEach((block, index) => {
        const rowInd = Math.floor(index / colNo);
        const colInd = index % colNo;
        block.id = `${ID_DELIMITER}${rowInd}${ID_DELIMITER}${colInd}`;
        
        if (rowInd == state.focused[0] && colInd == state.focused[1])
            block.classList.add('focused');
            
        if (state.lastRanElement && (rowInd == state.lastRanElement[0] && colInd == state.lastRanElement[1]))
            block.classList.add('ran');
            
        if (state.selection && state.selection.cells && 
            state.selection.cells.some(cell => cell[0] === rowInd && cell[1] === colInd)) {
            block.classList.add('selected');
        }

        container.appendChild(block);
    });
    
    drawNodeState();
    
    applyGateHighlights();
    
    import('./zoom.js').then(module => {
        module.applyZoom();
    }).catch(err => {
        console.error('Error applying zoom:', err);
    });
}

export function drawNodeState() {
    const existingNodes = document.querySelectorAll('.nodeDot');
    existingNodes.forEach(item => item.remove());
    let offset = Math.ceil(IMAGE_SIZE / 2);
    for (let halfRow in state.nodeState) {
        for (let halfCol in state.nodeState[halfRow]) {
            let left = ((halfRow % 2) ? 0 : offset) + halfCol * IMAGE_SIZE;
            let top = halfRow * offset;
            const OnOff = (state.nodeState[halfRow][halfCol] ? 'on' : 'off');
            let node = document.createElement('div');
            node.id = `${halfRow}${NODE_ID_DELIMITER}${halfCol}`
            node.classList.add('nodeDot', OnOff, halfRow, halfCol);
            node.style.top = `${top}px`;
            node.style.left = `${left}px`;
            const nodeSize = IMAGE_SIZE / NODE_RATIO;
            node.style.width = `${nodeSize}px`;
            node.style.height = `${nodeSize}px`;
            node.style.borderRadius = `${nodeSize}px`;
            node.addEventListener('click', handleNodeClick)
            container.appendChild(node);
        }
    }
}

export function handleBlockClick(e) {
    const block = e.target.closest('.block');
    let focusedAddress = block.id.split(ID_DELIMITER).splice(1);
    const row = parseInt(focusedAddress[0]);
    const col = parseInt(focusedAddress[1]);
    
    if (document.body.classList.contains('pipe-mode')) {
        const pipeHandled = handlePipeCellClick(row, col);
        if (pipeHandled) {
            return; 
        }
    }

    if (document.body.classList.contains('gate-selected')) {
        const gatePlaced = placeGate(row, col);
        if (gatePlaced) {
            return; 
        }
    }
    
    const gateInfo = isPartOfGate(row, col);
    if (gateInfo.isGateCell) {

        if (block.id == `${ID_DELIMITER}${state.focused.join(ID_DELIMITER)}`)
            focusedAddress = [null, null];
        
        actionFocusedNumbers(...focusedAddress);
        
        if (focusExists())
            orderText.value = state.orders[focusedAddress[0]][focusedAddress[1]];
        
        updateSimContainer();
        return; 
    }

    if (e.metaKey && e.shiftKey) {
        toggleCellSelection(row, col);
        return;
    }

    clearSelection();
    
    if (block.id == `${ID_DELIMITER}${state.focused.join(ID_DELIMITER)}`)
        focusedAddress = [null, null];
    
    actionFocusedNumbers(...focusedAddress);
    
    if (focusExists())
        orderText.value = state.orders[focusedAddress[0]][focusedAddress[1]];
    
    updateSimContainer();
}

function handleNodeClick(e) {
    saveStateForUndo();
    
    let nodeAddress = e.target.id.split(NODE_ID_DELIMITER);
    nodeAddress.forEach(item => parseInt(item));
    actionToggleNode(...nodeAddress);
    drawNodeState();
}

export function handleAddColLeft(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();
    
    actionInsertCol(parseInt(col));
    state.focused = [parseInt(row), parseInt(col) + 1];
    console.log(col);
    updateSimContainer();
}

export function handleAddColRight(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();
    
    actionInsertCol(parseInt(col) + 1);
    updateSimContainer();
}

export function handleAddRowTop(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();
    
    actionInsertRow(parseInt(row));
    state.focused = [parseInt(row) + 1, parseInt(col)];
    updateSimContainer();
}

export function handleAddRowBottom(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();
    
    actionInsertRow(parseInt(row) + 1);
    updateSimContainer();
}

export function handleDelCol(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    const confirmDelete = confirm("Are you sure you want to delete this column?");
    if (!confirmDelete) return;
    
    saveStateForUndo();
    
    actionDelCol(parseInt(col));
    state.focused = [null, null];
    updateSimContainer();
}

export function handleDelRow(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    const confirmDelete = confirm("Are you sure you want to delete this row?");
    if (!confirmDelete) return;
    
    saveStateForUndo();
    
    actionDelRow(parseInt(row));
    state.focused = [null, null];
    updateSimContainer();
}

export function handleRot(e) {
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();

    const gateInfo = isPartOfGate(row, col);
    if (gateInfo.isGateCell) {

        const newRotation = (state.rotations[row][col] + 1) % 4;
        state.rotations[row][col] = newRotation;

        const gate = state.gateCells[gateInfo.gateId];
        const cellIndex = gate.cells.findIndex(cell => 
            cell.initialRow === row && cell.initialCol === col
        );
        
        if (cellIndex !== -1) {

            if (typeof gate.cells[cellIndex].originalRotation === 'undefined') {
                gate.cells[cellIndex].originalRotation = gate.cells[cellIndex].rotation || 0;
            }
            

            gate.cells[cellIndex].rotation = newRotation;
        }
    } else {

        actionAddRot(parseInt(row), parseInt(col));
    }
    
    updateSimContainer();
}

export function handleRotateSelected(e) {
    rotateSelectedCells();
}

export function focusExists() {
    return state.focused[0] != null && state.focused[1] != null;
}

export function handleBlockButtonClick(e) {
    const blockName = e.target.closest('button').dataset.blockName;
    [row, col] = state.focused;
    if (!focusExists()) return;
    
    saveStateForUndo();
    
    const gateInfo = isPartOfGate(row, col);
    if (gateInfo.isGateCell) {
        state.blocks[row][col] = blockName;
        
        const gate = state.gateCells[gateInfo.gateId];
        const cellIndex = gate.cells.findIndex(cell => 
            cell.initialRow === row && cell.initialCol === col
        );
        
        if (cellIndex !== -1) {
            if (!gate.cells[cellIndex].originalBlockType) {
                gate.cells[cellIndex].originalBlockType = gate.cells[cellIndex].blockType;
            }
            gate.cells[cellIndex].blockType = blockName;
        }
    } else {
        state.blocks[row][col] = blockName;
    }
    
    updateSimContainer();
}

export function handleOrderTextChange(e) {
    if (focusExists()) {
        saveStateForUndo();
        actionSetOrder(e.target.value);
    }
    updateSimContainer();
}

export function handleStepClick(e) {
    saveStateForUndo(); 
    actionStep();
    updateSimContainer();
}

export function handleResetSimClick(e) {
    saveStateForUndo(); 
    actionResetSim();
    updateSimContainer();
}

export function handleImageTypeClick(e) {
    saveStateForUndo();
    actionToggleImageType();
    updateSimContainer();
}