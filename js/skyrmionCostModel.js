export const MODEL_VERSION = "benchmark-paper-rho27-v4-teff2nm-velocity618";

export const MODEL = Object.freeze({
    resistivityOhmM: 27e-8,
    currentDensityMinAM2: 2.2e11,
    currentDensityMaxAM2: 3.6e11,
    referenceCurrentDensityAM2: 3.2e11,
    trackLengthM: 0.475e-6,
    trackWidthM: 0.05e-6,
    effectiveConductorThicknessM: 2.0e-9,
    bendsPerSink: 1.5,
    racetrackMagneticEnergyFJ: 0.0005,
    bendMagneticEnergyFJ: 0.0012,
    sequentialDelayNS: 12.0,
    // Supplied simulation fit: v = 6.18e-10 j in SI units.
    // Transport only; intrinsic gate energies and delays stay fixed.
    velocitySlopeMPerSPer1e11: 61.8,
    velocityInterceptMPerS: 0,
});

export const BASE_GATE_COSTS = Object.freeze({
    NOT:  { magneticAverageFJ: 0.00217, magneticWorstFJ: 0.00217, jouleFJ: 4.84, delayNS: 7.0 },
    NOR:  { magneticAverageFJ: 0.00776, magneticWorstFJ: 0.00886, jouleFJ: 9.89, delayNS: 9.3 },
    OR:   { magneticAverageFJ: 0.01167, magneticWorstFJ: 0.01180, jouleFJ: 20.5, delayNS: 13.85 },
    AND:  { magneticAverageFJ: 0.00753, magneticWorstFJ: 0.00768, jouleFJ: 12.0, delayNS: 9.55 },
    NAND: { magneticAverageFJ: 0.01138, magneticWorstFJ: 0.01250, jouleFJ: 19.6, delayNS: 17.15 },
});

const DECOMPOSITIONS = Object.freeze({
    XOR:  { AND: 2, OR: 1, NOT: 2, delayFactor: 2.1949 },
    XNOR: { AND: 2, OR: 1, NOT: 3, delayFactor: 2.7004 },
});

export const RECOGNIZED_GATES = Object.freeze([
    "NOT", "NOR", "OR", "AND", "NAND", "XOR", "XNOR",
]);

export function velocityMPerS(currentDensityAM2) {
    return (
        MODEL.velocitySlopeMPerSPer1e11 * (currentDensityAM2 / 1e11)
        + MODEL.velocityInterceptMPerS
    );
}

export function segmentDelayNS(pathLengthM, currentDensityAM2) {
    return pathLengthM / velocityMPerS(currentDensityAM2) * 1e9;
}

export function segmentJouleEnergyFJ(pathLengthM, currentDensityAM2) {
    const volumeM3 = pathLengthM * MODEL.trackWidthM * MODEL.effectiveConductorThicknessM;
    const pulseTimeS = pathLengthM / velocityMPerS(currentDensityAM2);
    return MODEL.resistivityOhmM * currentDensityAM2 ** 2 * volumeM3 * pulseTimeS * 1e15;
}

export function gateCost(gateType) {
    if (BASE_GATE_COSTS[gateType]) {
        return { ...BASE_GATE_COSTS[gateType], source: "paper_cost" };
    }

    const decomposition = DECOMPOSITIONS[gateType];
    if (!decomposition) return null;

    const componentNames = Object.keys(decomposition).filter((name) => name !== "delayFactor");
    const sum = (field) => componentNames.reduce(
        (total, name) => total + BASE_GATE_COSTS[name][field] * decomposition[name],
        0,
    );
    const maximumPrimitiveDelay = Math.max(
        ...componentNames.map((name) => BASE_GATE_COSTS[name].delayNS),
    );

    return {
        magneticAverageFJ: sum("magneticAverageFJ"),
        magneticWorstFJ: sum("magneticWorstFJ"),
        jouleFJ: sum("jouleFJ"),
        delayNS: maximumPrimitiveDelay * decomposition.delayFactor,
        source: "decomposed",
        decomposition: { ...decomposition },
    };
}

function numericBits(bits) {
    return (bits || []).filter((bit) => Number.isInteger(bit));
}

