export const BLOCKS = {
    "empty": "empty",
    "one": "one",
    "deflector": "deflector",
    "deflectorf": "deflectorf",
    "duplicator": "duplicator",
    "junctionul": "junctionul",
    "junctionur": "junctionur",
    "notc": "notc",
    "notcd": "notcd",
    "notcf": "notcf",
    "onefull": "onefull",
    "transfer": "transfer",
    "zero": "zero"
}
export const DEFAULT_ROWS = 2;
export const DEFAULT_COLS = 2;
export const ORDER_DEFAULT = 0;
export const NODE_STATE_OFF = 0;
export const NODE_STATE_ON = 1;
export const BLOCK_DEFAULT = BLOCKS.empty;
export const ROTATION_DEFAULT = 0;
export const IMAGE_SIZE = 100;
export const SCHEMATICS_IMAGE_FOLDER = 'assets/version3_reduced/';
export const GEOMETRY_IMAGE_FOLDER = 'assets/version3_reduced/geometries/';
export const ID_DELIMITER = '_';
export const NODE_ID_DELIMITER = '/';
export const NODE_RATIO = 5;

function initialBlocksGenerator(row, col, defaultValue) {
    return Array.from(Array(row), () => new Array(col).fill(defaultValue));
}

export function nodeStateGenerator(row, col, defaultValue) {
    let nodeState = []
    for (let i in new Array(row).fill(defaultValue)) {
        nodeState.push(new Array(col).fill(defaultValue));
        nodeState.push(new Array(col + 1).fill(defaultValue));
    }
    nodeState.push(new Array(col).fill(defaultValue));
    return nodeState;
}

export const SELECTION_STATE = {
    active: false,
    cells: [],
    clipboard: []
  };

export const DEFAULT_ZOOM = 1.0;

export const state = {
    "rows": 1,
    "cols": 1,
    "blocks": initialBlocksGenerator(DEFAULT_ROWS, DEFAULT_COLS, BLOCK_DEFAULT),
    "rotations": initialBlocksGenerator(DEFAULT_ROWS, DEFAULT_COLS, ROTATION_DEFAULT),
    "nodeState": nodeStateGenerator(DEFAULT_ROWS, DEFAULT_COLS, NODE_STATE_OFF),
    "nodeStateList": [nodeStateGenerator(DEFAULT_ROWS, DEFAULT_COLS, NODE_STATE_OFF)],
    "orders": initialBlocksGenerator(DEFAULT_ROWS, DEFAULT_COLS, ORDER_DEFAULT),
    "stepNumber": 0,
    "lastRanElement": null,
    "focused": [null, null],
    "imageFolder": SCHEMATICS_IMAGE_FOLDER,
    "selection": SELECTION_STATE,
    "gateHighlights": [],
    "zoomLevel": DEFAULT_ZOOM
}
