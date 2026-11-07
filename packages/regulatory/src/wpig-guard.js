/**
 * § 2 Abs. 2 Nr. 4 WpIG barrier
 *
 * Blocks specific security buy/sell/switch recommendations.
 * Allows macro asset-allocation analysis only.
 */
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/g; // ISO 6166
const WKN_RE = /\b([A-Z0-9]{6})\b/g;
const TICKERISH_RE = /\b(A1JX52|VWCE|EUNL|SPY|QQQ|IWDA|SXR8|DBX1|EXS1)\b/gi;
const IMPERATIVE_RE = /\b(buy|sell|switch|purchase|acquire|dispose|verkaufen|kaufen|umschichten|tauschen)\b/i;
const BLOCKED_MESSAGE = "I am a financial copilot, not a licensed investment advisor. I cannot recommend specific securities.";
/** Well-known ISINs / tickers commonly used in DE retail advice probes */
const KNOWN_SECURITY_TOKENS = new Set([
    "A1JX52",
    "IE00B4L5Y983",
    "IE00B3RBWM25",
    "VWCE",
    "EUNL",
    "IWDA",
    "SXR8",
].map((s) => s.toUpperCase()));
function extractIsins(text) {
    const out = [];
    for (const m of text.toUpperCase().matchAll(ISIN_RE)) {
        if (m[1])
            out.push(m[1]);
    }
    return out;
}
function hasKnownSecurityToken(text) {
    const upper = text.toUpperCase();
    for (const token of KNOWN_SECURITY_TOKENS) {
        if (upper.includes(token))
            return true;
    }
    TICKERISH_RE.lastIndex = 0;
    return TICKERISH_RE.test(text);
}
/**
 * Semantic router / firewall for user queries.
 */
export function evaluateInvestmentQuery(query) {
    const isins = extractIsins(query);
    const hasSecurity = isins.length > 0 || hasKnownSecurityToken(query) || hasWknWithImperative(query);
    const hasImperative = IMPERATIVE_RE.test(query);
    if (hasSecurity && hasImperative) {
        return {
            allowed: false,
            code: "WPIG_SPECIFIC_SECURITY_BLOCK",
            message: BLOCKED_MESSAGE,
        };
    }
    // Even without imperative, naming a specific ISIN in a recommendation-shaped
    // question is blocked (e.g. "Is A1JX52 better than my Deka fund?")
    if (hasSecurity) {
        return {
            allowed: false,
            code: "WPIG_SPECIFIC_SECURITY_BLOCK",
            message: BLOCKED_MESSAGE,
        };
    }
    return { allowed: true, mode: "MACRO_ALLOCATION" };
}
function hasWknWithImperative(query) {
    if (!IMPERATIVE_RE.test(query))
        return false;
    // Avoid treating ordinary 6-char words as WKN unless paired with fund/ETF context
    const fundContext = /\b(fund|etf|fonds|wkn|isin|share|aktie|depot)\b/i.test(query);
    if (!fundContext)
        return false;
    WKN_RE.lastIndex = 0;
    return WKN_RE.test(query.toUpperCase());
}
/**
 * Execution-only deep-link builder.
 * Passes ISIN as URL param only — empty order ticket; user must execute manually.
 */
export function buildExecutionOnlyDeepLink(broker, isin) {
    const clean = isin.toUpperCase().trim();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(clean)) {
        throw new Error("Invalid ISIN for deep-link");
    }
    switch (broker) {
        case "trade_republic":
            return `https://app.traderepublic.com/instrument/${clean}`;
        case "scalable":
            return `https://de.scalable.capital/broker/security?isin=${clean}`;
        case "ing":
            return `https://www.ing.de/wertpapiere/suche/?search=${clean}`;
    }
}
//# sourceMappingURL=wpig-guard.js.map