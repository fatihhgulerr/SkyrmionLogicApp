import { getGateDefinition } from "./gateLibrary.js";
import {
    BLOCK_DEFAULT,
    NODE_STATE_OFF,
    ORDER_DEFAULT,
    ROTATION_DEFAULT,
    nodeStateGenerator,
    state,
} from "./stateFactory.js";
import { updateSimContainer } from "./callBacks.js";
import { markUnsavedChanges } from "./saveLoad.js";

const DIRECT_LAYOUT_TYPES = new Set(["AND", "OR", "NOR", "XOR", "XNOR", "NOT"]);

function matrix(rows, cols, value) {
    return Array.from({ length: rows }, () => Array(cols).fill(value));
}

function expandForLayout(cells) {
    const expanded = [];
    for (const cell of cells) {
        if (DIRECT_LAYOUT_TYPES.has(cell.gateType)) {
            expanded.push({ type: cell.gateType, sourceCell: cell.id });
        } else if (cell.gateType === "NAND") {
            expanded.push({ type: "AND", sourceCell: `${cell.id}:AND` });
            expanded.push({ type: "NOT", sourceCell: `${cell.id}:NOT` });
        }
    }
    return expanded;
}

function placeGateGeometry(item, row, col, index) {
    const gate = getGateDefinition(item.type);
    if (!gate) return;
    const gateId = `imported_gate_${index}`;
    state.gateCells[gateId] = {
        type: item.type,
        color: gate.highlightColor,
        sourceCell: item.sourceCell,
        cells: [],
    };

    for (const [gateRow, gateCol, blockType, rotation, order] of gate.layout) {
        const targetRow = row + gateRow;
        const targetCol = col + gateCol;
        state.blocks[targetRow][targetCol] = blockType;
        state.rotations[targetRow][targetCol] = rotation;
        state.orders[targetRow][targetCol] = order;
        state.gateCells[gateId].cells.push({
            blockType,
            initialRow: targetRow,
            initialCol: targetCol,
            originalBlockType: blockType,
            originalRotation: rotation,
        });
    }

    if (!gate.nodeState) return;
    for (let gateRow = 0; gateRow < gate.height; gateRow += 1) {
        for (let gateCol = 0; gateCol < gate.width; gateCol += 1) {
            const baseRow = 2 * (row + gateRow);
            const baseCol = col + gateCol;
            if (gate.nodeState[2 * gateRow]?.[gateCol] === 1) {
                state.nodeState[baseRow][baseCol] = 1;
            }
            if (gate.nodeState[2 * gateRow + 1]?.[gateCol + 1] === 1) {
                state.nodeState[baseRow + 1][baseCol + 1] = 1;
            }
            if (gate.nodeState[2 * gateRow + 2]?.[gateCol] === 1) {
                state.nodeState[baseRow + 2][baseCol] = 1;
            }
            if (gate.nodeState[2 * gateRow + 1]?.[gateCol] === 1) {
                state.nodeState[baseRow + 1][baseCol] = 1;
            }
        }
    }
}

export function recreateNetlistInEditor(netlist, { maximumGates = 96 } = {}) {
    const allLayoutItems = expandForLayout(netlist.cells);
    const layoutItems = allLayoutItems.slice(0, maximumGates);
    if (layoutItems.length === 0) {
        throw new Error("No skyrmion gate geometry is available for this mapped netlist.");
    }

    const maximumColumns = 28;
    const gap = 1;
    const positions = [];
    let cursorRow = 0;
    let cursorCol = 0;
    let shelfHeight = 0;
    let requiredColumns = 2;

    for (const item of layoutItems) {
        const gate = getGateDefinition(item.type);
        if (cursorCol > 0 && cursorCol + gate.width > maximumColumns) {
            cursorRow += shelfHeight + gap;
            cursorCol = 0;
            shelfHeight = 0;
        }
        positions.push({ item, row: cursorRow, col: cursorCol, gate });
        cursorCol += gate.width + gap;
        shelfHeight = Math.max(shelfHeight, gate.height);
        requiredColumns = Math.max(requiredColumns, cursorCol - gap);
    }
    const requiredRows = Math.max(2, cursorRow + shelfHeight);

    state.blocks = matrix(requiredRows, requiredColumns, BLOCK_DEFAULT);
    state.rotations = matrix(requiredRows, requiredColumns, ROTATION_DEFAULT);
    state.orders = matrix(requiredRows, requiredColumns, ORDER_DEFAULT);
    state.nodeState = nodeStateGenerator(requiredRows, requiredColumns, NODE_STATE_OFF);
    state.nodeStateList = [JSON.parse(JSON.stringify(state.nodeState))];
    state.gateCells = {};
    state.rows = requiredRows;
    state.cols = requiredColumns;
    state.stepNumber = 0;
    state.lastRanElement = null;
    state.focused = [null, null];

    positions.forEach(({ item, row, col }, index) => placeGateGeometry(item, row, col, index));
    markUnsavedChanges();
    updateSimContainer();

    return {
        recreatedGateTiles: layoutItems.length,
        totalAvailableGateTiles: allLayoutItems.length,
        truncated: layoutItems.length < allLayoutItems.length,
        rows: requiredRows,
        columns: requiredColumns,
    };
}
