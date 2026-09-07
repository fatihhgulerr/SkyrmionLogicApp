export function insertRow(arr, index, defaultValue) {
    const colNo = arr[0].length;
    const newRow = Array(colNo).fill(defaultValue);
    arr.splice(index, 0, newRow);
}

export function insertCol(arr, index, defaultValue) {
    arr.forEach((row) => row.splice(index, 0, defaultValue));
}

export function delRow(arr, index) {
    arr.splice(index, 1);
}

export function delCol(arr, index) {
    arr.forEach((row) => row.splice(index, 1));
}
export function argsort(arr, f) {
    return arr.map((v, i) => [v, i]).sort(f).map(x => x[1])
}
export function rotateArray(arr, rot) {
    return arr.map((item, index, arr) => arr[((index + arr.length - rot) % arr.length)])
}
export function simArgSort(simOrder) {
    const cols = simOrder[0].length;
    let flattened = [];
    for (let row of simOrder) {
        flattened = [...flattened, ...row];
    }
    const sortedFlattened = argsort(flattened, (a, b) => a[0] - b[0]);
    return sortedFlattened.map(item => [Math.floor(item / cols), item % cols]);
}








