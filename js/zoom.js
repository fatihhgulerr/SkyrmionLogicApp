import { state } from './stateFactory.js';
import { updateSimContainer } from './callBacks.js';
import { markUnsavedChanges } from './saveLoad.js';
import { saveStateForUndo } from './undoRedo.js';

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.01;

let zoomControlsCreated = false;

export function applyZoom() {
    const container = document.querySelector('.simContainer');
    
    if (!container) return;
    
    container.style.transform = `scale(${state.zoomLevel})`;
    container.style.transformOrigin = 'top left';
    
    updateZoomDisplay();
}

function updateZoomDisplay() {
    const zoomPercentage = Math.round(state.zoomLevel * 100);
    
    document.querySelectorAll('.zoom-value').forEach(elem => {
        elem.textContent = `${zoomPercentage}%`;
    });
}

export function zoomIn() {
    saveStateForUndo();
    
    if (state.zoomLevel < MAX_ZOOM) {
        state.zoomLevel = Math.min(MAX_ZOOM, state.zoomLevel + ZOOM_STEP);
        applyZoom();
        markUnsavedChanges();
    }
}

export function zoomOut() {
    saveStateForUndo();
    
    if (state.zoomLevel > MIN_ZOOM) {
        state.zoomLevel = Math.max(MIN_ZOOM, state.zoomLevel - ZOOM_STEP);
        applyZoom();
        markUnsavedChanges();
    }
}

export function resetZoom() {
    saveStateForUndo();
    
    state.zoomLevel = 1.0;
    applyZoom();
    markUnsavedChanges();
}

function findExistingZoomControls() {
    const zoomControls = document.querySelectorAll('.zoom-controls');
    return zoomControls.length > 0;
}

function removeDuplicateZoomControls() {
    const zoomControls = document.querySelectorAll('.zoom-controls');
    
    if (zoomControls.length > 1) {
        for (let i = 1; i < zoomControls.length; i++) {
            zoomControls[i].remove();
        }
        console.log('Removed duplicate zoom controls');
    }
}

function setupZoomControlHandlers() {
    document.querySelectorAll('#zoom-in, [title*="Zoom In"]').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', zoomIn);
    });
    
    document.querySelectorAll('#zoom-out, [title*="Zoom Out"]').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', zoomOut);
    });
    
    document.querySelectorAll('#reset-zoom, [title*="Reset Zoom"]').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', resetZoom);
    });
}

export function createZoomControls() {
    if (findExistingZoomControls()) {
        console.log('Zoom controls already exist - setting up event handlers...');
        removeDuplicateZoomControls();
        setupZoomControlHandlers();
        zoomControlsCreated = true;
        return;
    }
    
    if (zoomControlsCreated) {
        return;
    }
    
    const controlsSection = document.querySelector('.controls');
    
    if (!controlsSection) return;
    
    console.log('Creating new zoom controls...');
    
    const zoomControlContainer = document.createElement('div');
    zoomControlContainer.className = 'zoom-controls';
    
    const zoomOutButton = document.createElement('button');
    zoomOutButton.id = 'zoom-out';
    zoomOutButton.className = 'iconButton';
    zoomOutButton.title = 'Zoom Out (Ctrl+-)';
    zoomOutButton.innerHTML = '&#8722;';
    zoomOutButton.addEventListener('click', zoomOut);
    
    const zoomValueDisplay = document.createElement('span');
    zoomValueDisplay.id = 'zoom-value';
    zoomValueDisplay.className = 'zoom-value';
    zoomValueDisplay.textContent = '100%';
    
    const zoomInButton = document.createElement('button');
    zoomInButton.id = 'zoom-in';
    zoomInButton.className = 'iconButton';
    zoomInButton.title = 'Zoom In (Ctrl++)';
    zoomInButton.innerHTML = '&#43;';
    zoomInButton.addEventListener('click', zoomIn);
    
    const resetZoomButton = document.createElement('button');
    resetZoomButton.id = 'reset-zoom';
    resetZoomButton.className = 'iconButton';
    resetZoomButton.title = 'Reset Zoom (Ctrl+0)';
    resetZoomButton.innerHTML = '&#8634;';
    resetZoomButton.addEventListener('click', resetZoom);
    
    zoomControlContainer.appendChild(zoomOutButton);
    zoomControlContainer.appendChild(zoomValueDisplay);
    zoomControlContainer.appendChild(zoomInButton);
    zoomControlContainer.appendChild(resetZoomButton);
    
    const saveDesignBtn = document.querySelector('#saveDesign');
    if (saveDesignBtn) {
        controlsSection.insertBefore(zoomControlContainer, saveDesignBtn);
    } else {
        controlsSection.appendChild(zoomControlContainer);
    }
    
    zoomControlsCreated = true;
}

