import { state, BLOCKS } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';
import { markUnsavedChanges } from './saveLoad.js';
import { saveStateForUndo } from './undoRedo.js';

const pipeState = {
    isPipeMode: false,
    startCell: null,
    endCell: null
};

const DIRECTIONS = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
};

const PIPE_BLOCKS = {
    VERTICAL: "deflector",
    HORIZONTAL: "transfer",
    CORNER: "junctionur"
};

function getCellOutputDirection(blockType, rotation) {
    const defaultDirections = {
        "one": DIRECTIONS.RIGHT,
        "zero": DIRECTIONS.RIGHT,
        "transfer": DIRECTIONS.RIGHT,
        "deflector": DIRECTIONS.DOWN,
        "junctionul": DIRECTIONS.RIGHT,
        "junctionur": DIRECTIONS.LEFT,
    };
    
    const defaultDir = defaultDirections[blockType] || DIRECTIONS.RIGHT;
    return (defaultDir + rotation) % 4;
}

function getPipeBlockAndRotation(inDir, outDir) {
    if ((inDir === DIRECTIONS.UP && outDir === DIRECTIONS.DOWN) || 
        (inDir === DIRECTIONS.DOWN && outDir === DIRECTIONS.UP)) {
        return { blockType: PIPE_BLOCKS.VERTICAL, rotation: 0 };
    }
    
    if ((inDir === DIRECTIONS.LEFT && outDir === DIRECTIONS.RIGHT) || 
        (inDir === DIRECTIONS.RIGHT && outDir === DIRECTIONS.LEFT)) {
        return { blockType: PIPE_BLOCKS.HORIZONTAL, rotation: 0 };
    }
    
    if (inDir === DIRECTIONS.UP && outDir === DIRECTIONS.RIGHT) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 3 };
    }
    
    if (inDir === DIRECTIONS.RIGHT && outDir === DIRECTIONS.UP) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 1 };
    }
    
    if (inDir === DIRECTIONS.UP && outDir === DIRECTIONS.LEFT) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 0 };
    }
    
    if (inDir === DIRECTIONS.LEFT && outDir === DIRECTIONS.UP) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 2 };
    }
    
    if (inDir === DIRECTIONS.DOWN && outDir === DIRECTIONS.RIGHT) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 2 };
    }
    
    if (inDir === DIRECTIONS.RIGHT && outDir === DIRECTIONS.DOWN) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 0 };
    }
    
    if (inDir === DIRECTIONS.DOWN && outDir === DIRECTIONS.LEFT) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 1 };
    }
    
    if (inDir === DIRECTIONS.LEFT && outDir === DIRECTIONS.DOWN) {
        return { blockType: PIPE_BLOCKS.CORNER, rotation: 3 };
    }
    
    return { blockType: PIPE_BLOCKS.HORIZONTAL, rotation: 0 };
}

function isCellValidForPipe(row, col) {
    if (row < 0 || row >= state.blocks.length || 
        col < 0 || col >= state.blocks[0].length) {
        return false;
    }
    
    return state.blocks[row][col] === BLOCKS.empty;
}

function getNeighbors(row, col) {
    const neighbors = [];
    
    if (isCellValidForPipe(row - 1, col)) {
        neighbors.push({ row: row - 1, col: col, direction: DIRECTIONS.UP });
    }
    
    if (isCellValidForPipe(row, col + 1)) {
        neighbors.push({ row: row, col: col + 1, direction: DIRECTIONS.RIGHT });
    }
    
    if (isCellValidForPipe(row + 1, col)) {
        neighbors.push({ row: row + 1, col: col, direction: DIRECTIONS.DOWN });
    }
    
    if (isCellValidForPipe(row, col - 1)) {
        neighbors.push({ row: row, col: col - 1, direction: DIRECTIONS.LEFT });
    }
    
    return neighbors;
}

function getOppositeDirection(direction) {
    switch (direction) {
        case DIRECTIONS.UP: return DIRECTIONS.DOWN;
        case DIRECTIONS.RIGHT: return DIRECTIONS.LEFT;
        case DIRECTIONS.DOWN: return DIRECTIONS.UP;
        case DIRECTIONS.LEFT: return DIRECTIONS.RIGHT;
        default: return direction;
    }
}

function determineStartCellOutputDirection(row, col) {
    const blockType = state.blocks[row][col];
    const rotation = state.rotations[row][col];
    
    if (blockType === BLOCKS.empty) {
        return DIRECTIONS.RIGHT;
    }
    
    return getCellOutputDirection(blockType, rotation);
}

