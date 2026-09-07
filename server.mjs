import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeSkyrmionNetlist, MODEL } from "./js/skyrmionCostModel.js";

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const YOSYS_BINARY = process.env.YOSYS_BINARY || "yosys";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".md": "text/markdown; charset=utf-8",
    ".v": "text/plain; charset=utf-8",
    ".sv": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
    });
    response.end(body);
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds the 2 MB limit.");
        chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(text || "{}");
}

function runProcess(command, args, options = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            if (!settled) {
                settled = true;
                rejectPromise(new Error(`Process timed out after ${options.timeoutMS || 20000} ms.`));
            }
        }, options.timeoutMS || 20000);

        const append = (current, chunk) => {
            const next = current + chunk.toString("utf8");
            return next.length > 200000 ? next.slice(-200000) : next;
        };
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
        child.on("error", (error) => {
            clearTimeout(timeout);
            if (!settled) {
                settled = true;
                rejectPromise(error);
            }
        });
        child.on("close", (code) => {
            clearTimeout(timeout);
            if (settled) return;
            settled = true;
            if (code === 0) resolvePromise({ stdout, stderr });
            else rejectPromise(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}.`));
        });
    });
}

function normalizeCellType(sourceType, mode = "mapped") {
    const raw = String(sourceType || "");
    if (/DFF|LATCH|FLIPFLOP|_FF_/i.test(raw)) {
        return { gateType: "STATE", sequential: true };
    }
    let normalizedType = raw;
    if (normalizedType.startsWith("$_") && normalizedType.endsWith("_")) {
        normalizedType = normalizedType.slice(2, -1);
    }
    normalizedType = normalizedType.replace(/^\$/, "").toUpperCase();
    const rtlAliases = {
        LOGIC_AND: "AND",
        LOGIC_OR: "OR",
        LOGIC_NOT: "NOT",
        PMUX: "MUX",
        BMUX: "MUX",
        DEMUX: "DEMUX",
        SHIFTX: "SHIFT",
        REDUCE_AND: "REDUCE AND",
        REDUCE_OR: "REDUCE OR",
        REDUCE_XOR: "REDUCE XOR",
        REDUCE_XNOR: "REDUCE XNOR",
        REDUCE_BOOL: "REDUCE BOOL",
        EQX: "EQ",
        NEX: "NE",
    };
    const aliases = mode === "rtl"
        ? { BUF: "BUFFER", INV: "NOT", ...rtlAliases }
        : { BUF: "BUFFER", INV: "NOT" };
    return { gateType: aliases[normalizedType] || normalizedType, sequential: false };
}

function inferPortDirection(cell, portName) {
    const declared = cell.port_directions?.[portName];
    if (declared) return declared;
    if (/^(Y|Q|O|OUT|COUT)$/i.test(portName)) return "output";
    return "input";
}

function normalizeYosysNetlist(design, requestedTop = "", mode = "mapped") {
    const moduleEntries = Object.entries(design.modules || {});
    if (moduleEntries.length === 0) throw new Error("Yosys produced no modules.");
    const topEntry = moduleEntries.find(([name, module]) => (
        name === requestedTop || Number(module.attributes?.top) === 1
    )) || moduleEntries[0];
    const [topModule, module] = topEntry;

    const ports = Object.entries(module.ports || {}).map(([name, port]) => ({
        name,
        direction: port.direction,
        bits: port.bits || [],
    }));
    const cells = Object.entries(module.cells || {}).map(([id, cell]) => {
        const type = normalizeCellType(cell.type, mode);
        const inputPins = [];
        const outputPins = [];
        for (const [portName, bits] of Object.entries(cell.connections || {})) {
            const pin = { name: portName, bits: bits || [] };
            if (inferPortDirection(cell, portName) === "output") outputPins.push(pin);
            else inputPins.push(pin);
        }
        return {
            id,
            sourceType: cell.type,
            gateType: type.gateType,
            sequential: type.sequential,
            inputPins,
            outputPins,
            inputBits: inputPins.flatMap((pin) => pin.bits),
            outputBits: outputPins.flatMap((pin) => pin.bits),
            attributes: cell.attributes || {},
        };
    });

    let sinkConnections = 0;
    for (const cell of cells) {
        sinkConnections += cell.inputBits.filter((bit) => Number.isInteger(bit)).length;
    }
    for (const port of ports.filter((candidate) => candidate.direction === "output")) {
        sinkConnections += port.bits.filter((bit) => Number.isInteger(bit)).length;
    }

    const bitNameByBit = new Map();
    for (const [name, net] of Object.entries(module.netnames || {})) {
        for (const bit of (net.bits || []).filter((candidate) => Number.isInteger(candidate))) {
            if (!bitNameByBit.has(bit)) bitNameByBit.set(bit, name);
        }
    }

    const driverByBit = new Map();
    for (const port of ports.filter((candidate) => candidate.direction === "input")) {
        for (const bit of port.bits.filter((candidate) => Number.isInteger(candidate))) {
            driverByBit.set(bit, `input:${port.name}`);
        }
    }
    for (const cell of cells) {
        for (const bit of cell.outputBits.filter((candidate) => Number.isInteger(candidate))) {
            driverByBit.set(bit, `cell:${cell.id}`);
        }
    }
    const edges = [];
    const seenEdges = new Set();
    const addEdge = (source, target, bit) => {
        if (!source) return;
        const key = `${source}|${target}|${bit}`;
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        edges.push({ source, target, bit, signal: bitNameByBit.get(bit) || `n${bit}` });
    };
    for (const cell of cells) {
        for (const bit of cell.inputBits.filter((candidate) => Number.isInteger(candidate))) {
            addEdge(driverByBit.get(bit), `cell:${cell.id}`, bit);
        }
    }
    for (const port of ports.filter((candidate) => candidate.direction === "output")) {
        for (const bit of port.bits.filter((candidate) => Number.isInteger(candidate))) {
            addEdge(driverByBit.get(bit), `output:${port.name}`, bit);
        }
    }

    return {
        topModule,
        ports,
        cells,
        edges,
        netCount: Object.keys(module.netnames || {}).length,
        sinkConnections,
        sourceModuleCount: moduleEntries.length,
    };
}

function yosysScript(topModule) {
    const safeTop = String(topModule || "").trim();
    if (safeTop && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(safeTop)) {
        throw new Error("Top module must be a simple Verilog identifier.");
    }
    const hierarchy = safeTop
        ? `hierarchy -check -top ${safeTop}`
        : "hierarchy -check -auto-top";
    const synth = safeTop
        ? `synth -top ${safeTop} -flatten -noabc`
        : "synth -flatten -noabc";
    return [
        "read_verilog -sv design.v",
        hierarchy,
        "flatten",
        "proc",
        "opt",
        "memory",
        "opt",
        "clean",
        "write_json rtl.json",
        synth,
        "abc -g AND,NAND,OR,NOR,XOR,XNOR",
        "clean -purge",
        "write_json netlist.json",
        "",
    ].join("\n");
}

export async function getYosysVersion() {
    const result = await runProcess(YOSYS_BINARY, ["-V"], { timeoutMS: 5000 });
    return (result.stdout || result.stderr).trim();
}

export async function analyzeVerilog({ verilog, topModule = "", currentDensityAM2 }) {
    if (typeof verilog !== "string" || verilog.trim().length === 0) {
        throw new Error("Verilog source is empty.");
    }
    const currentDensity = Number(currentDensityAM2 || MODEL.referenceCurrentDensityAM2);
    if (!Number.isFinite(currentDensity)
        || currentDensity < MODEL.currentDensityMinAM2
        || currentDensity > MODEL.currentDensityMaxAM2) {
        throw new Error("Current density must stay inside 2.2e11–3.6e11 A/m².");
    }

    const workDir = await mkdtemp(join(tmpdir(), "skyrmion-logic-"));
    try {
        await writeFile(join(workDir, "design.v"), verilog, "utf8");
        await writeFile(join(workDir, "flow.ys"), yosysScript(topModule), "utf8");
        const processResult = await runProcess(YOSYS_BINARY, ["-q", "-s", "flow.ys"], {
            cwd: workDir,
            timeoutMS: 30000,
        });
        const rtlDesign = JSON.parse(await readFile(join(workDir, "rtl.json"), "utf8"));
        const design = JSON.parse(await readFile(join(workDir, "netlist.json"), "utf8"));
        const rtlNetlist = normalizeYosysNetlist(rtlDesign, topModule, "rtl");
        const netlist = normalizeYosysNetlist(design, topModule, "mapped");
        const analysis = analyzeSkyrmionNetlist(netlist, currentDensity);
        return {
            yosysVersion: await getYosysVersion(),
            yosysWarnings: processResult.stderr
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => /warning/i.test(line))
                .slice(0, 30),
            rtlNetlist,
            netlist,
            analysis,
        };
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
}

async function serveStatic(request, response) {
    const url = new URL(request.url, "http://localhost");
    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const normalizedPath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = resolve(APP_ROOT, `.${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`);
    const resolvedRoot = resolve(APP_ROOT);
    if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${sep}`)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }
    try {
        const info = await stat(filePath);
        if (!info.isFile()) throw new Error("Not a file");
        const content = await readFile(filePath);
        response.writeHead(200, {
            "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
            "Content-Length": content.length,
        });
        if (request.method === "HEAD") response.end();
        else response.end(content);
    } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
    }
}

