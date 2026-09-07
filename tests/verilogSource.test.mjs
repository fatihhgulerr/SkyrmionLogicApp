import test from "node:test";
import assert from "node:assert/strict";
import { moduleNamesInSource, suggestedTopModule, validRequestedTopModule } from "../js/verilogSource.js";

test("module detection ignores commented-out declarations", () => {
    const source = `
        // module stale(input a, output y); endmodule
        /* module also_stale; endmodule */
        module active(input a, output y); assign y = a; endmodule
    `;
    assert.deepEqual(moduleNamesInSource(source), ["active"]);
    assert.equal(suggestedTopModule(source), "active");
});

test("multi-module sources stay on Yosys auto-top unless the request is valid", () => {
    const source = `module child(input a, output y); assign y = a; endmodule
        module root(input a, output y); child u0(a, y); endmodule`;
    assert.equal(suggestedTopModule(source), "");
    assert.equal(validRequestedTopModule(source, "root"), "root");
    assert.equal(validRequestedTopModule(source, "old_example"), "");
});
