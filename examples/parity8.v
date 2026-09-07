module parity8(
    input  wire [7:0] data,
    output wire       odd_parity,
    output wire       even_parity
);
    assign odd_parity = ^data;
    assign even_parity = ~^data;
endmodule
