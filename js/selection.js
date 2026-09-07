import { state } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';
import { actionInsertRow, actionInsertCol } from './actions.js';
import { markUnsavedChanges } from './saveLoad.js';
import { saveStateForUndo } from './undoRedo.js';

// Toggle selection of a cell
export function toggleCellSelection(row, col) {
  row = Number(row);
  col = Number(col);

  if (!state.selection) {
    state.selection = { active: false, cells: [], clipboard: [] };
  }
  
  const index = state.selection.cells.findIndex(
    cell => cell[0] === row && cell[1] === col
  );
  
  if (index !== -1) {
    state.selection.cells.splice(index, 1);
  } else {
    state.selection.cells.push([row, col]);
  }
  
  state.selection.active = state.selection.cells.length > 0;
  
  console.log('Selection updated:', state.selection.cells);
  updateSimContainer();
}

// Clear the current selection
export function clearSelection() {
  if (state.selection) {
    state.selection.cells = [];
    state.selection.active = false;
    updateSimContainer();
  }
}

// Copy selected cells to clipboard
export function copySelectedCells() {
  console.log('Attempting to copy cells. Selection state:', state.selection);

  if (!state.selection) {
    state.selection = { active: false, cells: [], clipboard: [] };
  }
  
  if (!state.selection.active || state.selection.cells.length === 0) {
    if (state.focused[0] !== null && state.focused[1] !== null) {
      const row = Number(state.focused[0]);
      const col = Number(state.focused[1]);
      
      state.selection.clipboard = [{
        row: row,
        col: col,
        block: state.blocks[row][col],
        rotation: state.rotations[row][col],
        order: state.orders[row][col]
      }];
      
      console.log('Copied focused cell:', state.selection.clipboard);
      return;
    }

    console.log('Nothing to copy');
    return;
  }
  
  // Create a copy of the selected cells data
  const clipboard = [];
  
  for (const [row, col] of state.selection.cells) {
    clipboard.push({
      row: Number(row),
      col: Number(col),
      block: state.blocks[row][col],
      rotation: state.rotations[row][col],
      order: state.orders[row][col]
    });
  }
  
  state.selection.clipboard = clipboard;
  console.log('Copied to clipboard:', state.selection.clipboard);
}

// Paste from clipboard to target location with safe auto-expansion
export function pasteClipboard(targetRow, targetCol) {
    saveStateForUndo();
    
    console.log('Attempting to paste. Clipboard:', state.selection.clipboard);

    targetRow = Number(targetRow);
    targetCol = Number(targetCol);
    
    if (!state.selection || !state.selection.clipboard || state.selection.clipboard.length === 0) {
      console.log('Nothing in clipboard to paste');
      return;
    }
    
    let minRow = Infinity;
    let minCol = Infinity;
    
    for (const cell of state.selection.clipboard) {
      minRow = Math.min(minRow, cell.row);
      minCol = Math.min(minCol, cell.col);
    }

    const rowOffset = targetRow - minRow;
    const colOffset = targetCol - minCol;
    
    let maxRowNeeded = -1;
    let maxColNeeded = -1;
    
    for (const cell of state.selection.clipboard) {
      const newRow = cell.row + rowOffset;
      const newCol = cell.col + colOffset;
      maxRowNeeded = Math.max(maxRowNeeded, newRow);
      maxColNeeded = Math.max(maxColNeeded, newCol);
    }
    
    console.log('Current grid size:', state.blocks.length, 'x', state.blocks[0].length);
    console.log('Required size for paste:', maxRowNeeded + 1, 'x', maxColNeeded + 1);
    
    const rowsToAdd = Math.max(0, maxRowNeeded - state.blocks.length + 1);
    const colsToAdd = Math.max(0, maxColNeeded - state.blocks[0].length + 1);
    
    console.log('Adding rows:', rowsToAdd, 'Adding columns:', colsToAdd);

    for (let i = 0; i < rowsToAdd; i++) {
      actionInsertRow(state.blocks.length);
      updateSimContainer();
    }

    for (let i = 0; i < colsToAdd; i++) {
      actionInsertCol(state.blocks[0].length);
      updateSimContainer();
    }

    for (const cell of state.selection.clipboard) {
      const newRow = cell.row + rowOffset;
      const newCol = cell.col + colOffset;
      
      if (newRow < 0 || newRow >= state.blocks.length || 
          newCol < 0 || newCol >= state.blocks[0].length) {
        console.log('Skipping out of bounds cell:', { newRow, newCol });
        continue;
      }

      state.blocks[newRow][newCol] = cell.block;
      state.rotations[newRow][newCol] = cell.rotation;
      state.orders[newRow][newCol] = cell.order;
      
      console.log('Pasted to cell:', { newRow, newCol, data: cell });
    }

    markUnsavedChanges();

    updateSimContainer();
}

// Rotate all selected cells by 90 degrees clockwise
export function rotateSelectedCells() {
    saveStateForUndo();
    
    console.log('Attempting to rotate selected cells');
    
    if (!state.selection) {
      state.selection = { active: false, cells: [], clipboard: [] };
    }

    if (!state.selection.active || state.selection.cells.length === 0) {
      if (state.focused[0] !== null && state.focused[1] !== null) {
        const row = Number(state.focused[0]);
        const col = Number(state.focused[1]);

        state.rotations[row][col] = (state.rotations[row][col] + 1) % 4;
        
        console.log('Rotated focused cell:', { row, col, rotation: state.rotations[row][col] });
        markUnsavedChanges();
        updateSimContainer();
      } else {
        console.log('Nothing to rotate - no selection and no focus');
      }
      return;
    }
    
    for (const [row, col] of state.selection.cells) {
      state.rotations[row][col] = (state.rotations[row][col] + 1) % 4;
      console.log('Rotated cell:', { row, col, rotation: state.rotations[row][col] });
    }
    
    markUnsavedChanges();
    
    updateSimContainer();
}

// Move selection using arrow keys
export function moveSelectionFocus(direction) {
    if (state.focused[0] === null || state.focused[1] === null) {
        state.focused = [0, 0];
        updateSimContainer();
        return;
    }
    
    let [row, col] = state.focused;
    row = Number(row);
    col = Number(col);
    
    switch (direction) {
        case 'up':
            row = Math.max(0, row - 1);
            break;
        case 'down':
            row = Math.min(state.blocks.length - 1, row + 1);
            break;
        case 'left':
            col = Math.max(0, col - 1);
            break;
        case 'right':
            col = Math.min(state.blocks[0].length - 1, col + 1);
            break;
    }
    state.focused = [row, col];
    const orderText = document.querySelector('#order');
    if (orderText) {
        orderText.value = state.orders[row][col];
    }
    
    updateSimContainer();
}

// Setup arrow key navigation
export function setupArrowKeyNavigation() {
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                moveSelectionFocus('up');
                break;
            case 'ArrowDown':
                e.preventDefault();
                moveSelectionFocus('down');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                moveSelectionFocus('left');
                break;
            case 'ArrowRight':
                e.preventDefault();
                moveSelectionFocus('right');
                break;
        }
    });
}