export function createAppServer() {
    return createServer(async (request, response) => {
        try {
            if (request.method === "GET" && request.url === "/api/health") {
                sendJson(response, 200, {
                    ok: true,
                    yosysVersion: await getYosysVersion(),
                    modelVersion: "benchmark-paper-rho27-v1",
                });
                return;
            }
            if (request.method === "POST" && request.url === "/api/analyze-verilog") {
                const payload = await readJsonBody(request);
                const result = await analyzeVerilog(payload);
                sendJson(response, 200, { ok: true, ...result });
                return;
            }
            if (request.method !== "GET" && request.method !== "HEAD") {
                sendJson(response, 405, { ok: false, error: "Method not allowed." });
                return;
            }
            await serveStatic(request, response);
        } catch (error) {
            const message = String(error?.message || error).replaceAll(APP_ROOT, "<app>");
            sendJson(response, 400, { ok: false, error: message });
        }
    });
}

const isDirectRun = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
    const server = createAppServer();
    server.on("error", (error) => {
        console.error(`Could not start the local Skyrmion server: ${error.message}`);
        process.exitCode = 1;
    });
    server.listen(DEFAULT_PORT, "127.0.0.1", () => {
        console.log(`Skyrmion Logic App: http://127.0.0.1:${DEFAULT_PORT}`);
    });
}