function analyzeCriticalPath(netlist, currentDensityAM2) {
    const cellsById = new Map(netlist.cells.map((cell) => [cell.id, cell]));
    const driverByBit = new Map();
    const inputPortByBit = new Map();

    for (const port of netlist.ports.filter((candidate) => candidate.direction === "input")) {
        for (const bit of numericBits(port.bits)) inputPortByBit.set(bit, port.name);
    }
    for (const cell of netlist.cells) {
        for (const bit of numericBits(cell.outputBits)) driverByBit.set(bit, cell.id);
    }

    const straightDelayNS = segmentDelayNS(MODEL.trackLengthM, currentDensityAM2);
    const bendPathLengthM = Math.PI / 4 * MODEL.trackLengthM;
    const bendDelayNS = segmentDelayNS(bendPathLengthM, currentDensityAM2);
    const connectionDelayNS = straightDelayNS + MODEL.bendsPerSink * bendDelayNS;
    const memo = new Map();
    const visiting = new Set();

    const visit = (cellId) => {
        if (memo.has(cellId)) return memo.get(cellId);
        if (visiting.has(cellId)) {
            throw new Error(`Combinational timing loop at ${cellId}; no finite critical path.`);
        }

        visiting.add(cellId);
        const cell = cellsById.get(cellId);
        if (!cell) {
            visiting.delete(cellId);
            return { totalNS: 0, gateNS: 0, straightNS: 0, bendNS: 0, path: [], level: 0 };
        }

        if (cell.sequential) {
            const result = {
                totalNS: MODEL.sequentialDelayNS,
                gateNS: MODEL.sequentialDelayNS,
                straightNS: 0,
                bendNS: 0,
                path: [cellId],
                level: 0,
            };
            visiting.delete(cellId);
            memo.set(cellId, result);
            return result;
        }

        let bestParent = {
            totalNS: 0,
            gateNS: 0,
            straightNS: 0,
            bendNS: 0,
            path: [],
            level: 0,
        };
        let hasConnectedInput = false;

        for (const bit of numericBits(cell.inputBits)) {
            const parentCellId = driverByBit.get(bit);
            if (parentCellId) {
                const parent = visit(parentCellId);
                const candidateTotal = parent.totalNS + connectionDelayNS;
                if (!hasConnectedInput || candidateTotal > bestParent.totalNS) {
                    bestParent = {
                        totalNS: candidateTotal,
                        gateNS: parent.gateNS,
                        straightNS: parent.straightNS + straightDelayNS,
                        bendNS: parent.bendNS + MODEL.bendsPerSink * bendDelayNS,
                        path: [...parent.path],
                        level: parent.level + 1,
                    };
                }
                hasConnectedInput = true;
            } else if (inputPortByBit.has(bit) && !hasConnectedInput) {
                bestParent = {
                    totalNS: connectionDelayNS,
                    gateNS: 0,
                    straightNS: straightDelayNS,
                    bendNS: MODEL.bendsPerSink * bendDelayNS,
                    path: [`INPUT:${inputPortByBit.get(bit)}`],
                    level: 0,
                };
                hasConnectedInput = true;
            }
        }

        const cost = gateCost(cell.gateType);
        const intrinsicDelayNS = cost?.delayNS || 0;
        const result = {
            totalNS: bestParent.totalNS + intrinsicDelayNS,
            gateNS: bestParent.gateNS + intrinsicDelayNS,
            straightNS: bestParent.straightNS,
            bendNS: bestParent.bendNS,
            path: [...bestParent.path, cellId],
            level: bestParent.level,
        };
        visiting.delete(cellId);
        memo.set(cellId, result);
        return result;
    };

    let critical = { totalNS: 0, gateNS: 0, straightNS: 0, bendNS: 0, path: [], level: 0 };
    // Populate all cell levels, and reject cycles even in disconnected logic.
    for (const cell of netlist.cells) visit(cell.id);
    const considerEndpoint = (bit, endpoint) => {
        const driver = driverByBit.get(bit);
        const parent = driver ? visit(driver) : {
            totalNS: 0, gateNS: 0, straightNS: 0, bendNS: 0,
            path: inputPortByBit.has(bit) ? [`INPUT:${inputPortByBit.get(bit)}`] : [], level: 0,
        };
        const candidate = {
            ...parent,
            totalNS: parent.totalNS + connectionDelayNS,
            straightNS: parent.straightNS + straightDelayNS,
            bendNS: parent.bendNS + MODEL.bendsPerSink * bendDelayNS,
            endpoint: { ...endpoint, bit },
        };
        if (candidate.totalNS > critical.totalNS) critical = candidate;
    };
    for (const port of netlist.ports.filter((p) => p.direction === "output")) {
        for (const bit of numericBits(port.bits)) considerEndpoint(bit, { type: "output", name: port.name });
    }
    for (const cell of netlist.cells.filter((c) => c.sequential)) {
        // Clock-tree propagation is not a data-path endpoint. D, enable and
        // reset/control arrivals are included; setup/recovery remain unmodeled.
        const pins = cell.inputPins || [{ name: "D", bits: cell.inputBits }];
        for (const pin of pins.filter((p) => !/^(C|CLK|CLOCK)$/i.test(p.name))) {
            for (const bit of numericBits(pin.bits)) considerEndpoint(bit, { type: "state", cellId: cell.id, pin: pin.name });
        }
    }

    return {
        ...critical,
        straightSegmentDelayNS: straightDelayNS,
        bendSegmentDelayNS: bendDelayNS,
        cellLevels: Object.fromEntries(
            [...memo.entries()].map(([cellId, result]) => [cellId, result.level]),
        ),
    };
}