export function setupSimulationWrapper() {
    const simContainer = document.querySelector('.simContainer');
    
    if (!simContainer) return;
    
    if (simContainer.parentElement.classList.contains('simulation-wrapper')) {
        return;
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = 'simulation-wrapper';
    
    simContainer.parentElement.insertBefore(wrapper, simContainer);
    
    wrapper.appendChild(simContainer);
    
    console.log('Set up simulation wrapper for scrolling');
}

export function setupZoomKeyboardShortcuts() {
    if (window._zoomKeyListener) {
        document.removeEventListener('keydown', window._zoomKeyListener);
    }
    
    const keyListener = function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            zoomIn();
        }
        
        if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            zoomOut();
        }
        
        if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            resetZoom();
        }
    };
    
    window._zoomKeyListener = keyListener;
    
    document.addEventListener('keydown', keyListener);
    
    setupMouseWheelZoom();
}

function setupMouseWheelZoom() {
    const simWrapper = document.querySelector('.simulation-wrapper');
    if (!simWrapper) return;
    
    if (window._zoomWheelListener) {
        simWrapper.removeEventListener('wheel', window._zoomWheelListener);
    }
    
    const wheelListener = function(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        }
    };
    
    window._zoomWheelListener = wheelListener;
    
    simWrapper.addEventListener('wheel', wheelListener);
}

export function addZoomStyles() {
    if (document.getElementById('zoom-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'zoom-styles';
    style.textContent = `
        .zoom-controls {
            display: flex;
            align-items: center;
            margin: 0 10px;
            background-color: #f0f0f0;
            border-radius: 4px;
            padding: 2px;
        }
        
        .zoom-value {
            display: inline-block;
            min-width: 50px;
            text-align: center;
            font-weight: bold;
            user-select: none;
        }
        
        #zoom-in, #zoom-out, #reset-zoom {
            width: 30px;
            height: 30px;
            margin: 2px;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .simContainer {
            transition: transform 0.1s ease;
        }
        
        .simulation-wrapper {
            overflow: auto;
            max-width: 100%;
            max-height: calc(100vh - 150px);
            margin: 0;
            padding: 0;
            border: 1px solid #ccc;
            background-color: #f9f9f9;
        }
        
        .simulation-wrapper::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }
        
        .simulation-wrapper::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 6px;
        }
        
        .simulation-wrapper::-webkit-scrollbar-thumb {
            background: #bbbbbb;
            border-radius: 6px;
            border: 2px solid #f1f1f1;
        }
        
        .simulation-wrapper::-webkit-scrollbar-thumb:hover {
            background: #999999;
        }
        
        .simulation-wrapper {
            scrollbar-width: thin;
            scrollbar-color: #bbbbbb #f1f1f1;
        }
    `;
    document.head.appendChild(style);
}

export function initZoom() {
    if (typeof state.zoomLevel === 'undefined') {
        state.zoomLevel = 1.0;
    }
    
    addZoomStyles();
    
    setupSimulationWrapper();
    
    setTimeout(() => {
        removeDuplicateZoomControls();
        createZoomControls();
        setupZoomControlHandlers();
    }, 500);
    
    setupZoomKeyboardShortcuts();
    
    applyZoom();
    
    console.log('Zoom functionality initialized successfully');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initZoom);
} else {
    setTimeout(initZoom, 100);
}