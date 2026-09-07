import {
    state, BLOCK_DEFAULT, ORDER_DEFAULT,
    ROTATION_DEFAULT, NODE_STATE_OFF, NODE_STATE_ON,
    nodeStateGenerator, ID_DELIMITER,
    DEFAULT_COLS, DEFAULT_ROWS,
    SCHEMATICS_IMAGE_FOLDER, GEOMETRY_IMAGE_FOLDER
} from './stateFactory.js';
import { insertCol, insertRow, delRow, delCol, simArgSort } from './helpers.js';
import { blockLogic } from './blockLogic.js';
import { updateSimContainer } from './callBacks.js';
import { markUnsavedChanges } from './saveLoad.js';
import { updateGateCellPositions } from './gateLibrary.js';
import { saveStateForUndo } from './undoRedo.js';

export function actionFocusedNumbers(row, col) {
    state.focused = [row, col];
}

export function actionAddRot(row, col) {
    saveStateForUndo();
    
    state.rotations[row][col] = (state.rotations[row][col] + 1) % 4;
    markUnsavedChanges();
}

export function actionInsertCol(col) {
    saveStateForUndo();
    
    insertCol(state.blocks, col, BLOCK_DEFAULT);
    insertCol(state.rotations, col, ROTATION_DEFAULT);
    insertCol(state.orders, col, ORDER_DEFAULT);
    actionResetSim();
    
    updateGateCellPositions('insertCol', col);
    
    markUnsavedChanges();
}

export function actionInsertRow(row) {
    saveStateForUndo();
    
    insertRow(state.blocks, row, BLOCK_DEFAULT);
    insertRow(state.rotations, row, ROTATION_DEFAULT);
    insertRow(state.orders, row, ORDER_DEFAULT);
    actionResetSim();
    
    updateGateCellPositions('insertRow', row);
    
    markUnsavedChanges();
}

export function actionDelCol(col) {
    saveStateForUndo();
    
    updateGateCellPositions('deleteCol', col);
    
    delCol(state.blocks, col);
    delCol(state.rotations, col);
    delCol(state.orders, col);
    actionResetSim();
    markUnsavedChanges();
}

export function actionDelRow(row) {
    saveStateForUndo();
    
    updateGateCellPositions('deleteRow', row);
    
    delRow(state.blocks, row);
    delRow(state.rotations, row);
    delRow(state.orders, row);
    actionResetSim();
    markUnsavedChanges();
}

export function actionUpdateNodeState() {
    saveStateForUndo();
    
    if (state.blocks.length)
        state.nodeState = nodeStateGenerator(state.blocks.length, state.blocks[0].length, NODE_STATE_OFF);
    markUnsavedChanges();
}

export function actionToggleNode(halfRow, halfCol) {
    saveStateForUndo();
    
    if (state.nodeState[halfRow][halfCol] == NODE_STATE_OFF) {
        state.nodeState[halfRow][halfCol] = NODE_STATE_ON;
    } else {
        state.nodeState[halfRow][halfCol] = NODE_STATE_OFF;
    }
    markUnsavedChanges();
}

export function actionSetOrder(val) {
    saveStateForUndo();
    
    if (!parseInt(val))
        return;
    state.orders[state.focused[0]][state.focused[1]] = parseInt(val);
    markUnsavedChanges();
}

export function actionSetNode(row, col, val) {
    saveStateForUndo();
    
    state.nodeState[2 * row][col] = val[0];
    state.nodeState[2 * row + 1][col + 1] = val[1];
    state.nodeState[2 * row + 2][col] = val[2];
    state.nodeState[2 * row + 1][col] = val[3];
    markUnsavedChanges();
}

export function getNode(state, spec) {
    const row = spec[0];
    const col = spec[1];
    const val = [0, 0, 0, 0];
    val[0] = state[2 * row][col];
    val[1] = state[2 * row + 1][col + 1];
    val[2] = state[2 * row + 2][col];
    val[3] = state[2 * row + 1][col];
    return val;
}

export function actionStep() {
    saveStateForUndo();
    
    const orderIndices = simArgSort(state.orders);
    if (state.stepNumber >= (orderIndices.length))
        return;
    const index = orderIndices[state.stepNumber];
    console.log(orderIndices);
    console.log(index);
    const val = getNode(state.nodeState, index);
    const blockName = state.blocks[index[0]][index[1]];
    if (blockName == "empty") {
        state.stepNumber += 1;
        return;
    }
    const rotation = state.rotations[index[0]][index[1]];
    const valUpdated = blockLogic[blockName](val, rotation);
    actionSetNode(index[0], index[1], valUpdated);
    state.nodeStateList.push(state.nodeState);
    state.stepNumber += 1;
    let runningElement = document.querySelector(`#${ID_DELIMITER}${index[0]}${ID_DELIMITER}${index[1]}`);
    state.lastRanElement = index;
    markUnsavedChanges();
}

export function actionResetSim() {
    saveStateForUndo();
    
    state.nodeState = nodeStateGenerator(state.blocks.length, state.blocks[0].length, NODE_STATE_OFF);
    state.stepNumber = 0;
    state.lastRanElement = null;
    markUnsavedChanges();
}

export function actionToggleImageType() {
    saveStateForUndo();
    
    if (state.imageFolder == SCHEMATICS_IMAGE_FOLDER) {
        state.imageFolder = GEOMETRY_IMAGE_FOLDER;
    } else {
        state.imageFolder = SCHEMATICS_IMAGE_FOLDER;
    }
    markUnsavedChanges();
}