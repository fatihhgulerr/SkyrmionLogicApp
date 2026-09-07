import { analyzeSkyrmionNetlist, MODEL, RECOGNIZED_GATES } from "./skyrmionCostModel.js";
import { recreateNetlistInEditor } from "./netlistRecreate.js";
import { getGateDefinition } from "./gateLibrary.js";
import { suggestedTopModule, validRequestedTopModule } from "./verilogSource.js";
import { encodeRgbaToTiff } from "./tiffEncoder.js";

const exampleCatalog = Object.freeze({
    full_adder: { name: "Full adder", topModule: "full_adder", path: "examples/full_adder.v" },
    alu4: { name: "4-bit ALU", topModule: "alu4", path: "examples/alu4.v" },
    parity8: { name: "8-bit parity", topModule: "parity8", path: "examples/parity8.v" },
    registered_accumulator4: {
        name: "Registered accumulator",
        topModule: "registered_accumulator4",
        path: "examples/registered_accumulator4.v",
    },
});

const ui = {};
let latestResult = null;
let latestSource = "";
let currentDensityTimer = 0;

function byId(id) {
    return document.getElementById(id);
}

function formatNumber(value, digits = 3) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    const numeric = Number(value);
    if (numeric !== 0 && (Math.abs(numeric) >= 1e5 || Math.abs(numeric) < 1e-3)) {
        return numeric.toExponential(digits);
    }
    return numeric.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setStatus(message, kind = "neutral") {
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
}

function currentDensityAM2() {
    return Number(ui.currentDensity.value) * 1e11;
}

async function readSelectedFile() {
    const file = ui.file.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error("The Verilog file exceeds 2 MB.");
    ui.source.value = await file.text();
    ui.topModule.value = suggestedTopModule(ui.source.value);
    setStatus(`${file.name} loaded. Ready to synthesize.`, "ready");
}

async function loadSelectedExample() {
    const example = exampleCatalog[ui.exampleSelect.value];
    if (!example) throw new Error("Unknown example selection.");
    const response = await fetch(example.path);
    if (!response.ok) throw new Error(`Could not load ${example.path}.`);
    ui.source.value = await response.text();
    ui.topModule.value = example.topModule;
    setStatus(`${example.name} example loaded.`, "ready");
}

async function analyze() {
    const verilog = ui.source.value.trim();
    if (!verilog) {
        setStatus("Paste Verilog or choose a .v/.sv file first.", "error");
        return;
    }
    const requestedTop = ui.topModule.value.trim();
    const resolvedTop = validRequestedTopModule(verilog, requestedTop);
    if (requestedTop && !resolvedTop) {
        ui.topModule.value = "";
        setStatus(`Top module “${requestedTop}” is not present in this source; using Yosys auto-detection.`, "working");
    } else {
        setStatus("Running Yosys synthesis and skyrmion mapping…", "working");
    }
    ui.analyze.disabled = true;
    ui.analyze.setAttribute("aria-busy", "true");
    if (!latestResult) ui.results.hidden = true;

    try {
        const response = await fetch("/api/analyze-verilog", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                verilog,
                topModule: resolvedTop,
                currentDensityAM2: currentDensityAM2(),
            }),
        });
        const responseText = await response.text();
        let payload;
        try {
            payload = JSON.parse(responseText);
        } catch {
            throw new Error(response.ok ? "The local analysis service returned an invalid response." : `Local analysis failed (${response.status}).`);
        }
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Analysis failed.");
        latestResult = payload;
        latestSource = verilog;
        renderResult(payload);
        setStatus(
            `${payload.netlist.topModule} mapped: ${payload.analysis.mappedGateCount} recognized gates.`,
            "success",
        );
    } catch (error) {
        setStatus(error.message || String(error), "error");
    } finally {
        ui.analyze.disabled = false;
        ui.analyze.removeAttribute("aria-busy");
    }
}

function metricCard(label, value, detail = "") {
    return `<article class="metric-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>`;
}

function renderMetrics(netlist, analysis) {
    ui.metrics.innerHTML = [
        metricCard("Mapped gates", formatNumber(analysis.mappedGateCount, 0), `${netlist.cells.length} Yosys cells`),
        metricCard("Total energy", `${formatNumber(analysis.energy.totalEnergyPJ, 4)} pJ`, "one mapped-network evaluation"),
        metricCard("Critical path", `${formatNumber(analysis.timing.criticalPathDelayNS, 3)} ns`, "model estimate"),
        metricCard("Average power", `${formatNumber(analysis.timing.averagePowerUW, 3)} µW`, "E_map / T_CP"),
        metricCard("Racetracks", formatNumber(analysis.netCount, 0), `${analysis.bendCount} estimated bends`),
        metricCard("Velocity", `${formatNumber(analysis.velocityMPerS, 2)} m/s`, `j = ${formatNumber(analysis.currentDensityAM2 / 1e11, 2)} × 10¹¹ A/m²`),
    ].join("");
}

function renderGateCounts(analysis) {
    const rows = RECOGNIZED_GATES
        .filter((gate) => analysis.gateCounts[gate] > 0)
        .map((gate) => `<tr><td><span class="gate-swatch gate-${gate.toLowerCase()}"></span>${gate}</td><td>${analysis.gateCounts[gate]}</td></tr>`)
        .join("");
    const omittedRows = Object.entries(analysis.unsupportedCounts)
        .map(([gate, count]) => `<tr class="muted-row"><td>${escapeHtml(gate)} (excluded)</td><td>${count}</td></tr>`)
        .join("");
    ui.gateCounts.innerHTML = rows || `<tr><td colspan="2">No supported combinational gates.</td></tr>`;
    ui.gateCounts.insertAdjacentHTML("beforeend", omittedRows);
}

function renderEnergy(analysis) {
    const energy = analysis.energy;
    const timing = analysis.timing;
    const rows = [
        ["Gates", analysis.mappedGateCount, energy.gates.magneticAverageFJ, energy.gates.jouleFJ, energy.gates.totalAverageFJ, timing.gateDelayNS],
        ["Straight racetracks", analysis.netCount, energy.racetracks.magneticFJ, energy.racetracks.jouleFJ, energy.racetracks.totalFJ, timing.racetrackDelayNS],
        ["L-bends", analysis.bendCount, energy.bends.magneticFJ, energy.bends.jouleFJ, energy.bends.totalFJ, timing.bendDelayNS],
        ["System total", analysis.mappedGateCount + analysis.netCount + analysis.bendCount, energy.totalMagneticAverageFJ, energy.totalJouleFJ, energy.totalEnergyFJ, timing.criticalPathDelayNS],
    ];
    ui.energyBody.innerHTML = rows.map((row, index) => `<tr class="${index === rows.length - 1 ? "total-row" : ""}">
        <td>${escapeHtml(row[0])}</td>
        <td>${formatNumber(row[1], 0)}</td>
        <td>${formatNumber(row[2], 4)}</td>
        <td>${formatNumber(row[3], 4)}</td>
        <td>${formatNumber(row[4], 4)}</td>
        <td>${formatNumber(row[5], 3)}</td>
    </tr>`).join("");
}

