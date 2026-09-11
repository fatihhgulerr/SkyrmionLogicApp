# Skyrmion Verilog Mapper

This version extends the original skyrmion geometry editor with an automatic
benchmarking pipeline:

1. Load or paste synthesizable Verilog/SystemVerilog.
2. Generate a Yosys RTL schematic before technology mapping.
3. Run local Yosys synthesis and ABC mapping.
4. Normalize the gate netlist to NOT, NOR, OR, AND, NAND, XOR, and XNOR.
5. Draw the mapped network as joined skyrmion gate mosaics and racetrack links.
6. Recreate the mapped cells with the application's skyrmion gate geometries.
7. Estimate gate, straight-racetrack, and L-bend energy and critical-path delay.
8. Export a complete JSON report or a compact CSV breakdown.

Both diagram panels provide paper-ready editable SVG and direct 600 dpi RGB
TIFF export. RTL exports use a clean
pre-mapping operator view with bus widths on the ports, routed feedback paths,
and exact RSC double-column dimensions (17.1 cm wide, no more than 23.3 cm
high). Skyrmion tile images are
embedded into the downloaded SVG, so the figure remains self-contained when it
is moved into the paper source. TIFF files are generated in the browser at the
same physical dimensions, with 600 dpi metadata and no post-processing step.
The mapped network defaults to a compact, joined **Critical path** view. Switch
to **Full design (all gates)** to draw every recognized mapped cell and every
synthesized connection as one scrollable skyrmion network; the page itself
does not expand horizontally. Exports follow the active view and use separate
`critical-path` and `full-design` filenames.

The results toolbar also downloads the matching benchmark-analysis workflow
figure from `paper_figures/benchmark_analysis_workflow_rsc.svg`. It follows one
common RTL design through separate OpenLane microelectronic and skyrmion
spintronic implementation branches before comparison; model parameters are
kept out of the figure. An editable caption is kept beside it. Submission
derivatives at 600 dpi TIFF and PDF are included in the release paper-figure
package.

## Safari quick start (macOS)

1. Double-click **`Open Skyrmion App in Safari.command`**.
2. Keep the Terminal window open while using the app.
3. Safari opens the correct local address automatically.

Do not open `index.html` directly. A `file://` tab cannot run the local Yosys
service, so synthesis will not work there. The launcher searches common
Homebrew locations as well as Codex's bundled Node.js runtime, waits for the
server to become ready, and then explicitly opens Safari.

## Requirements

- Node.js 18 or newer.
- Yosys available on `PATH`, or set `YOSYS_BINARY` to its full path.

No npm packages are required.

## Run

```bash
npm start
```

Open `http://127.0.0.1:4173`. The app must be opened through this local server;
opening `index.html` directly cannot invoke Yosys.

On macOS, `start.command` provides the same flow and opens the page in Safari
automatically when Node.js and Yosys are available. The application includes
compatibility fallbacks for Safari's file-reading, SVG-image, and DOM APIs.
The full-design diagram is not capped; large circuits remain contained in the
diagram's own horizontal scroller.

Run automated checks with:

```bash
npm test
```

## Benchmark model

The estimator mirrors the benchmark-paper model:

- Effective racetrack resistivity: `27 micro-ohm cm = 2.7e-7 ohm m`.
- Current-density range: `2.2e11--3.6e11 A/m^2`.
- Reference current density: `3.2e11 A/m^2`.
- Straight track: `0.475 um x 0.05 um`, with `2 nm` effective conducting thickness.
- L-bend path length: `pi/4` times the straight-track length.
- Routing proxy: one straight racetrack per Yosys net and `1.5` bends per sink.
- XOR and XNOR energy follows the benchmark's Boolean decomposition.
- Evaluation-average power is `P_avg = E_map / T_CP`.

The reconstruction is a gate-tile preview, not a placed-and-routed magnetic
layout. State cells, clocking, injection, detection, synchronization, fan-out,
and other peripheral costs remain outside the reported energy. Unsupported and
sequential cells are reported explicitly rather than silently costed.

## Main files

- `server.mjs`: local static server and sandboxed Yosys invocation.
- `js/skyrmionCostModel.js`: benchmark energy and latency model.
- `js/verilogImport.js`: upload, RTL schematic, joined skyrmion network,
  reporting, and export interface.
- `js/netlistRecreate.js`: automatic placement of mapped skyrmion gate tiles.
- `examples/`: full adder, 4-bit ALU, 8-bit parity, and registered-accumulator
  inputs available directly from the application.