function getDirectionBetweenCells(fromRow, fromCol, toRow, toCol) {
    if (fromRow < toRow) return DIRECTIONS.DOWN;
    if (fromRow > toRow) return DIRECTIONS.UP;
    if (fromCol < toCol) return DIRECTIONS.RIGHT;
    if (fromCol > toCol) return DIRECTIONS.LEFT;
    return DIRECTIONS.RIGHT;
}

function determineEndCellInputDirection(row, col) {
    const blockType = state.blocks[row][col];
    const rotation = state.rotations[row][col];
    
    if (blockType === BLOCKS.empty) {
        return DIRECTIONS.LEFT;
    }
    
    const defaultDirections = {
        "one": DIRECTIONS.LEFT,
        "zero": DIRECTIONS.LEFT,
        "transfer": DIRECTIONS.LEFT,
        "deflector": DIRECTIONS.UP,
        "junctionul": DIRECTIONS.RIGHT,
        "junctionur": DIRECTIONS.LEFT,
    };
    
    const defaultDir = defaultDirections[blockType] || DIRECTIONS.LEFT;
    return (defaultDir + rotation) % 4;
}

function findShortestPath(startRow, startCol, endRow, endCol) {
    if (startRow === endRow && startCol === endCol) {
        return [];
    }
    
    const queue = [];
    const visited = {};
    const previous = {};
    
    const startOutputDir = determineStartCellOutputDirection(startRow, startCol);
    
    let nextRow = startRow;
    let nextCol = startCol;
    
    switch (startOutputDir) {
        case DIRECTIONS.UP:
            nextRow = startRow - 1;
            break;
        case DIRECTIONS.RIGHT:
            nextCol = startCol + 1;
            break;
        case DIRECTIONS.DOWN:
            nextRow = startRow + 1;
            break;
        case DIRECTIONS.LEFT:
            nextCol = startCol - 1;
            break;
    }
    
    if (nextRow < 0 || nextRow >= state.blocks.length || 
        nextCol < 0 || nextCol >= state.blocks[0].length) {
        console.log("Start cell outputs outside the grid.");
        return null;
    }
    
    if (isCellValidForPipe(nextRow, nextCol)) {
        queue.push({ row: nextRow, col: nextCol });
        visited[`${nextRow},${nextCol}`] = true;
        previous[`${nextRow},${nextCol}`] = {
            row: startRow,
            col: startCol,
            direction: getOppositeDirection(startOutputDir)
        };
    } else {
        const neighbors = getNeighbors(startRow, startCol);
        
        for (const neighbor of neighbors) {
            const key = `${neighbor.row},${neighbor.col}`;
            visited[key] = true;
            previous[key] = {
                row: startRow,
                col: startCol,
                direction: getOppositeDirection(neighbor.direction)
            };
            queue.push(neighbor);
        }
    }
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.row === endRow && current.col === endCol) {
            const path = [];
            let curr = current;
            
            while (curr.row !== startRow || curr.col !== startCol) {
                path.unshift(curr);
                curr = previous[`${curr.row},${curr.col}`];
            }
            
            return path;
        }
        
        const neighbors = getNeighbors(current.row, current.col);
        
        for (const neighbor of neighbors) {
            const key = `${neighbor.row},${neighbor.col}`;
            
            if (!visited[key]) {
                visited[key] = true;
                previous[key] = {
                    row: current.row,
                    col: current.col,
                    direction: getOppositeDirection(neighbor.direction)
                };
                queue.push(neighbor);
            }
        }
    }
    
    return null;
}

