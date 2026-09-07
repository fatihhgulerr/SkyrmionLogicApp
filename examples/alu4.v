module alu4(
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire [2:0] operation,
    output reg  [3:0] result,
    output reg        carry
);
    reg [4:0] extended;

    always @* begin
        extended = 5'b0;
        case (operation)
            3'b000: extended = {1'b0, a} + {1'b0, b};
            3'b001: extended = {1'b0, a} - {1'b0, b};
            3'b010: extended = {1'b0, a & b};
            3'b011: extended = {1'b0, a | b};
            3'b100: extended = {1'b0, a ^ b};
            3'b101: extended = {1'b0, ~a};
            3'b110: extended = {1'b0, a << 1};
            default: extended = {1'b0, a >> 1};
        endcase
        result = extended[3:0];
        carry = extended[4];
    end
endmodule