function renderWarnings(payload) {
    const warnings = [...(payload.analysis.warnings || []), ...(payload.yosysWarnings || [])];
    ui.warnings.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
        if (name === "image" && key === "href") {
            element.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", value);
        }
    }
    if (text) element.textContent = text;
    return element;
}

function collapsedEdges(edges) {
    const grouped = new Map();
    for (const edge of edges || []) {
        const key = `${edge.source}|${edge.target}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                source: edge.source,
                target: edge.target,
                bits: [],
                signals: new Set(),
            });
        }
        const group = grouped.get(key);
        group.bits.push(edge.bit);
        if (edge.signal) group.signals.add(edge.signal);
    }
    return [...grouped.values()].map((edge) => ({
        ...edge,
        signals: [...edge.signals],
    }));
}

function calculateCellLevels(netlist) {
    const cellsById = new Map(netlist.cells.map((cell) => [cell.id, cell]));
    const parents = new Map(netlist.cells.map((cell) => [cell.id, []]));
    for (const edge of netlist.edges || []) {
        if (!edge.source?.startsWith("cell:") || !edge.target?.startsWith("cell:")) continue;
        const sourceId = edge.source.slice(5);
        const targetId = edge.target.slice(5);
        if (cellsById.has(sourceId) && cellsById.has(targetId)) parents.get(targetId).push(sourceId);
    }

    const memo = new Map();
    const visiting = new Set();
    const visit = (cellId) => {
        if (memo.has(cellId)) return memo.get(cellId);
        if (visiting.has(cellId)) return 0;
        visiting.add(cellId);
        const cell = cellsById.get(cellId);
        const parentLevels = (cell?.sequential ? [] : parents.get(cellId) || []).map((parentId) => visit(parentId) + 1);
        const level = parentLevels.length ? Math.max(...parentLevels) : 0;
        visiting.delete(cellId);
        memo.set(cellId, level);
        return level;
    };
    for (const cell of netlist.cells) visit(cell.id);
    return Object.fromEntries(memo.entries());
}

function orthogonalPath(source, target) {
    const sourceX = source.x + source.width;
    const sourceY = source.anchorY ?? source.y + source.height / 2;
    const targetX = target.x;
    const targetY = target.anchorY ?? target.y + target.height / 2;
    const middleX = sourceX + Math.max(22, (targetX - sourceX) / 2);
    return {
        d: `M${sourceX},${sourceY} H${middleX} V${targetY} H${targetX}`,
        labelX: Math.max(sourceX + 5, targetX - 42),
        labelY: targetY - 6,
    };
}

function routedPath(source, target, feedbackY = null) {
    const sourceX = source.x + source.width;
    const sourceY = source.anchorY ?? source.y + source.height / 2;
    const targetX = target.x;
    const targetY = target.anchorY ?? target.y + target.height / 2;
    if (feedbackY === null || targetX > sourceX + 20) return orthogonalPath(source, target);
    const leaveX = sourceX + 18;
    const enterX = targetX - 18;
    return {
        d: `M${sourceX},${sourceY} H${leaveX} V${feedbackY} H${enterX} V${targetY} H${targetX}`,
        labelX: Math.min(sourceX, targetX) + Math.abs(sourceX - targetX) / 2,
        labelY: feedbackY - 4,
    };
}

function appendPortNode(svg, position, name, direction, className = "network-port") {
    const group = svgElement("g", {
        class: `${className} ${direction}`,
        transform: `translate(${position.x},${position.y})`,
    });
    group.appendChild(svgElement("rect", {
        width: position.width,
        height: position.height,
        rx: className === "rtl-port" ? 2 : position.height / 2,
    }));
    group.appendChild(svgElement("text", {
        x: position.width / 2,
        y: position.height / 2 + 4,
        "text-anchor": "middle",
    }, name));
    svg.appendChild(group);
}

function renderRtlGraph(netlist) {
    const maximumNodes = 84;
    const levels = calculateCellLevels(netlist);
    const candidates = [...netlist.cells].sort((left, right) => (
        Number(levels[left.id] || 0) - Number(levels[right.id] || 0)
        || left.id.localeCompare(right.id)
    ));
    const selected = candidates.slice(0, maximumNodes);
    const selectedIds = new Set(selected.map((cell) => cell.id));
    const groups = new Map();
    for (const cell of selected) {
        const level = Number(levels[cell.id] || 0);
        if (!groups.has(level)) groups.set(level, []);
        groups.get(level).push(cell);
    }
    const sortedLevels = [...groups.keys()].sort((left, right) => left - right);
    const inputPorts = netlist.ports.filter((port) => port.direction === "input");
    const outputPorts = netlist.ports.filter((port) => port.direction === "output");
    const positions = new Map();
    const nodeWidth = 142;
    const nodeHeight = 50;
    const portWidth = 102;
    const portHeight = 32;
    const xGap = 194;
    const yGap = 78;
    const cellStartX = 154;
    const referenceById = new Map(selected.map((cell, index) => [cell.id, `R${index + 1}`]));

    const maximumRowsPerStage = 7;
    let nextStageX = cellStartX;
    let maximumCellRows = 1;
    sortedLevels.forEach((level) => {
        const stageCells = groups.get(level);
        const stageColumns = Math.max(1, Math.ceil(stageCells.length / maximumRowsPerStage));
        stageCells.forEach((cell, index) => {
            const columnIndex = Math.floor(index / maximumRowsPerStage);
            const rowIndex = index % maximumRowsPerStage;
            positions.set(`cell:${cell.id}`, {
                x: nextStageX + columnIndex * xGap,
                y: 42 + rowIndex * yGap,
                width: nodeWidth,
                height: nodeHeight,
            });
        });
        maximumCellRows = Math.max(maximumCellRows, Math.min(stageCells.length, maximumRowsPerStage));
        nextStageX += stageColumns * xGap;
    });
    inputPorts.forEach((port, index) => positions.set(`input:${port.name}`, {
        x: 20, y: 50 + index * 52, width: portWidth, height: portHeight,
    }));
    const outputX = Math.max(350, nextStageX);
    outputPorts.forEach((port, index) => positions.set(`output:${port.name}`, {
        x: outputX, y: 50 + index * 52, width: portWidth, height: portHeight,
    }));

    const maximumRows = Math.max(
        1,
        inputPorts.length,
        outputPorts.length,
        maximumCellRows,
    );
    const width = Math.max(620, outputX + portWidth + 30);
    const visibleEdges = collapsedEdges(netlist.edges).filter((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return false;
        if (edge.source.startsWith("cell:") && !selectedIds.has(edge.source.slice(5))) return false;
        if (edge.target.startsWith("cell:") && !selectedIds.has(edge.target.slice(5))) return false;
        return true;
    });
    const baseHeight = Math.max(250, 92 + maximumRows * yGap);
    const feedbackEdges = visibleEdges.filter((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        return target.x <= source.x + source.width + 20;
    });
    const feedbackIndex = new Map(feedbackEdges.map((edge, index) => [`${edge.source}|${edge.target}`, index]));
    const height = baseHeight + (feedbackEdges.length ? 28 + feedbackEdges.length * 12 : 0);
    ui.rtlGraph.replaceChildren();
    ui.rtlGraph.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.rtlGraph.setAttribute("width", width);
    ui.rtlGraph.setAttribute("height", height);

    const defs = svgElement("defs");
    const marker = svgElement("marker", {
        id: "rtlArrow", markerWidth: "6", markerHeight: "6", refX: "5.5", refY: "3", orient: "auto",
    });
    marker.appendChild(svgElement("path", { d: "M0,0 L6,3 L0,6 z", fill: "#53646b" }));
    defs.appendChild(marker);
    ui.rtlGraph.appendChild(defs);

    ui.rtlGraph.appendChild(svgElement("text", { x: 20, y: 22, class: "rtl-stage-label" }, "INPUTS"));
    ui.rtlGraph.appendChild(svgElement("text", { x: cellStartX, y: 22, class: "rtl-stage-label" }, "RTL OPERATORS"));
    ui.rtlGraph.appendChild(svgElement("text", { x: outputX, y: 22, class: "rtl-stage-label" }, "OUTPUTS"));

    for (const edge of visibleEdges) {
        const edgeKey = `${edge.source}|${edge.target}`;
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        if (edge.source.startsWith("cell:") && !selectedIds.has(edge.source.slice(5))) continue;
        if (edge.target.startsWith("cell:") && !selectedIds.has(edge.target.slice(5))) continue;
        const feedbackOrder = feedbackIndex.get(edgeKey);
        const route = routedPath(source, target, feedbackOrder === undefined ? null : baseHeight + 18 + feedbackOrder * 12);
        ui.rtlGraph.appendChild(svgElement("path", {
            d: route.d,
            class: edge.bits.length > 1 ? "rtl-edge bus" : "rtl-edge",
            "marker-end": "url(#rtlArrow)",
        }));
    }

    const rtlPortLabel = (port) => {
        const width = (port.bits || []).filter((bit) => Number.isInteger(bit)).length;
        return width > 1 ? `${port.name} [${width}]` : port.name;
    };
    inputPorts.forEach((port) => appendPortNode(ui.rtlGraph, positions.get(`input:${port.name}`), rtlPortLabel(port), "input", "rtl-port"));
    outputPorts.forEach((port) => appendPortNode(ui.rtlGraph, positions.get(`output:${port.name}`), rtlPortLabel(port), "output", "rtl-port"));

    for (const cell of selected) {
        const position = positions.get(`cell:${cell.id}`);
        const group = svgElement("g", {
            class: `rtl-node ${cell.sequential ? "state" : "logic"}`,
            transform: `translate(${position.x},${position.y})`,
        });
        group.appendChild(svgElement("title", {}, `${referenceById.get(cell.id)} · ${cell.id} · ${cell.sourceType}`));
        group.appendChild(svgElement("rect", { width: nodeWidth, height: nodeHeight, rx: "3" }));
        group.appendChild(svgElement("text", { x: "13", y: "30", class: "rtl-type" }, cell.gateType));
        group.appendChild(svgElement("text", {
            x: nodeWidth - 12,
            y: "30",
            class: "rtl-reference",
            "text-anchor": "end",
        }, referenceById.get(cell.id)));
        ui.rtlGraph.appendChild(group);
    }

    ui.rtlGraphNote.textContent = candidates.length > maximumNodes
        ? `Showing ${selected.length} of ${candidates.length} RTL operators before technology mapping.`
        : `${selected.length} RTL operators (R1–R${selected.length}) before gate mapping; bracketed port labels show bus widths.`;
}

function gateParts(gateType) {
    const previewTypes = gateType === "NAND" ? ["AND", "NOT"] : [gateType];
    return previewTypes
        .map((type) => getGateDefinition(type))
        .filter(Boolean);
}

function gateMosaicSize(gateType, tileSize = 14, gap = 9) {
    const definitions = gateParts(gateType);
    return {
        definitions,
        width: definitions.reduce((sum, definition) => sum + definition.width * tileSize, 0)
            + gap * Math.max(0, definitions.length - 1),
        height: Math.max(tileSize, ...definitions.map((definition) => definition.height * tileSize)),
        tileSize,
        gap,
    };
}

function appendGateMosaic(group, gateType, critical = false, tileSize = 14, gap = 9) {
    const mosaic = gateMosaicSize(gateType, tileSize, gap);
    if (mosaic.definitions.length === 0) return mosaic;
    if (critical) {
        group.appendChild(svgElement("rect", {
            x: "-6", y: "-6", width: mosaic.width + 12, height: mosaic.height + 12, rx: "8", class: "gate-critical-halo",
        }));
    }

    let originX = 0;

    mosaic.definitions.forEach((definition, definitionIndex) => {
        const originY = Math.max(0, (mosaic.height - definition.height * mosaic.tileSize) / 2);
        for (const [row, col, blockType, rotation] of definition.layout) {
            const image = svgElement("image", {
                href: `assets/version3_reduced/${blockType}.png`,
                x: originX + col * mosaic.tileSize,
                y: originY + row * mosaic.tileSize,
                width: mosaic.tileSize,
                height: mosaic.tileSize,
                preserveAspectRatio: "xMidYMid meet",
                transform: rotation
                    ? `rotate(${-rotation * 90} ${originX + col * mosaic.tileSize + mosaic.tileSize / 2} ${originY + row * mosaic.tileSize + mosaic.tileSize / 2})`
                    : "",
            });
            group.appendChild(image);
        }
        originX += definition.width * mosaic.tileSize;
        if (definitionIndex < mosaic.definitions.length - 1) {
            group.appendChild(svgElement("path", {
                d: `M${originX},${mosaic.height / 2} H${originX + mosaic.gap}`,
                class: "gate-internal-track",
            }));
            originX += mosaic.gap;
        }
    });
    return mosaic;
}

function selectMappedCells(candidates, netlist, criticalIds, mode) {
    // The full-design view is deliberately uncapped: it is the visual netlist,
    // not a representative preview. Horizontal overflow stays inside the
    // diagram scroller, so even large mapped designs remain usable.
    if (mode === "full") return candidates;

    const maximumNodes = 32;
    if (candidates.length <= maximumNodes) return candidates;

    const selected = [];
    const selectedIds = new Set();
    const addCell = (cell) => {
        if (!cell || selectedIds.has(cell.id) || selected.length >= maximumNodes) return;
        selected.push(cell);
        selectedIds.add(cell.id);
    };
    const cellsById = new Map(candidates.map((cell) => [cell.id, cell]));

    for (const cell of candidates) {
        if (criticalIds.has(cell.id)) addCell(cell);
    }

    if (mode === "paper") {
        for (const edge of netlist.edges || []) {
            if (!edge.source?.startsWith("cell:") || !edge.target?.startsWith("cell:")) continue;
            const sourceId = edge.source.slice(5);
            const targetId = edge.target.slice(5);
            if (!criticalIds.has(sourceId) && !criticalIds.has(targetId)) continue;
            addCell(cellsById.get(sourceId));
            addCell(cellsById.get(targetId));
        }
        const paperMinimum = Math.min(24, candidates.length);
        for (const cell of candidates) {
            if (selected.length >= paperMinimum) break;
            addCell(cell);
        }
        return selected;
    }

    for (const cell of candidates) addCell(cell);
    return selected;
}

function appendPaperTrack(svg, pathData, targetPoint) {
    svg.appendChild(svgElement("path", { d: pathData, class: "skyr-track-shell" }));
    svg.appendChild(svgElement("path", { d: pathData, class: "skyr-track-core critical" }));
    if (targetPoint) {
        svg.appendChild(svgElement("circle", {
            cx: targetPoint.x,
            cy: targetPoint.y,
            r: "4",
            class: "track-contact critical",
        }));
    }
}

function renderPaperCriticalPath(netlist, analysis, candidates) {
    const cellsById = new Map(candidates.map((cell) => [cell.id, cell]));
    const orderedIds = analysis.timing.criticalPath
        .filter((entry) => !String(entry).startsWith("INPUT:"));
    let selected = orderedIds.map((id) => cellsById.get(id)).filter(Boolean);
    if (selected.length === 0) {
        const levels = analysis.timing.cellLevels || {};
        selected = [...candidates]
            .sort((left, right) => Number(levels[left.id] || 0) - Number(levels[right.id] || 0))
            .slice(0, 12);
    }
    const maximumPaperGates = 18;
    const fullPathLength = selected.length;
    selected = selected.slice(0, maximumPaperGates);

    const columns = 6;
    const xStart = 160;
    const yStart = 65;
    const xGap = 190;
    const yGap = 172;
    const tileSize = 18;
    const positions = new Map();
    selected.forEach((cell, index) => {
        const row = Math.floor(index / columns);
        const offset = index % columns;
        const column = row % 2 === 0 ? offset : columns - 1 - offset;
        const mosaic = gateMosaicSize(cell.gateType, tileSize, 11);
        positions.set(cell.id, {
            x: xStart + column * xGap,
            y: yStart + row * yGap,
            width: mosaic.width,
            height: mosaic.height,
            row,
        });
    });

    const rowCount = Math.max(1, Math.ceil(selected.length / columns));
    const width = 1400;
    const height = Math.max(330, yStart + rowCount * yGap + 35);
    ui.graph.replaceChildren();
    ui.graph.classList.add("paper-network");
    ui.graph.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.graph.setAttribute("width", width);
    ui.graph.setAttribute("height", height);
    ui.graph.appendChild(svgElement("text", {
        x: "20", y: "28", class: "network-figure-label",
    }, `CRITICAL-PATH IMPLEMENTATION · ${selected.length} MAPPED GATES`));

    if (selected.length > 0) {
        const firstPosition = positions.get(selected[0].id);
        const inputName = String(analysis.timing.criticalPath.find((entry) => String(entry).startsWith("INPUT:")) || "INPUT")
            .replace(/^INPUT:/, "");
        const inputPosition = { x: 20, y: firstPosition.y + firstPosition.height / 2 - 17, width: 112, height: 34 };
        appendPortNode(ui.graph, inputPosition, inputName, "input");
        appendPaperTrack(
            ui.graph,
            `M${inputPosition.x + inputPosition.width},${inputPosition.y + inputPosition.height / 2} H${firstPosition.x}`,
            { x: firstPosition.x, y: firstPosition.y + firstPosition.height / 2 },
        );

        for (let index = 1; index < selected.length; index += 1) {
            const source = positions.get(selected[index - 1].id);
            const target = positions.get(selected[index].id);
            const sourceY = source.y + source.height / 2;
            const targetY = target.y + target.height / 2;
            let pathData;
            let targetPoint;
            if (source.row === target.row && target.x > source.x) {
                pathData = `M${source.x + source.width},${sourceY} H${target.x}`;
                targetPoint = { x: target.x, y: targetY };
            } else if (source.row === target.row) {
                pathData = `M${source.x},${sourceY} H${target.x + target.width}`;
                targetPoint = { x: target.x + target.width, y: targetY };
            } else if (target.row % 2 === 1) {
                const outsideX = Math.max(source.x + source.width, target.x + target.width) + 28;
                pathData = `M${source.x + source.width},${sourceY} H${outsideX} V${targetY} H${target.x + target.width}`;
                targetPoint = { x: target.x + target.width, y: targetY };
            } else {
                const outsideX = Math.min(source.x, target.x) - 28;
                pathData = `M${source.x},${sourceY} H${outsideX} V${targetY} H${target.x}`;
                targetPoint = { x: target.x, y: targetY };
            }
            appendPaperTrack(ui.graph, pathData, targetPoint);
        }

        const lastCell = selected[selected.length - 1];
        const lastPosition = positions.get(lastCell.id);
        const lastY = lastPosition.y + lastPosition.height / 2;
        const outputEdge = (netlist.edges || []).find((edge) => (
            edge.source === `cell:${lastCell.id}` && edge.target?.startsWith("output:")
        ));
        const outputName = outputEdge ? outputEdge.target.slice(7) : "critical output";
        if (lastPosition.row % 2 === 0) {
            const outputPosition = {
                x: Math.min(width - 130, lastPosition.x + lastPosition.width + 42),
                y: lastY - 17,
                width: 112,
                height: 34,
            };
            appendPaperTrack(ui.graph, `M${lastPosition.x + lastPosition.width},${lastY} H${outputPosition.x}`, null);
            appendPortNode(ui.graph, outputPosition, outputName, "output");
        } else {
            const outputPosition = {
                x: Math.max(20, lastPosition.x - 154),
                y: lastY - 17,
                width: 112,
                height: 34,
            };
            appendPaperTrack(ui.graph, `M${lastPosition.x},${lastY} H${outputPosition.x + outputPosition.width}`, null);
            appendPortNode(ui.graph, outputPosition, outputName, "output");
        }
    }

    selected.forEach((cell, index) => {
        const position = positions.get(cell.id);
        const group = svgElement("g", {
            class: `skyr-gate paper-path-gate gate-${cell.gateType.toLowerCase()} critical`,
            transform: `translate(${position.x},${position.y})`,
        });
        const mosaic = appendGateMosaic(group, cell.gateType, true, tileSize, 11);
        group.appendChild(svgElement("title", {}, `CP${index + 1} · ${cell.gateType} · ${cell.id}`));
        group.appendChild(svgElement("text", {
            x: mosaic.width / 2,
            y: mosaic.height + 27,
            class: "skyr-gate-label",
            "text-anchor": "middle",
        }, `CP${index + 1} · ${cell.gateType}`));
        ui.graph.appendChild(group);
    });

    const truncation = fullPathLength > selected.length
        ? ` First ${selected.length} of ${fullPathLength} critical-path gates are shown.`
        : "";
    ui.graphNote.textContent = `Critical-path view: the mapped critical path is arranged as a compact joined skyrmion network.${truncation} Switch to Full design to draw all ${candidates.length} mapped gates.`;
}

function renderGraph(netlist, analysis) {
    const recognized = new Set(RECOGNIZED_GATES);
    const candidates = netlist.cells.filter((cell) => recognized.has(cell.gateType));
    const criticalIds = new Set(
        analysis.timing.criticalPath.filter((entry) => !String(entry).startsWith("INPUT:")),
    );
    const viewMode = ui.networkViewMode?.value || "paper";
    if (viewMode === "paper") {
        renderPaperCriticalPath(netlist, analysis, candidates);
        return;
    }
    ui.graph.classList.remove("paper-network");
    const selected = selectMappedCells(candidates, netlist, criticalIds, viewMode);
    const selectedIds = new Set(selected.map((cell) => cell.id));
    const levels = analysis.timing.cellLevels || {};
    const groups = new Map();
    for (const cell of selected) {
        const level = Number(levels[cell.id] || 0);
        if (!groups.has(level)) groups.set(level, []);
        groups.get(level).push(cell);
    }
    const sortedLevels = [...groups.keys()].sort((a, b) => a - b);
    const inputPorts = netlist.ports.filter((port) => port.direction === "input");
    const outputPorts = netlist.ports.filter((port) => port.direction === "output");
    const positions = new Map();
    const xGap = 182;
    const yGap = 116;
    const cellStartX = 154;
    const referenceById = new Map(selected.map((cell, index) => [cell.id, `G${index + 1}`]));
    const maximumRowsPerStage = 8;
    let nextStageX = cellStartX;
    let maximumCellRows = 1;
    sortedLevels.forEach((level) => {
        const stageCells = groups.get(level);
        const stageColumns = Math.max(1, Math.ceil(stageCells.length / maximumRowsPerStage));
        stageCells.forEach((cell, index) => {
            const columnIndex = Math.floor(index / maximumRowsPerStage);
            const rowIndex = index % maximumRowsPerStage;
            const mosaic = gateMosaicSize(cell.gateType);
            positions.set(`cell:${cell.id}`, {
                x: nextStageX + columnIndex * xGap,
                y: 38 + rowIndex * yGap,
                width: mosaic.width,
                height: mosaic.height,
            });
        });
        maximumCellRows = Math.max(maximumCellRows, Math.min(stageCells.length, maximumRowsPerStage));
        nextStageX += stageColumns * xGap;
    });
    inputPorts.forEach((port, index) => positions.set(`input:${port.name}`, {
        x: 18, y: 42 + index * 62, width: 102, height: 32,
    }));
    const outputX = Math.max(360, nextStageX);
    outputPorts.forEach((port, index) => positions.set(`output:${port.name}`, {
        x: outputX, y: 42 + index * 62, width: 102, height: 32,
    }));
    const maximumRows = Math.max(
        1,
        inputPorts.length,
        outputPorts.length,
        maximumCellRows,
    );
    const width = Math.max(700, outputX + 130);
    const height = Math.max(300, 84 + maximumRows * yGap);

    ui.graph.replaceChildren();
    ui.graph.setAttribute("viewBox", `0 0 ${width} ${height}`);
    ui.graph.setAttribute("width", width);
    ui.graph.setAttribute("height", height);
    const criticalInputNames = new Set(
        analysis.timing.criticalPath
            .filter((entry) => String(entry).startsWith("INPUT:"))
            .map((entry) => String(entry).slice(6)),
    );
    for (const edge of collapsedEdges(netlist.edges)) {
        if (edge.source.startsWith("cell:") && !selectedIds.has(edge.source.slice(5))) continue;
        if (edge.target.startsWith("cell:") && !selectedIds.has(edge.target.slice(5))) continue;
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) continue;
        const sourceId = edge.source.startsWith("cell:") ? edge.source.slice(5) : "";
        const targetId = edge.target.startsWith("cell:") ? edge.target.slice(5) : "";
        const inputName = edge.source.startsWith("input:") ? edge.source.slice(6) : "";
        const critical = (sourceId && targetId && criticalIds.has(sourceId) && criticalIds.has(targetId))
            || (inputName && targetId && criticalInputNames.has(inputName) && criticalIds.has(targetId));
        const route = orthogonalPath(source, target);
        ui.graph.appendChild(svgElement("path", { d: route.d, class: "skyr-track-shell" }));
        ui.graph.appendChild(svgElement("path", {
            d: route.d,
            class: critical ? "skyr-track-core critical" : "skyr-track-core",
        }));
        ui.graph.appendChild(svgElement("circle", {
            cx: target.x,
            cy: target.y + target.height / 2,
            r: "3",
            class: critical ? "track-contact critical" : "track-contact",
        }));
    }

    inputPorts.forEach((port) => appendPortNode(ui.graph, positions.get(`input:${port.name}`), port.name, "input"));
    outputPorts.forEach((port) => appendPortNode(ui.graph, positions.get(`output:${port.name}`), port.name, "output"));

    for (const cell of selected) {
        const position = positions.get(`cell:${cell.id}`);
        const group = svgElement("g", {
            class: `skyr-gate gate-${cell.gateType.toLowerCase()} ${criticalIds.has(cell.id) ? "critical" : ""}`,
            transform: `translate(${position.x},${position.y})`,
        });
        const mosaic = appendGateMosaic(group, cell.gateType, criticalIds.has(cell.id));
        group.appendChild(svgElement("title", {}, `${referenceById.get(cell.id)} · ${cell.gateType} · ${cell.id}`));
        group.appendChild(svgElement("text", {
            x: mosaic.width / 2,
            y: mosaic.height + 20,
            class: "skyr-gate-label",
            "text-anchor": "middle",
        }, `${referenceById.get(cell.id)} · ${cell.gateType}`));
        ui.graph.appendChild(group);
    }

    ui.graphNote.textContent = `Full design: all ${selected.length} mapped gates (G1–G${selected.length}) and their synthesized connections are shown as joined skyrmion geometries; red marks the critical path.`;
}

function renderResult(payload, { diagrams = true } = {}) {
    const { rtlNetlist, netlist, analysis } = payload;
    ui.summary.textContent = `${netlist.topModule} · ${payload.yosysVersion}`;
    renderMetrics(netlist, analysis);
    renderGateCounts(analysis);
    renderEnergy(analysis);
    renderWarnings(payload);
    if (diagrams) {
        renderRtlGraph(rtlNetlist || netlist);
        renderGraph(netlist, analysis);
    }
    ui.results.hidden = false;
}

function recomputeAtCurrentDensity({ diagrams = false } = {}) {
    if (!latestResult) return;
    const density = currentDensityAM2();
    if (!Number.isFinite(density)
        || density < MODEL.currentDensityMinAM2
        || density > MODEL.currentDensityMaxAM2) return;
    try {
        latestResult.analysis = analyzeSkyrmionNetlist(latestResult.netlist, density);
        renderResult(latestResult, { diagrams });
        setStatus(`Recomputed at j = ${ui.currentDensity.value} × 10¹¹ A/m².`, "success");
    } catch (error) {
        setStatus(error.message || String(error), "error");
    }
}

function scheduleCurrentDensityRecompute() {
    window.clearTimeout(currentDensityTimer);
    currentDensityTimer = window.setTimeout(() => recomputeAtCurrentDensity({ diagrams: false }), 180);
}

function commitCurrentDensityRecompute() {
    window.clearTimeout(currentDensityTimer);
    recomputeAtCurrentDensity({ diagrams: true });
}

function download(name, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(name, blob);
}

function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Could not embed a diagram image."));
        reader.readAsDataURL(blob);
    });
}

const PAPER_SVG_STYLE = `
    text { font-family: Arial, Helvetica, sans-serif; }
    .rtl-edge { fill:none; stroke:#53646b; stroke-width:1.35; opacity:.9; }
    .rtl-edge.bus { stroke-width:2.4; }
    .rtl-wire-label { fill:#3f4c51; font:700 9px Arial, sans-serif; }
    .rtl-stage-label { fill:#6a777c; font:700 9px Arial, sans-serif; letter-spacing:1.1px; }
    .rtl-node rect { fill:#fff; stroke:#2f474f; stroke-width:1.6; }
    .rtl-node.state rect { fill:#f7f1e5; stroke:#815d32; }
    .rtl-type { fill:#17272d; font:700 13px Arial, sans-serif; }
    .rtl-reference { fill:#53646b; font:700 10px Arial, sans-serif; }
    .rtl-port rect,.network-port rect { fill:#fff; stroke:#455b63; stroke-width:1.4; }
    .rtl-port text,.network-port text { fill:#1c2d33; font:700 10px Arial, sans-serif; }
    .skyr-track-shell { fill:none; stroke:#1d292d; stroke-width:9; stroke-linejoin:round; }
    .skyr-track-core { fill:none; stroke:#dce4e5; stroke-width:5; stroke-linejoin:round; }
    .skyr-track-core.critical { stroke:#c84e45; }
    .track-contact { fill:#dce4e5; stroke:#1d292d; stroke-width:1.3; }
    .track-contact.critical { fill:#c84e45; }
    .gate-critical-halo { fill:#fff6f5; stroke:#c84e45; stroke-width:2.3; stroke-dasharray:4 3; }
    .skyr-gate-label { fill:#25383e; font:700 10px Arial, sans-serif; }
    .network-figure-label { fill:#526970; font:700 18px Arial, sans-serif; letter-spacing:1.2px; }
    .paper-network .skyr-gate-label { font-size:18px; }
    .paper-network .network-port text { font-size:16px; }
    .paper-network .network-port rect { stroke-width:2; }
    .gate-internal-track { fill:none; stroke:#1d292d; stroke-width:7; }
`;

async function buildPaperSvg(sourceSvg, { title, description } = {}) {
    const clone = sourceSvg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const images = [...clone.querySelectorAll("image")];
    const hrefs = [...new Set(images.map((image) => (
        image.getAttribute("href")
        || image.getAttributeNS("http://www.w3.org/1999/xlink", "href")
    )).filter((href) => href && !href.startsWith("data:")))];
    const embeddedAssets = new Map(await Promise.all(hrefs.map(async (href) => {
        const response = await fetch(href);
        if (!response.ok) throw new Error(`Could not embed ${href} in the SVG export.`);
        return [href, await blobAsDataUrl(await response.blob())];
    })));
    for (const image of images) {
        const href = image.getAttribute("href")
            || image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        const dataUrl = embeddedAssets.get(href);
        if (!dataUrl) continue;
        image.setAttribute("href", dataUrl);
        image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", dataUrl);
    }

    const viewBox = String(clone.getAttribute("viewBox") || "0 0 1200 700")
        .split(/\s+/)
        .map(Number);
    if (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
        throw new Error("The diagram has an invalid SVG view box.");
    }
    const maximumWidthCm = 17.1;
    const maximumHeightCm = 23.3;
    let paperWidthCm = maximumWidthCm;
    let paperHeightCm = paperWidthCm * viewBox[3] / viewBox[2];
    if (paperHeightCm > maximumHeightCm) {
        paperHeightCm = maximumHeightCm;
        paperWidthCm = paperHeightCm * viewBox[2] / viewBox[3];
    }
    clone.setAttribute("width", `${paperWidthCm.toFixed(2)}cm`);
    clone.setAttribute("height", `${paperHeightCm.toFixed(2)}cm`);
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.setAttribute("data-paper-width", `${paperWidthCm.toFixed(2)} cm`);
    clone.setAttribute("data-paper-height", `${paperHeightCm.toFixed(2)} cm`);
    clone.setAttribute("data-export", "RSC Nanoscale double-column figure");
    const background = svgElement("rect", {
        x: viewBox[0],
        y: viewBox[1],
        width: viewBox[2],
        height: viewBox[3],
        fill: "#ffffff",
    });
    const style = svgElement("style", {}, PAPER_SVG_STYLE);
    const metadata = svgElement("metadata", {}, `RSC Nanoscale figure; ${paperWidthCm.toFixed(2)} cm x ${paperHeightCm.toFixed(2)} cm; editable vector master.`);
    const titleNode = svgElement("title", {}, title || "Skyrmion benchmark diagram");
    const descriptionNode = svgElement("desc", {}, description || "Vector diagram generated by the Skyrmion Verilog Mapper.");
    clone.insertBefore(background, clone.firstChild);
    clone.insertBefore(style, background);
    clone.insertBefore(descriptionNode, style);
    clone.insertBefore(titleNode, descriptionNode);
    clone.insertBefore(metadata, titleNode);
    const serialized = new XMLSerializer().serializeToString(clone);
    return {
        svgText: `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`,
        viewBox,
        paperWidthCm,
        paperHeightCm,
    };
}

async function downloadDiagramSvg(sourceSvg, fileName, options = {}) {
    const paper = await buildPaperSvg(sourceSvg, options);
    download(fileName, "image/svg+xml;charset=utf-8", paper.svgText);
}

function loadSvgImage(svgText) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => resolve({ image, url });
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Safari could not rasterize the paper SVG."));
        };
        image.src = url;
    });
}

async function downloadDiagramTiff(sourceSvg, fileName, options = {}) {
    const dpi = 600;
    const paper = await buildPaperSvg(sourceSvg, options);
    const pixelWidth = Math.round(paper.paperWidthCm / 2.54 * dpi);
    const pixelHeight = Math.round(paper.paperHeightCm / 2.54 * dpi);
    if (pixelWidth * pixelHeight > 24000000) {
        throw new Error("This diagram is too tall for safe 600 dpi browser export. Use the vector SVG or reduce the displayed network.");
    }
    const { image, url } = await loadSvgImage(paper.svgText);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Safari could not create the 600 dpi export canvas.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pixelWidth, pixelHeight);
        context.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        const rgba = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
        const tiffBytes = encodeRgbaToTiff(pixelWidth, pixelHeight, rgba, dpi);
        downloadBlob(fileName, new Blob([tiffBytes], { type: "image/tiff" }));
    } finally {
        URL.revokeObjectURL(url);
    }
}

function exportRtlSvg() {
    if (!latestResult) return;
    ui.downloadRtlSvg.disabled = true;
    downloadDiagramSvg(ui.rtlGraph, `${latestResult.netlist.topModule}-rtl-schematic-rsc.svg`, {
        title: `${latestResult.netlist.topModule} RTL schematic`,
        description: "Yosys pre-mapping RTL operators with collapsed bus connections and state boundaries.",
    })
        .then(() => setStatus("Paper-ready RTL SVG exported.", "success"))
        .catch((error) => setStatus(error.message || String(error), "error"))
        .finally(() => { ui.downloadRtlSvg.disabled = false; });
}

function exportNetworkSvg() {
    if (!latestResult) return;
    const fullDesign = ui.networkViewMode?.value === "full";
    const viewSlug = fullDesign ? "full-design" : "critical-path";
    const viewTitle = fullDesign ? "full mapped skyrmion design" : "mapped skyrmion critical path";
    const viewDescription = fullDesign
        ? "All technology-mapped gates and synthesized connections represented by joined skyrmion geometries; the critical path is highlighted."
        : "Technology-mapped critical-path gates represented by a compact chain of joined skyrmion geometries.";
    ui.downloadNetworkSvg.disabled = true;
    downloadDiagramSvg(ui.graph, `${latestResult.netlist.topModule}-skyrmion-${viewSlug}-rsc.svg`, {
        title: `${latestResult.netlist.topModule} ${viewTitle}`,
        description: viewDescription,
    })
        .then(() => setStatus("Paper-ready skyrmion-network SVG exported with embedded gate assets.", "success"))
        .catch((error) => setStatus(error.message || String(error), "error"))
        .finally(() => { ui.downloadNetworkSvg.disabled = false; });
}

function exportRtlTiff() {
    if (!latestResult) return;
    ui.downloadRtlTiff.disabled = true;
    setStatus("Rendering the RTL schematic at 600 dpi…", "working");
    downloadDiagramTiff(ui.rtlGraph, `${latestResult.netlist.topModule}-rtl-schematic-rsc-600dpi.tiff`, {
        title: `${latestResult.netlist.topModule} RTL schematic`,
        description: "Yosys pre-mapping RTL operators with collapsed bus connections and state boundaries.",
    })
        .then(() => setStatus("600 dpi RGB RTL TIFF exported at journal column dimensions.", "success"))
        .catch((error) => setStatus(error.message || String(error), "error"))
        .finally(() => { ui.downloadRtlTiff.disabled = false; });
}

function exportNetworkTiff() {
    if (!latestResult) return;
    const fullDesign = ui.networkViewMode?.value === "full";
    const viewSlug = fullDesign ? "full-design" : "critical-path";
    const viewTitle = fullDesign ? "full mapped skyrmion design" : "mapped skyrmion critical path";
    const viewDescription = fullDesign
        ? "All technology-mapped gates and synthesized connections represented by joined skyrmion geometries; the critical path is highlighted."
        : "Technology-mapped critical-path gates represented by a compact chain of joined skyrmion geometries.";
    ui.downloadNetworkTiff.disabled = true;
    setStatus("Rendering the skyrmion network at 600 dpi…", "working");
    downloadDiagramTiff(ui.graph, `${latestResult.netlist.topModule}-skyrmion-${viewSlug}-rsc-600dpi.tiff`, {
        title: `${latestResult.netlist.topModule} ${viewTitle}`,
        description: viewDescription,
    })
        .then(() => setStatus("600 dpi RGB skyrmion-network TIFF exported at journal column dimensions.", "success"))
        .catch((error) => setStatus(error.message || String(error), "error"))
        .finally(() => { ui.downloadNetworkTiff.disabled = false; });
}

function downloadJsonReport() {
    if (!latestResult) return;
    const payload = {
        generatedAt: new Date().toISOString(),
        sourceVerilog: latestSource,
        ...latestResult,
    };
    download(`${latestResult.netlist.topModule}-skyrmion-report.json`, "application/json", JSON.stringify(payload, null, 2));
}

function downloadCsvReport() {
    if (!latestResult) return;
    const { analysis } = latestResult;
    const rows = [
        ["Component", "Count", "Magnetic energy (fJ)", "Joule energy (fJ)", "Total energy (fJ)", "CP delay (ns)"],
        ["Gates", analysis.mappedGateCount, analysis.energy.gates.magneticAverageFJ, analysis.energy.gates.jouleFJ, analysis.energy.gates.totalAverageFJ, analysis.timing.gateDelayNS],
        ["Straight racetracks", analysis.netCount, analysis.energy.racetracks.magneticFJ, analysis.energy.racetracks.jouleFJ, analysis.energy.racetracks.totalFJ, analysis.timing.racetrackDelayNS],
        ["L-bends", analysis.bendCount, analysis.energy.bends.magneticFJ, analysis.energy.bends.jouleFJ, analysis.energy.bends.totalFJ, analysis.timing.bendDelayNS],
        ["System total", analysis.mappedGateCount + analysis.netCount + analysis.bendCount, analysis.energy.totalMagneticAverageFJ, analysis.energy.totalJouleFJ, analysis.energy.totalEnergyFJ, analysis.timing.criticalPathDelayNS],
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    download(`${latestResult.netlist.topModule}-skyrmion-report.csv`, "text/csv", csv);
}

function recreate() {
    if (!latestResult) return;
    try {
        const summary = recreateNetlistInEditor(latestResult.netlist);
        ui.editorDetails.open = true;
        ui.editorDetails.scrollIntoView({ behavior: "smooth", block: "start" });
        const truncation = summary.truncated
            ? ` First ${summary.recreatedGateTiles} of ${summary.totalAvailableGateTiles} tiles were loaded.`
            : ` ${summary.recreatedGateTiles} gate tiles were loaded.`;
        setStatus(`Skyrmion geometries recreated in the editor.${truncation} Routing remains heuristic.`, "success");
    } catch (error) {
        setStatus(error.message || String(error), "error");
    }
}

async function checkBackend() {
    try {
        const response = await fetch("/api/health");
        const payload = await response.json();
        if (!payload.ok) throw new Error(payload.error || "Health check failed.");
        ui.backend.textContent = `Yosys ready · ${payload.modelVersion}`;
        ui.backend.dataset.kind = "ready";
    } catch {
        ui.backend.textContent = "Backend unavailable — start with npm start";
        ui.backend.dataset.kind = "error";
    }
}

export function initVerilogImport() {
    Object.assign(ui, {
        file: byId("verilogFile"),
        source: byId("verilogSource"),
        topModule: byId("topModule"),
        currentDensity: byId("currentDensity"),
        analyze: byId("analyzeVerilog"),
        loadExample: byId("loadExample"),
        exampleSelect: byId("exampleSelect"),
        status: byId("importStatus"),
        backend: byId("backendStatus"),
        results: byId("analysisResults"),
        summary: byId("analysisSummary"),
        metrics: byId("metricCards"),
        gateCounts: byId("gateCountsBody"),
        energyBody: byId("energyBody"),
        warnings: byId("analysisWarnings"),
        rtlGraph: byId("rtlGraph"),
        rtlGraphNote: byId("rtlGraphNote"),
        graph: byId("netlistGraph"),
        graphNote: byId("graphNote"),
        networkViewMode: byId("networkViewMode"),
        recreate: byId("recreateDesign"),
        downloadJson: byId("downloadJsonReport"),
        downloadCsv: byId("downloadCsvReport"),
        downloadRtlSvg: byId("downloadRtlSvg"),
        downloadRtlTiff: byId("downloadRtlTiff"),
        downloadNetworkSvg: byId("downloadNetworkSvg"),
        downloadNetworkTiff: byId("downloadNetworkTiff"),
        editorDetails: byId("editorDetails"),
    });

    ui.file.addEventListener("change", () => readSelectedFile().catch((error) => setStatus(error.message, "error")));
    ui.analyze.addEventListener("click", analyze);
    ui.loadExample.addEventListener("click", () => {
        loadSelectedExample().catch((error) => setStatus(error.message, "error"));
    });
    ui.currentDensity.addEventListener("input", scheduleCurrentDensityRecompute);
    ui.currentDensity.addEventListener("change", commitCurrentDensityRecompute);
    ui.recreate.addEventListener("click", recreate);
    ui.downloadJson.addEventListener("click", downloadJsonReport);
    ui.downloadCsv.addEventListener("click", downloadCsvReport);
    ui.downloadRtlSvg.addEventListener("click", exportRtlSvg);
    ui.downloadRtlTiff.addEventListener("click", exportRtlTiff);
    ui.downloadNetworkSvg.addEventListener("click", exportNetworkSvg);
    ui.downloadNetworkTiff.addEventListener("click", exportNetworkTiff);
    ui.networkViewMode.addEventListener("change", () => {
        if (latestResult) renderGraph(latestResult.netlist, latestResult.analysis);
    });
    checkBackend();

    window.__skyrmionApp = {
        analyze,
        getLatestResult: () => latestResult,
        exampleCatalog,
        model: MODEL,
    };
}
