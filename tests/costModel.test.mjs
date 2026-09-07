import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSkyrmionNetlist, MODEL } from "../js/skyrmionCostModel.js";

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
