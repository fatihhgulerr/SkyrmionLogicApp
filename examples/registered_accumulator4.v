module registered_accumulator4(
    input  wire       clk,
    input  wire       reset,
    input  wire       enable,
    input  wire [3:0] data,
    output reg  [3:0] accumulator
);
    always @(posedge clk) begin
        if (reset)
            accumulator <= 4'b0;
        else if (enable)
            accumulator <= accumulator + data;
    end
endmodule
