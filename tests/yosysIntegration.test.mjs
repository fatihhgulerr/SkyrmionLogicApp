import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeVerilog } from "../server.mjs";

test("Yosys maps a Verilog full adder to supported skyrmion gates", async () => {
    const verilog = await readFile(new URL("../examples/full_adder.v", import.meta.url), "utf8");
    const result = await analyzeVerilog({
        verilog,
        topModule: "full_adder",
        currentDensityAM2: 3.2e11,
    });
    assert.equal(result.netlist.topModule, "full_adder");
    assert.ok(result.analysis.mappedGateCount >= 4);
    assert.equal(result.analysis.unsupportedCellCount, 0);
    assert.ok(result.analysis.energy.totalEnergyFJ > 0);
    assert.ok(result.netlist.edges.length > 0);
    assert.equal(result.rtlNetlist.topModule, "full_adder");
    assert.ok(result.rtlNetlist.cells.length > 0);
    assert.ok(result.rtlNetlist.edges.length > 0);
    assert.ok(result.rtlNetlist.cells.some((cell) => cell.gateType === "XOR"));
});

test("sequential cells are preserved as reported, uncosted boundaries", async () => {
    const verilog = `module registered_and(
        input wire clk, input wire a, input wire b, output reg y
    );
        always @(posedge clk) y <= a & b;
    endmodule`;
    const result = await analyzeVerilog({
        verilog,
        topModule: "registered_and",
        currentDensityAM2: 3.2e11,
    });
    assert.ok(result.analysis.mappedGateCount >= 1);
    assert.ok(result.analysis.sequentialCellCount >= 1);
    assert.match(result.analysis.warnings.join(" "), /sequential\/state cells/);
    assert.ok(result.rtlNetlist.cells.some((cell) => cell.sequential));
});