function placePipes(path, startRow, startCol, endRow, endCol) {
    if (!path || path.length === 0) {
        console.log("No valid path to place pipes");
        return false;
    }
    
    saveStateForUndo();
    
    const startOutputDir = determineStartCellOutputDirection(startRow, startCol);
    
    let endInputDir;
    const lastCell = path[path.length - 1];
    
    if (lastCell.row < endRow) endInputDir = DIRECTIONS.UP;
    else if (lastCell.row > endRow) endInputDir = DIRECTIONS.DOWN;
    else if (lastCell.col < endCol) endInputDir = DIRECTIONS.LEFT;
    else if (lastCell.col > endCol) endInputDir = DIRECTIONS.RIGHT;
    else endInputDir = getOppositeDirection(lastCell.direction);
    
    for (let i = 0; i < path.length; i++) {
        const current = path[i];
        
        const inDirection = current.direction;
        
        let outDirection;
        if (i < path.length - 1) {
            const next = path[i + 1];
            
            if (next.row < current.row) outDirection = DIRECTIONS.UP;
            else if (next.row > current.row) outDirection = DIRECTIONS.DOWN;
            else if (next.col < current.col) outDirection = DIRECTIONS.LEFT;
            else if (next.col > current.col) outDirection = DIRECTIONS.RIGHT;
        } else {
            outDirection = endInputDir;
        }
        
        console.log(`Cell [${current.row},${current.col}] - in: ${inDirection}, out: ${outDirection}`);
        
        const { blockType, rotation } = getPipeBlockAndRotation(inDirection, outDirection);
        
        state.blocks[current.row][current.col] = blockType;
        state.rotations[current.row][current.col] = rotation;
    }
    
    if (path.length > 0 && (lastCell.row !== endRow || lastCell.col !== endCol)) {
        const dirToEnd = getDirectionBetweenCells(lastCell.row, lastCell.col, endRow, endCol);
        
        if (state.blocks[endRow][endCol] === BLOCKS.empty) {
            const dirFromLast = getOppositeDirection(dirToEnd);
            const { blockType, rotation } = getPipeBlockAndRotation(dirFromLast, determineEndCellInputDirection(endRow, endCol));
            
            state.blocks[endRow][endCol] = blockType;
            state.rotations[endRow][endCol] = rotation;
        }
    }
    
    markUnsavedChanges();
    updateSimContainer();
    return true;
}

export function handlePipeCellClick(row, col) {
    if (!pipeState.isPipeMode) return false;
    
    if (pipeState.startCell === null) {
        pipeState.startCell = { row, col };
        console.log("Pipe start cell set:", row, col);
        
        const cellElement = document.querySelector(`#_${row}_${col}`);
        if (cellElement) cellElement.classList.add('pipe-start');
        
        return true;
    } else {
        pipeState.endCell = { row, col };
        console.log("Pipe end cell set:", row, col);
        
        const path = findShortestPath(
            pipeState.startCell.row, 
            pipeState.startCell.col,
            row, col
        );
        
        if (path === null) {
            alert("No valid path found between the selected cells. Make sure there are empty cells between them.");
            resetPipeMode();
            return true;
        }
        
        const success = placePipes(
            path, 
            pipeState.startCell.row, 
            pipeState.startCell.col,
            row, col
        );
        
        if (!success) {
            alert("Failed to place pipes along the path.");
        }
        
        resetPipeMode();
        return true;
    }
}

export function togglePipeMode() {
    pipeState.isPipeMode = !pipeState.isPipeMode;
    
    if (pipeState.isPipeMode) {
        document.body.classList.add('pipe-mode');
        document.getElementById('pipeButton').classList.add('active');
        resetPipeStart();
    } else {
        document.body.classList.remove('pipe-mode');
        document.getElementById('pipeButton').classList.remove('active');
        resetPipeStart();
    }
    
    return pipeState.isPipeMode;
}

function resetPipeStart() {
    if (pipeState.startCell) {
        const cellElement = document.querySelector(`#_${pipeState.startCell.row}_${pipeState.startCell.col}`);
        if (cellElement) cellElement.classList.remove('pipe-start');
    }
    pipeState.startCell = null;
}

export function resetPipeMode() {
    pipeState.isPipeMode = false;
    document.body.classList.remove('pipe-mode');
    
    const pipeButton = document.getElementById('pipeButton');
    if (pipeButton) pipeButton.classList.remove('active');
    
    resetPipeStart();
    pipeState.endCell = null;
}

export function createPipeButton() {
    const controlsSection = document.querySelector('.controls');
    
    const pipeButton = document.createElement('button');
    pipeButton.id = 'pipeButton';
    pipeButton.className = 'iconButton';
    pipeButton.title = 'Pipe Tool (Connect two points with pipes)';
    pipeButton.textContent = 'Pipe';
    pipeButton.addEventListener('click', togglePipeMode);
    
    const resetSimButton = document.querySelector('#resetSim');
    if (resetSimButton) {
        controlsSection.insertBefore(pipeButton, resetSimButton.nextSibling);
    } else {
        controlsSection.appendChild(pipeButton);
    }
    
    const style = document.createElement('style');
    style.textContent = `
        .pipe-mode {
            cursor: crosshair;
        }
        .pipe-start {
            outline: 3px dashed blue;
        }
        #pipeButton.active {
            background-color: #4CAF50;
            color: white;
        }
    `;
    document.head.appendChild(style);
}

export function initPipeFeature() {
    createPipeButton();
}