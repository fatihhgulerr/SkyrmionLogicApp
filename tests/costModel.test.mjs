import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSkyrmionNetlist, MODEL, MODEL_VERSION, BASE_GATE_COSTS, segmentDelayNS, velocityMPerS, segmentJouleEnergyFJ } from "../js/skyrmionCostModel.js";

test("updated simulation velocity is zero-intercept and preserves gate costs", () => {
    assert.equal(velocityMPerS(0), 0);
    assert.ok(Math.abs(velocityMPerS(3.2e11)-197.76)<1e-12);
    assert.equal(BASE_GATE_COSTS.NOT.jouleFJ, 4.84);
    assert.equal(BASE_GATE_COSTS.NOT.delayNS, 7);
    assert.equal(BASE_GATE_COSTS.AND.jouleFJ, 12);
    assert.equal(MODEL_VERSION, 'benchmark-paper-rho27-v3-velocity618');
});

test("routing Joule energy scales linearly with j under the new velocity law", () => {
    for (const length of [MODEL.trackLengthM, Math.PI/4*MODEL.trackLengthM]) {
        assert.ok(Math.abs(segmentJouleEnergyFJ(length,3.6e11)/segmentJouleEnergyFJ(length,2.2e11)-3.6/2.2)<1e-12);
        const expected=27e-8*(3.2e11)**2*(length*MODEL.trackWidthM*MODEL.effectiveConductorThicknessM)*(length/197.76)*1e15;
        assert.ok(Math.abs(segmentJouleEnergyFJ(length,3.2e11)-expected)<1e-12);
    }
});

const netlist = {
    topModule: "and_then_not",
    ports: [
        { name: "a", direction: "input", bits: [2] },
        { name: "b", direction: "input", bits: [3] },
        { name: "y", direction: "output", bits: [5] },
    ],
    cells: [
        { id: "and0", sourceType: "$_AND_", gateType: "AND", sequential: false, inputBits: [2, 3], outputBits: [4] },
        { id: "not0", sourceType: "$_NOT_", gateType: "NOT", sequential: false, inputBits: [4], outputBits: [5] },
    ],
    netCount: 4,
    sinkConnections: 4,
    edges: [],
};

test("benchmark cost model returns finite energy and timing", () => {
    const report = analyzeSkyrmionNetlist(netlist, MODEL.referenceCurrentDensityAM2);
    assert.equal(report.gateCounts.AND, 1);
    assert.equal(report.gateCounts.NOT, 1);
    assert.equal(report.mappedGateCount, 2);
    assert.equal(report.bendCount, 6);
    assert.ok(report.energy.totalEnergyFJ > 0);
    assert.ok(report.timing.criticalPathDelayNS > 0);
    assert.ok(report.timing.averagePowerUW > 0);
});

test("higher current density reduces delay and raises evaluation-average power", () => {
    const low = analyzeSkyrmionNetlist(netlist, MODEL.currentDensityMinAM2);
    const high = analyzeSkyrmionNetlist(netlist, MODEL.currentDensityMaxAM2);
    assert.ok(high.timing.criticalPathDelayNS < low.timing.criticalPathDelayNS);
    assert.ok(high.timing.averagePowerUW > low.timing.averagePowerUW);
});

test("current density outside fitted range is rejected", () => {
    assert.throws(() => analyzeSkyrmionNetlist(netlist, 4e11), /2.2e11/);
});

test("timing includes final output connection", () => {
    const r=analyzeSkyrmionNetlist(netlist);
    const edge=segmentDelayNS(MODEL.trackLengthM,3.2e11)+1.5*segmentDelayNS(Math.PI/4*MODEL.trackLengthM,3.2e11);
    assert.ok(Math.abs(r.timing.criticalPathDelayNS-(9.55+7+3*edge))<1e-10);
});

test("timing ends on capture D without adding a second state launch", () => {
    const n=structuredClone(netlist);
    n.ports=n.ports.filter(p=>p.direction==='input');
    n.cells.push({id:'capture',sourceType:'$_DFF_P_',gateType:'STATE',sequential:true,inputBits:[5,10],inputPins:[{name:'D',bits:[5]},{name:'C',bits:[10]}],outputBits:[11]});
    const r=analyzeSkyrmionNetlist(n);
    const edge=segmentDelayNS(MODEL.trackLengthM,3.2e11)+1.5*segmentDelayNS(Math.PI/4*MODEL.trackLengthM,3.2e11);
    assert.ok(Math.abs(r.timing.criticalPathDelayNS-(9.55+7+3*edge))<1e-10);
    assert.equal(r.timing.criticalEndpoint.pin,'D');
});

test("combinational loops fail rather than producing optimistic delays", () => {
    const n=structuredClone(netlist);n.cells[0].inputBits=[5];
    assert.throws(()=>analyzeSkyrmionNetlist(n),/timing loop/);
});