export function analyzeSkyrmionNetlist(netlist, currentDensityAM2 = MODEL.referenceCurrentDensityAM2) {
    const currentDensity = Number(currentDensityAM2);
    if (!Number.isFinite(currentDensity)
        || currentDensity < MODEL.currentDensityMinAM2
        || currentDensity > MODEL.currentDensityMaxAM2) {
        throw new Error("Current density must stay inside 2.2e11–3.6e11 A/m².");
    }

    const gateCounts = Object.fromEntries(RECOGNIZED_GATES.map((gate) => [gate, 0]));
    let gateMagneticAverageFJ = 0;
    let gateMagneticWorstFJ = 0;
    let gateJouleFJ = 0;
    let mappedGateCount = 0;
    let sequentialCellCount = 0;
    const unsupportedCounts = {};

    for (const cell of netlist.cells) {
        if (cell.sequential) {
            sequentialCellCount += 1;
            continue;
        }
        const cost = gateCost(cell.gateType);
        if (!cost) {
            unsupportedCounts[cell.sourceType] = (unsupportedCounts[cell.sourceType] || 0) + 1;
            continue;
        }
        gateCounts[cell.gateType] += 1;
        mappedGateCount += 1;
        gateMagneticAverageFJ += cost.magneticAverageFJ;
        gateMagneticWorstFJ += cost.magneticWorstFJ;
        gateJouleFJ += cost.jouleFJ;
    }

    const netCount = Number(netlist.netCount || 0);
    const sinkConnections = Number(netlist.sinkConnections || 0);
    const bendCount = Math.trunc(sinkConnections * MODEL.bendsPerSink);
    const bendPathLengthM = Math.PI / 4 * MODEL.trackLengthM;
    const straightJouleFJ = segmentJouleEnergyFJ(MODEL.trackLengthM, currentDensity);
    const bendJouleFJ = segmentJouleEnergyFJ(bendPathLengthM, currentDensity);
    const racetrackMagneticFJ = netCount * MODEL.racetrackMagneticEnergyFJ;
    const racetrackJouleFJ = netCount * straightJouleFJ;
    const bendMagneticFJ = bendCount * MODEL.bendMagneticEnergyFJ;
    const bendTotalJouleFJ = bendCount * bendJouleFJ;
    const totalMagneticAverageFJ = gateMagneticAverageFJ + racetrackMagneticFJ + bendMagneticFJ;
    const totalJouleFJ = gateJouleFJ + racetrackJouleFJ + bendTotalJouleFJ;
    const totalEnergyFJ = totalMagneticAverageFJ + totalJouleFJ;
    const criticalPath = analyzeCriticalPath(netlist, currentDensity);
    const averagePowerUW = criticalPath.totalNS > 0 ? totalEnergyFJ / criticalPath.totalNS : null;

    const warnings = [];
    if (sequentialCellCount > 0) {
        warnings.push(`${sequentialCellCount} sequential/state cells are boundaries only and are excluded from energy.`);
    }
    const unsupportedCellCount = Object.values(unsupportedCounts).reduce((sum, count) => sum + count, 0);
    if (unsupportedCellCount > 0) {
        warnings.push(`${unsupportedCellCount} unsupported cells are excluded from gate energy.`);
    }
    warnings.push("Routing uses one straight track per unique sink-connected signal bit (including clock/control), with aliases deduplicated and buses expanded; floor(1.5 × sinks) bends. This is not placed-and-routed geometry.");
    warnings.push("Timing includes the final output/state connection and a 12 ns state-launch proxy; setup, clock distribution and synchronization are not physically calibrated.");

    return {
        modelVersion: MODEL_VERSION,
        currentDensityAM2: currentDensity,
        velocityMPerS: velocityMPerS(currentDensity),
        gateCounts,
        mappedGateCount,
        sequentialCellCount,
        unsupportedCounts,
        unsupportedCellCount,
        netCount,
        sinkConnections,
        bendCount,
        energy: {
            gates: {
                magneticAverageFJ: gateMagneticAverageFJ,
                magneticWorstFJ: gateMagneticWorstFJ,
                jouleFJ: gateJouleFJ,
                totalAverageFJ: gateMagneticAverageFJ + gateJouleFJ,
            },
            racetracks: {
                magneticFJ: racetrackMagneticFJ,
                jouleFJ: racetrackJouleFJ,
                totalFJ: racetrackMagneticFJ + racetrackJouleFJ,
                perSegmentJouleFJ: straightJouleFJ,
            },
            bends: {
                magneticFJ: bendMagneticFJ,
                jouleFJ: bendTotalJouleFJ,
                totalFJ: bendMagneticFJ + bendTotalJouleFJ,
                perBendJouleFJ: bendJouleFJ,
            },
            totalMagneticAverageFJ,
            totalJouleFJ,
            totalEnergyFJ,
            totalEnergyPJ: totalEnergyFJ / 1000,
        },
        timing: {
            criticalPathDelayNS: criticalPath.totalNS,
            gateDelayNS: criticalPath.gateNS,
            racetrackDelayNS: criticalPath.straightNS,
            bendDelayNS: criticalPath.bendNS,
            criticalPath: criticalPath.path,
            criticalEndpoint: criticalPath.endpoint || null,
            cellLevels: criticalPath.cellLevels,
            averagePowerUW,
        },
        warnings,
    };
}
