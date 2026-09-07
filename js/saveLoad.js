import { state } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';
import { nodeStateGenerator, NODE_STATE_OFF } from './stateFactory.js';
import { saveStateForUndo } from './undoRedo.js';

// Check if there are unsaved changes
let hasUnsavedChanges = false;

// Track when changes are made
export function markUnsavedChanges() {
    hasUnsavedChanges = true;
    
    // Update document title to show unsaved changes
    const currentTitle = document.title;
    if (!currentTitle.startsWith('*')) {
        document.title = '* ' + currentTitle;
    }
}

// Reset change tracking after saving
export function resetUnsavedChanges() {
    hasUnsavedChanges = false;
    
    // Update document title to remove unsaved indicator
    const currentTitle = document.title;
    if (currentTitle.startsWith('*')) {
        document.title = currentTitle.substring(2);
    }
}

// Check if there are unsaved changes
export function hasChanges() {
    return hasUnsavedChanges;
}

// Save the current design to a file
export function saveDesign() {
    try {
        const designData = {
            blocks: state.blocks,
            rotations: state.rotations,
            orders: state.orders,
            nodeState: state.nodeState,
            gateCells: state.gateCells || {}, 
            zoomLevel: state.zoomLevel || 1.0 
        };
        
        const designJSON = JSON.stringify(designData, null, 2);
        
        const blob = new Blob([designJSON], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'logic-design.json';
        
        document.body.appendChild(downloadLink);
        
        downloadLink.click();
        
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        resetUnsavedChanges();
        
        console.log('Design saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving design:', error);
        alert(`Error saving design: ${error.message || "An unknown error occurred."}`);
        return false;
    }
}

// Get gate highlight color from gate type with more vibrant colors
function getGateHighlightColor(gateType) {
    const defaultColors = {
        'AND': "rgba(255, 0, 0, 0.6)",         // Brighter red
        'OR': "rgba(0, 60, 255, 0.6)",         // Vibrant blue
        'NOR': "rgba(0, 180, 0, 0.6)",         // Brighter green
        'XOR': "rgba(180, 0, 180, 0.6)",       // Vibrant purple
        'XNOR': "rgba(255, 140, 0, 0.6)",      // Bright orange
        'NOT': "rgba(255, 50, 150, 0.6)"       // Bright pink
    };
    
    return defaultColors[gateType] || "rgba(100, 100, 100, 0.6)"; 
}

// Load a design from a file
export function loadDesign() {
    if (hasUnsavedChanges) {
        const shouldSave = confirm("You have unsaved changes. Would you like to save your current design first?");
        if (shouldSave) {
            const saved = saveDesign();
            if (!saved) {
                const continueAnyway = confirm("Saving failed. Do you want to continue loading a new design anyway?");
                if (!continueAnyway) return;
            }
        }
    }
    
    saveStateForUndo();
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const designData = JSON.parse(e.target.result);
                
                if (!designData.blocks || !Array.isArray(designData.blocks) || 
                    !designData.rotations || !Array.isArray(designData.rotations) ||
                    !designData.orders || !Array.isArray(designData.orders)) {
                    throw new Error("File is missing required data fields (blocks, rotations, or orders)");
                }
                
                if (designData.blocks.length !== designData.rotations.length || 
                    designData.blocks.length !== designData.orders.length) {
                    throw new Error("Inconsistent data dimensions in design file");
                }
                
                if (designData.blocks.length === 0) {
                    throw new Error("Design file contains no rows");
                }
                
                const rowLength = designData.blocks[0].length;
                for (let i = 0; i < designData.blocks.length; i++) {
                    if (designData.blocks[i].length !== rowLength ||
                        designData.rotations[i].length !== rowLength ||
                        designData.orders[i].length !== rowLength) {
                        throw new Error("Inconsistent row length in design file");
                    }
                }
                
                state.blocks = designData.blocks;
                state.rotations = designData.rotations;
                state.orders = designData.orders;
                
                if (designData.nodeState) {
                    state.nodeState = designData.nodeState;
                } else {
                    state.nodeState = nodeStateGenerator(state.blocks.length, state.blocks[0].length, NODE_STATE_OFF);
                }
                
                if (designData.gateCells) {
                    state.gateCells = designData.gateCells;
                    
                    Object.keys(state.gateCells).forEach(gateId => {
                        const gateType = state.gateCells[gateId].type;
                        if (!state.gateCells[gateId].color) {
                            state.gateCells[gateId].color = getGateHighlightColor(gateType);
                        }
                    });
                } else if (designData.gateHighlights) {
                    state.gateCells = {};
                    let tempGateCounter = 0;
                    
                    const groupedHighlights = {};
                    designData.gateHighlights.forEach(highlight => {
                        const key = `${highlight.gateType}_${highlight.row}_${highlight.col}`;
                        if (!groupedHighlights[key]) {
                            groupedHighlights[key] = [];
                        }
                        groupedHighlights[key].push(highlight);
                    });
                    
                    Object.keys(groupedHighlights).forEach(key => {
                        const highlights = groupedHighlights[key];
                        const gateId = `gate_${tempGateCounter++}`;
                        const gateType = highlights[0].gateType;
                        
                        state.gateCells[gateId] = {
                            type: gateType,
                            color: getGateHighlightColor(gateType),
                            cells: highlights.map(h => ({
                                initialRow: h.row,
                                initialCol: h.col,
                                blockType: state.blocks[h.row][h.col]
                            }))
                        };
                    });
                } else {
                    state.gateCells = {};
                }
                
                if (typeof designData.zoomLevel === 'number') {
                    state.zoomLevel = designData.zoomLevel;
                }
                
                state.stepNumber = 0;
                state.lastRanElement = null;
                
                updateSimContainer();
                resetUnsavedChanges();
                
                console.log('Design loaded successfully');
                
                import('./zoom.js').then(module => {
                    if (module.applyZoom) {
                        module.applyZoom();
                    }
                }).catch(err => {
                    console.warn('Zoom module not available:', err);
                });
            } catch (error) {
                console.error('Error loading design:', error);
                alert(`Error loading design file: ${error.message || "Please choose a valid JSON design file."}`);
            }
        };
        
        reader.onerror = function() {
            alert("Error reading file. The file may be corrupted or inaccessible.");
        };
        
        reader.readAsText(file);
    };
    
    fileInput.click();
}

// Handle before unload event to warn about unsaved changes
export function setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges) {
            const confirmationMessage = 'You have unsaved changes. Are you sure you want to leave?';
            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });
}