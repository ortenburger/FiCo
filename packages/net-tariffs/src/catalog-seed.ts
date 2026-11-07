import type { NetProduct } from "./types.js";

/**
 * Curated seed catalogs used when partner APIs are unavailable / unconfigured.
 * Representative Nettoprodukte lines from public partner positioning
 * (HonorarKonzept / con.fee) — not a live inventory.
 */

export const HONORARKONZEPT_SEED: NetProduct[] = [
  {
    id: "hk-mylife-invest",
    provider: "HONORARKONZEPT",
    carrierName: "myLife Lebensversicherung AG",
    productName: "myLife Invest",
    line: "INVESTMENT_WRAPPER",
    isNet: true,
    notes: "Depot + Police hybrid; exclusive via HonorarKonzept",
    partnerDeepLink: "https://www.honorarkonzept.de/nettoprodukte.html",
  },
  {
    id: "hk-mylife-rente-netto",
    provider: "HONORARKONZEPT",
    carrierName: "myLife Lebensversicherung AG",
    productName: "myLife Fondsrente Netto",
    line: "PENSION_PRIVATE",
    isNet: true,
    partnerDeepLink: "https://www.honorarkonzept.de/nettoprodukte.html",
  },
  {
    id: "hk-allianz-bu-netto",
    provider: "HONORARKONZEPT",
    carrierName: "Allianz Lebensversicherung",
    productName: "Allianz BU Netto (Sondervertrieb)",
    line: "BU_DISABILITY",
    isNet: true,
    partnerDeepLink: "https://www.honorarkonzept.de/nettoprodukte.html",
  },
  {
    id: "hk-term-life-netto",
    provider: "HONORARKONZEPT",
    carrierName: "Partner carriers (HK panel)",
    productName: "Risikoleben Nettotarif",
    line: "TERM_LIFE",
    isNet: true,
    partnerDeepLink: "https://www.honorarkonzept.de/nettoprodukte.html",
  },
];

export const CONFEE_SEED: NetProduct[] = [
  {
    id: "cf-weltmarkt-police",
    provider: "CONFEE",
    carrierName: "con.fee panel",
    productName: "con.fee Weltmarkt-Police",
    line: "PENSION_PRIVATE",
    isNet: true,
    notes: "Cost-optimized, state-protected net wrapper",
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
  {
    id: "cf-netto-depot",
    provider: "CONFEE",
    carrierName: "con.fee Netto-Depotplattform",
    productName: "con.fee Nettodepot (Fondsbanken)",
    line: "INVESTMENT_WRAPPER",
    isNet: true,
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
  {
    id: "cf-nucleus-protectinvest",
    provider: "CONFEE",
    carrierName: "Nucleus Life AG",
    productName: "ProtectInvest Nettotarif",
    line: "INVESTMENT_WRAPPER",
    isNet: true,
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
  {
    id: "cf-leben-rente-panel",
    provider: "CONFEE",
    carrierName: "con.fee life panel (100+ net tariffs)",
    productName: "Lebens-/Rentenversicherung Nettotarif",
    line: "PENSION_PRIVATE",
    isNet: true,
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
  {
    id: "cf-shu-netto",
    provider: "CONFEE",
    carrierName: "con.fee SHU panel (~90 tariffs)",
    productName: "Sach/Haftpflicht/Unfall Nettotarif",
    line: "PROPERTY_CASUALTY",
    isNet: true,
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
  {
    id: "cf-rechtsschutz-netto",
    provider: "CONFEE",
    carrierName: "con.fee panel",
    productName: "Rechtsschutz Nettotarif",
    line: "LEGAL_PROTECTION",
    isNet: true,
    partnerDeepLink: "https://www.confee.de/produkte/",
  },
];

export function filterCatalog(
  products: NetProduct[],
  query: {
    line?: string;
    carrierName?: string;
    search?: string;
    limit?: number;
  } = {},
): NetProduct[] {
  let out = products;
  if (query.line) out = out.filter((p) => p.line === query.line);
  if (query.carrierName) {
    const c = query.carrierName.toLowerCase();
    out = out.filter((p) => p.carrierName.toLowerCase().includes(c));
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    out = out.filter(
      (p) =>
        p.productName.toLowerCase().includes(s) ||
        p.carrierName.toLowerCase().includes(s) ||
        (p.tariffCode?.toLowerCase().includes(s) ?? false),
    );
  }
  if (query.limit && query.limit > 0) out = out.slice(0, query.limit);
  return out;
}
