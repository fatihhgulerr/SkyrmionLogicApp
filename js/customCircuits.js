import { state } from './stateFactory.js';
import { markUnsavedChanges } from './saveLoad.js';
import { updateSimContainer } from './callBacks.js';
import { ID_DELIMITER } from './stateFactory.js';

const CUSTOM_CIRCUITS_STORAGE_KEY = 'logicDesigner_customCircuits';

function generateRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.3)`;
}

export function saveCustomCircuit() {
    if (state.blocks.length === 0 || state.blocks[0].length === 0) {
        alert('Cannot save an empty circuit. Please create a circuit first.');
        return;
    }
    
    const circuitName = prompt('Enter a name for your custom circuit:');
    
    if (!circuitName || circuitName.trim() === '') {
        alert('Please provide a valid name for your circuit.');
        return;
    }
    
    const existingCircuits = loadCustomCircuits();
    if (existingCircuits[circuitName]) {
        const overwrite = confirm(`A circuit named "${circuitName}" already exists. Overwrite it?`);
        if (!overwrite) return;
    }
    
    const circuit = {
        name: circuitName,
        width: state.blocks[0].length,
        height: state.blocks.length,
        layout: [],
        nodeState: captureNodeState(),
        highlightColor: generateRandomColor()
    };
    
    for (let row = 0; row < state.blocks.length; row++) {
        for (let col = 0; col < state.blocks[0].length; col++) {
            circuit.layout.push([
                row, col, state.blocks[row][col], state.rotations[row][col], state.orders[row][col]
            ]);
        }
    }
    
    saveCircuitToStorage(circuitName, circuit);
    
    alert(`Circuit "${circuitName}" has been saved to your custom library.`);
    
    updateGateLibraryUI();
}

function captureNodeState() {
    return JSON.parse(JSON.stringify(state.nodeState));
}

function saveCircuitToStorage(name, circuit) {
    const customCircuits = loadCustomCircuits();
    customCircuits[name] = circuit;
    localStorage.setItem(CUSTOM_CIRCUITS_STORAGE_KEY, JSON.stringify(customCircuits));
}

export function loadCustomCircuits() {
    const storedCircuits = localStorage.getItem(CUSTOM_CIRCUITS_STORAGE_KEY);
    return storedCircuits ? JSON.parse(storedCircuits) : {};
}

export function deleteCustomCircuit(name) {
    const customCircuits = loadCustomCircuits();
    
    if (customCircuits[name]) {
        const confirmDelete = confirm(`Are you sure you want to delete the custom circuit "${name}"?`);
        if (!confirmDelete) return false;
        
        delete customCircuits[name];
        localStorage.setItem(CUSTOM_CIRCUITS_STORAGE_KEY, JSON.stringify(customCircuits));
        updateGateLibraryUI();
        
        return true;
    }
    
    return false;
}

export function prepareCustomCircuitsForGateLibrary() {
    const customCircuits = loadCustomCircuits();
    const prepared = {};
    
    Object.entries(customCircuits).forEach(([name, circuit]) => {
        prepared[name] = {
            ...circuit,
            name: circuit.name || name,
        };
    });
    
    return prepared;
}

function updateGateLibraryUI() {
    const existingDialog = document.querySelector('#gateLibraryDialog');
    if (existingDialog) {
        existingDialog.remove();
    }
}

export function addCustomCircuitsStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .custom-circuits-section {
            margin-top: 20px;
            border-top: 1px solid #ccc;
            padding-top: 10px;
        }
        
        .custom-circuits-heading {
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .delete-circuit-btn {
            margin-left: 8px;
            color: red;
            font-size: 0.8em;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

export function initCustomCircuits() {
    addCustomCircuitsStyles();
    
    const addCircuitButton = document.createElement('button');
    addCircuitButton.id = 'addCustomCircuit';
    addCircuitButton.textContent = 'Add New Circuit';
    addCircuitButton.className = 'control-button';
    addCircuitButton.addEventListener('click', saveCustomCircuit);
    
    const controlsSection = document.querySelector('.controls');
    const loadDesignButton = document.querySelector('#loadDesign');
    
    if (controlsSection && loadDesignButton) {
        controlsSection.insertBefore(addCircuitButton, loadDesignButton.nextSibling);
    }
}