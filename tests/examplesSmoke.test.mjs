import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeVerilog } from "../server.mjs";

const examples = [
    { file: "alu4.v", topModule: "alu4", sequential: false },
    { file: "parity8.v", topModule: "parity8", sequential: false },
    { file: "registered_accumulator4.v", topModule: "registered_accumulator4", sequential: true },
];

for (const example of examples) {
    test(`example ${example.file} synthesizes and produces a finite report`, async () => {
        const verilog = await readFile(new URL(`../examples/${example.file}`, import.meta.url), "utf8");
        const result = await analyzeVerilog({
            verilog,
            topModule: example.topModule,
            currentDensityAM2: 3.2e11,
        });
        assert.equal(result.netlist.topModule, example.topModule);
        assert.ok(result.analysis.mappedGateCount > 0);
        assert.equal(result.analysis.unsupportedCellCount, 0);
        assert.ok(Number.isFinite(result.analysis.energy.totalEnergyFJ));
        assert.ok(result.analysis.energy.totalEnergyFJ > 0);
        assert.ok(Number.isFinite(result.analysis.timing.criticalPathDelayNS));
        assert.equal(result.rtlNetlist.topModule, example.topModule);
        assert.ok(result.rtlNetlist.cells.length > 0);
        assert.ok(result.rtlNetlist.edges.length > 0);
        if (example.sequential) assert.ok(result.analysis.sequentialCellCount > 0);
        else assert.equal(result.analysis.sequentialCellCount, 0);
    });
}
