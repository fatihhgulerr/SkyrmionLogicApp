function withoutComments(source) {
    return String(source || "")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n\r]*/g, " ");
}

export function moduleNamesInSource(source) {
    const names = [];
    const seen = new Set();
    const pattern = /\bmodule\s+(?:automatic\s+|static\s+)?([A-Za-z_][A-Za-z0-9_$]*)/g;
    for (const match of withoutComments(source).matchAll(pattern)) {
        if (seen.has(match[1])) continue;
        seen.add(match[1]);
        names.push(match[1]);
    }
    return names;
}

export function suggestedTopModule(source) {
    const names = moduleNamesInSource(source);
    return names.length === 1 ? names[0] : "";
}

export function validRequestedTopModule(source, requestedTop) {
    const requested = String(requestedTop || "").trim();
    if (!requested) return "";
    return moduleNamesInSource(source).includes(requested) ? requested : "";
}
