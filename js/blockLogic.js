import { rotateArray } from "./helpers.js";
export const blockLogic = {
    "empty": empty,
    "one": one,
    "deflector": deflector,
    "deflectorf": deflectorf,
    "duplicator": duplicator,
    "junctionul": junctionul,
    "junctionur": junctionur,
    "notc": notc,
    "notcd": notcd,
    "notcf": notcf,
    "onefull": onefull,
    "transfer": transfer,
    "zero": zero
}
export function empty(inp, rot) {
    return inp;
}
export function one(inp, rot) {
    let gout = [...inp]
    gout[1] = 1;
    return rotateArray(gout, -rot);
}
export function zero(inp, rot) {
    let gout = [...inp]
    gout[1] = 0;
    return rotateArray(gout, -rot);
}
export function onefull(inp, rot) {
    let gout = [0, 1, 0, 0]
    return rotateArray(gout, -rot);
}
export function transfer(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [...ginp];
    gout[1] = ginp[3];
    gout[3] = 0;
    return rotateArray(gout, -rot);
}

export function deflector(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [...ginp];
    if (ginp[3] == 1) {
        gout[2] = 1;
    }
    gout[3] = 0;

    return rotateArray(gout, -rot);
}

export function deflectorf(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [...ginp];
    if (ginp[2] == 1)
        gout[3] = 1;
    gout[2] = 0;
    return rotateArray(gout, -rot);
}
export function duplicator(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [...ginp];
    if (ginp[3] == 1) {
        gout[1] = 1;
        gout[2] = 1;
    }
    gout[3] = 0;

    return rotateArray(gout, -rot);
}

export function junctionul(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [0, 0, 0, 0];
    if (ginp[2] == 1)
        gout[0] = 1;
    if (ginp[1] == 1)
        gout[3] = 1;
    return rotateArray(gout, -rot);
}
export function junctionur(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [0, 0, 0, 0];
    if (ginp[2] == 1)
        gout[0] = 1;
    if (ginp[3] == 1)
        gout[1] = 1;
    return rotateArray(gout, -rot);
}
export function notc(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [0, 0, 0, 0];
    if (ginp[2] == 1) {
        gout[1] = 0;
    } else {
        gout[1] = ginp[3];
    }
    gout[0] = ginp[0];
    return rotateArray(gout, -rot);
}
export function notcd(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [0, 0, 0, 0];
    if (ginp[2] == 1) {
        gout[1] = 0;
    } else {
        gout[1] = ginp[3];
    }
    gout[0] = ginp[2];
    return rotateArray(gout, -rot);
}
export function notcf(inp, rot) {
    const ginp = rotateArray(inp, rot);
    let gout = [0, 0, 0, 0];
    if (ginp[2] == 1) {
        gout[3] = 0;
    } else {
        gout[3] = ginp[1];
    }
    gout[0] = ginp[0];
    return rotateArray(gout, -rot);
}