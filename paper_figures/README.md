# Paper figures

`benchmark_analysis_workflow_rsc.svg` is the editable double-column master at
17.1 cm width. Its grouped engineering-flow layout shows the common RTL input,
parallel OpenLane CMOS and skyrmion implementation branches, intermediate
netlist artifacts, and the final cross-technology comparison. No physical or
model parameters are shown. Identical output headings make the matched metric
set explicit: latency, energy/power, and area/implementation footprint.
Submission-ready PDF and 600 dpi RGB TIFF derivatives are provided beside the
SVG.

The release paper-figure package also contains representative ALU exports
produced directly by the application: an RTL operator schematic and a joined
skyrmion critical-path implementation. Each is supplied as an editable,
self-contained SVG and a 600 dpi RGB TIFF, with a preview and suggested
manuscript caption.

Application-generated SVG and TIFF exports carry physical dimensions and are
constrained to the RSC Nanoscale double-column envelope (17.1 cm wide and no
more than 23.3 cm high). They use a white background, collapsed buses, operator
or critical-path references, and routed links. Gate imagery is embedded in the
SVG, so exported figures remain self-contained.
