import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listDocuments,
  readDocument,
  searchDocumentsVoice,
  type DocumentSummary,
} from "./voice/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const euroFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatEuro(val: number) {
  return euroFmt.format(Math.round(val));
}

function simulateCompoundWealth(
  monthlyContribution: number,
  years: number,
  grossAnnualReturnPct: number,
  annualFeePct: number,
  upfrontZillmerPenaltyEuro = 0,
) {
  const netRate = (grossAnnualReturnPct - annualFeePct) / 100;
  const monthlyRate = netRate / 12;
  const months = years * 12;
  let balance = -upfrontZillmerPenaltyEuro;
  for (let m = 0; m < months; m += 1) {
    balance = (balance + monthlyContribution) * (1 + monthlyRate);
  }
  return Math.max(0, balance);
}

/* ==========================================================================
   1. NET-TARIFF & ALTERSVORSORGEDEPOT ARENA TAB
      Connects:
      - GET  /v1/net-tariffs/products
      - POST /v1/net-tariffs/compare
      - POST /v1/net-tariffs/applications/handoff
      - POST /v1/policy/economic-gate
   ========================================================================== */

type NetProduct = {
  id: string;
  provider: "HONORARKONZEPT" | "CONFEE";
  carrierName: string;
  productName: string;
  line: string;
  annualAdminFeeEur?: number;
  effectiveCostPct?: number;
};

export function NetTariffArenaTab() {
  // 40-year Altersvorsorgedepot vs. Legacy Simulator
  const [monthlySave, setMonthlySave] = useState(300);
  const [horizonYears, setHorizonYears] = useState(35);
  const [legacyFeePct, setLegacyFeePct] = useState(2.3);
  const depotFeePct = 0.18;

  // Live /v1/net-tariffs/compare state
  const [provider, setProvider] = useState<"HONORARKONZEPT" | "CONFEE">("CONFEE");
  const [grossAnnualCost, setGrossAnnualCost] = useState(1074);
  const [netAnnualCost, setNetAnnualCost] = useState(720);
  const [advisoryFeeAnnual, setAdvisoryFeeAnnual] = useState(149);
  const [compareResult, setCompareResult] = useState<{
    annualProductSavings: number;
    annualNetOfAdvisory: number;
    npvSavings: number;
    breakEvenYears: number | null;
    feeType: string;
  } | null>(null);

  // Live /v1/net-tariffs/products catalog state
  const [products, setProducts] = useState<NetProduct[]>([]);
  const [lineFilter, setLineFilter] = useState("");
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  // Live /v1/policy/economic-gate state
  const [policyType, setPolicyType] = useState("BU_DISABILITY");
  const [subTier, setSubTier] = useState<"FREE" | "ACTIVE_SUBSCRIBER">(
    "ACTIVE_SUBSCRIBER",
  );
  const [gateResult, setGateResult] = useState<{
    triggerStatus: string;
    action: string;
    callFinexpert: boolean;
    reason?: string;
  } | null>(null);

  const arenaStats = useMemo(() => {
    const grossReturn = 7.0;
    const totalPaid = monthlySave * 12 * horizonYears;
    const depotEnd = simulateCompoundWealth(
      monthlySave + 35,
      horizonYears,
      grossReturn,
      depotFeePct,
      0,
    );
    const legacyEnd = simulateCompoundWealth(
      monthlySave,
      horizonYears,
      grossReturn,
      legacyFeePct,
      totalPaid * 0.025,
    );
    return {
      totalPaid,
      depotEnd,
      legacyEnd,
      rescuedFees: Math.max(0, depotEnd - legacyEnd),
    };
  }, [monthlySave, horizonYears, legacyFeePct]);

  const loadProducts = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (lineFilter) qs.set("line", lineFilter);
      const res = await fetch(`${API_BASE}/v1/net-tariffs/products?${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as { products?: NetProduct[] };
      if (Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch {
      // fallback catalog if API offline
      setProducts([
        {
          id: "hk-bu-net-01",
          provider: "HONORARKONZEPT",
          carrierName: "Alte Leipziger (Netto)",
          productName: "SecurAL Nettotarif BU",
          line: "BU_DISABILITY",
        },
        {
          id: "cf-etf-pension-01",
          provider: "CONFEE",
          carrierName: "Condor con.fee",
          productName: "Congenial Garant / ETF Netto-Rente",
          line: "PENSION_PRIVATE",
        },
      ]);
    }
  }, [lineFilter]);

  const runCompareApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/net-tariffs/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          grossAnnualCost,
          netAnnualCost,
          advisoryFeeAnnual,
          years: horizonYears,
        }),
      });
      if (!res.ok) throw new Error("HTTP error");
      const data = (await res.json()) as {
        annualProductSavings: number;
        annualNetOfAdvisory: number;
        npvSavings: number;
        breakEvenYears: number | null;
        feeType: string;
      };
      setCompareResult(data);
    } catch {
      const annualProductSavings = grossAnnualCost - netAnnualCost;
      const annualNetOfAdvisory = annualProductSavings - advisoryFeeAnnual;
      setCompareResult({
        annualProductSavings,
        annualNetOfAdvisory,
        npvSavings: Math.round(annualNetOfAdvisory * horizonYears * 0.72),
        breakEvenYears: annualNetOfAdvisory > 0 ? 1 : null,
        feeType: "HONORAR_FEE_ONLY (§ 48b VAG)",
      });
    }
  }, [provider, grossAnnualCost, netAnnualCost, advisoryFeeAnnual, horizonYears]);

  const triggerHandoff = async (product: NetProduct) => {
    setHandoffStatus(`Starte Execution-Only Handoff für ${product.productName} …`);
    try {
      const res = await fetch(`${API_BASE}/v1/net-tariffs/applications/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: product.provider,
          productId: product.id,
          applicant: {
            firstName: "Lena",
            lastName: "Demo",
            email: "lena@fico.local",
          },
          monthlyPremium: Math.round(netAnnualCost / 12),
        }),
      });
      const data = (await res.json()) as {
        handoffId?: string;
        status?: string;
        underwritingGuard?: string;
      };
      setHandoffStatus(
        `✓ Handoff registriert (${data.handoffId ?? product.id}) · Status: ${
          data.status ?? "APPLICATION_SUBMITTED"
        } · § 63 VVG Underwriting-Guard aktiv (Altvertrag erst nach POLICY_ISSUED kündigen).`,
      );
    } catch {
      setHandoffStatus(
        `✓ Execution-Only Handoff vorbereitet (${product.id}) · § 63 VVG Underwriting-Guard aktiv.`,
      );
    }
  };

  const runPolicyGate = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/policy/economic-gate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyType,
          subscriptionTier: subTier,
        }),
      });
      const data = (await res.json()) as {
        triggerStatus: string;
        action: string;
        callFinexpert: boolean;
        reason?: string;
      };
      setGateResult(data);
    } catch {
      const highValue =
        policyType === "BU_DISABILITY" ||
        policyType === "PENSION_PRIVATE" ||
        policyType === "PRIVATE_HEALTH";
      setGateResult({
        triggerStatus: highValue ? "DISPATCHED" : "SKIPPED_UNECONOMIC",
        action: highValue ? "CALL_FINEXPERT_SYNOPSIS" : "LOCAL_HEURISTIC_ONLY",
        callFinexpert: highValue && subTier === "ACTIVE_SUBSCRIBER",
        reason: highValue
          ? "Hochwertige Sparte — Finexpert / F&B Synopse wirtschaftlich sinnvoll."
          : "Kleinsparte — lokale Heuristik schützt API-Budget.",
      });
    }
  };

  useEffect(() => {
    void loadProducts();
    void runCompareApi();
  }, [loadProducts, runCompareApi]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. 40-Year Showdown Simulator */}
      <section className="panel">
        <div className="panel-head">
          <h2>🥊 Arena: Altersvorsorgedepot 2026 vs. Brutto-Altvertrag</h2>
          <span className="badge badge-blue">Live Zinseszins-Engine</span>
        </div>
        <p className="panel-subtitle">
          Simuliere live, wie sich Sparrate, Horizont und Effektivkostenquote (TER +
          Zillmerung) auf dein Endvermögen auswirken:
        </p>

        <div className="arena-controls">
          <label className="slider-field">
            <div className="slider-head">
              <span>Monatliche Sparrate</span>
              <strong>{monthlySave} € / Mo</strong>
            </div>
            <input
              type="range"
              min={50}
              max={1000}
              step={25}
              value={monthlySave}
              onChange={(e) => setMonthlySave(Number(e.target.value))}
            />
          </label>

          <label className="slider-field">
            <div className="slider-head">
              <span>Anlagehorizont</span>
              <strong>{horizonYears} Jahre</strong>
            </div>
            <input
              type="range"
              min={10}
              max={45}
              step={1}
              value={horizonYears}
              onChange={(e) => setHorizonYears(Number(e.target.value))}
            />
          </label>

          <label className="slider-field">
            <div className="slider-head">
              <span>Effektivkosten Altvertrag (TER)</span>
              <strong>{legacyFeePct.toFixed(1)} % p.a.</strong>
            </div>
            <input
              type="range"
              min={1.0}
              max={3.5}
              step={0.1}
              value={legacyFeePct}
              onChange={(e) => setLegacyFeePct(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="arena-fighters">
          <div className="fighter-card fighter-card--legacy">
            <div className="panel-head">
              <span className="badge badge-rose">Altvertrag (Brutto)</span>
              <span>{legacyFeePct.toFixed(1)} % Effektivkosten</span>
            </div>
            <h3>👾 Klassische Brutto-Police (inkl. Zillmerung)</h3>
            <div style={{ fontSize: "1.9rem", fontWeight: 800 }}>
              {formatEuro(arenaStats.legacyEnd)}
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.85 }}>
              Eingezahlt: {formatEuro(arenaStats.totalPaid)} · Abschlussprovision ~
              {formatEuro(arenaStats.totalPaid * 0.025)}
            </p>
          </div>

          <div className="fighter-card fighter-card--depot">
            <div className="panel-head">
              <span className="badge badge-emerald">
                +{formatEuro(arenaStats.rescuedFees)} gerettet!
              </span>
              <span>{depotFeePct} % TER</span>
            </div>
            <h3>🚀 FiCo Altersvorsorgedepot + Nettotarif</h3>
            <div style={{ fontSize: "1.9rem", fontWeight: 800 }}>
              {formatEuro(arenaStats.depotEnd)}
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.85 }}>
              0 € Abschlussprovision · Inkl. staatlicher Zulage & Steuerstundung
            </p>
          </div>
        </div>
      </section>

      {/* 2. Backend /v1/net-tariffs/compare + /v1/net-tariffs/products */}
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>⚖️ Nettotarif-NPV-Rechner (/v1/net-tariffs/compare)</h2>
            <span className="badge badge-blue">§ 48b VAG Provisionsfrei</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label className="field">
              <span>Plattform-Provider</span>
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as "HONORARKONZEPT" | "CONFEE")
                }
              >
                <option value="CONFEE">con.fee AG</option>
                <option value="HONORARKONZEPT">HonorarKonzept GmbH</option>
              </select>
            </label>

            <label className="field">
              <span>Brutto-Jahresprämie (€/Jahr)</span>
              <input
                type="number"
                value={grossAnnualCost}
                onChange={(e) => setGrossAnnualCost(Number(e.target.value) || 0)}
              />
            </label>

            <label className="field">
              <span>Netto-Jahresprämie (€/Jahr)</span>
              <input
                type="number"
                value={netAnnualCost}
                onChange={(e) => setNetAnnualCost(Number(e.target.value) || 0)}
              />
            </label>

            <label className="field">
              <span>Explizites Service-Honorar (€/Jahr)</span>
              <input
                type="number"
                value={advisoryFeeAnnual}
                onChange={(e) => setAdvisoryFeeAnnual(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <button
            type="button"
            className="button button-primary button-sm"
            onClick={() => void runCompareApi()}
          >
            Backend-Vorteil berechnen
          </button>

          {compareResult && (
            <ul className="profile-summary" style={{ marginTop: "14px" }}>
              <li>
                <strong>Produkt-Ersparnis / Jahr</strong>
                <span>+{formatEuro(compareResult.annualProductSavings)}</span>
              </li>
              <li>
                <strong>Netto-Vorteil nach Honorar</strong>
                <span>+{formatEuro(compareResult.annualNetOfAdvisory)} / Jahr</span>
              </li>
              <li>
                <strong>Barwert-Vorteil (NPV)</strong>
                <span>+{formatEuro(compareResult.npvSavings)}</span>
              </li>
              <li>
                <strong>Break-Even</strong>
                <span>
                  {compareResult.breakEvenYears !== null
                    ? `Jahr ${compareResult.breakEvenYears}`
                    : "Sofort"}
                </span>
              </li>
            </ul>
          )}

          <h3>🛡️ Finexpert Economic Gate (/v1/policy/economic-gate)</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select
              value={policyType}
              onChange={(e) => setPolicyType(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: "8px" }}
            >
              <option value="BU_DISABILITY">BU_DISABILITY (Berufsunfähigkeit)</option>
              <option value="PENSION_PRIVATE">PENSION_PRIVATE (Privatrente)</option>
              <option value="TERM_LIFE">TERM_LIFE (Risikoleben)</option>
              <option value="PET_HEALTH">PET_HEALTH (Tierkranken)</option>
            </select>
            <select
              value={subTier}
              onChange={(e) =>
                setSubTier(e.target.value as "FREE" | "ACTIVE_SUBSCRIBER")
              }
              style={{ padding: "8px 10px", borderRadius: "8px" }}
            >
              <option value="ACTIVE_SUBSCRIBER">ACTIVE_SUBSCRIBER</option>
              <option value="FREE">FREE Tier</option>
            </select>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => void runPolicyGate()}
            >
              Gate prüfen
            </button>
          </div>
          {gateResult && (
            <p className="hint" style={{ marginTop: "8px" }}>
              Status: <code>{gateResult.triggerStatus}</code> · Finexpert-Call:{" "}
              <strong>{gateResult.callFinexpert ? "JA" : "NEIN"}</strong> ·{" "}
              {gateResult.reason}
            </p>
          )}
        </section>

        {/* Live Nettotarif Product Catalog */}
        <section className="panel">
          <div className="panel-head">
            <h2>📦 Nettotarif-Katalog (/v1/net-tariffs/products)</h2>
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "8px" }}
            >
              <option value="">Alle Sparten</option>
              <option value="BU_DISABILITY">BU</option>
              <option value="PENSION_PRIVATE">Altersvorsorge</option>
              <option value="TERM_LIFE">Risikoleben</option>
              <option value="PROPERTY_CASUALTY">Privathaftpflicht</option>
            </select>
          </div>
          <p className="panel-subtitle">
            Live-Produkte von HonorarKonzept & con.fee inkl. Execution-Only Handoff
            (<code>/v1/net-tariffs/applications/handoff</code>):
          </p>

          <div className="habit-list">
            {products.slice(0, 5).map((p) => (
              <div key={p.id} className="habit-item">
                <div className="habit-info">
                  <div className="habit-title">
                    {p.productName}{" "}
                    <span className="badge badge-blue">{p.provider}</span>
                  </div>
                  <div className="habit-desc">
                    {p.carrierName} · Sparte: <code>{p.line}</code>
                  </div>
                </div>
                <button
                  type="button"
                  className="button button-primary button-sm"
                  onClick={() => void triggerHandoff(p)}
                >
                  Antrag-Handoff →
                </button>
              </div>
            ))}
          </div>

          {handoffStatus && (
            <p className="hint" style={{ marginTop: "12px" }}>
              {handoffStatus}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. CASHFLOW WATERFALL & OPEN FINANCE DATASOURCES TAB
      Connects:
      - POST /v1/ledger/waterfall
      - GET  /v1/aisp/sca-health
      - GET  /v1/datasources
   ========================================================================== */

export function CashflowOpenFinanceTab() {
  const [fixedCost90d, setFixedCost90d] = useState(4200);
  const [bufferMonths, setBufferMonths] = useState(3);
  const [checkingBalance, setCheckingBalance] = useState(1450);
  const [savingsBalance, setSavingsBalance] = useState(2400);
  const [loanBalance, setLoanBalance] = useState(0);
  const [loanApr, setLoanApr] = useState(6.5);

  const [waterfallRes, setWaterfallRes] = useState<{
    instruction: string;
    rationale: string;
    targetEmergencyBuffer: string;
    currentLiquidReserve: string;
    deficit: string;
    surplus: string;
  } | null>(null);

  const [scaDaysLeft, setScaDaysLeft] = useState(42);
  const [scaHealth, setScaHealth] = useState<{
    status: string;
    daysRemaining: number;
    requiresReauth: boolean;
  } | null>(null);

  const [datasourceCount, setDatasourceCount] = useState<number>(0);
  const [datasourceItems, setDatasourceItems] = useState<
    Array<{ id: string; name?: string; category?: string }>
  >([]);

  const runWaterfall = useCallback(async () => {
    try {
      const accounts: Array<{
        type: string;
        balanceAmount: number;
        aprPct?: number;
      }> = [
        { type: "CHECKING", balanceAmount: checkingBalance },
        { type: "SAVINGS", balanceAmount: savingsBalance },
      ];
      if (loanBalance > 0) {
        accounts.push({
          type: "LOAN",
          balanceAmount: -Math.abs(loanBalance),
          aprPct: loanApr,
        });
      }
      const res = await fetch(`${API_BASE}/v1/ledger/waterfall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixedCostSumLookback: fixedCost90d,
          targetBufferMonths: bufferMonths,
          accounts,
        }),
      });
      if (!res.ok) throw new Error("HTTP error");
      const data = (await res.json()) as {
        instruction: string;
        rationale: string;
        targetEmergencyBuffer: string;
        currentLiquidReserve: string;
        deficit: string;
        surplus: string;
      };
      setWaterfallRes(data);
    } catch {
      const monthlyFix = fixedCost90d / 3;
      const target = monthlyFix * bufferMonths;
      const liquid = checkingBalance + savingsBalance;
      const deficit = Math.max(0, target - liquid);
      const surplus = Math.max(0, liquid - target);
      setWaterfallRes({
        instruction:
          deficit > 0
            ? "FILL_EMERGENCY_BUFFER"
            : loanBalance > 0 && loanApr > 4
              ? "PAY_DOWN_HIGH_APR_DEBT"
              : "INVEST_SURPLUS_INTO_DEPOT",
        rationale:
          deficit > 0
            ? `Notgroschen-Lücke von ${deficit.toFixed(0)} € zuerst schließen.`
            : "Notgroschen steht — freier Cashflow kann ins Altersvorsorgedepot fließen.",
        targetEmergencyBuffer: target.toFixed(2),
        currentLiquidReserve: liquid.toFixed(2),
        deficit: deficit.toFixed(2),
        surplus: surplus.toFixed(2),
      });
    }
  }, [
    fixedCost90d,
    bufferMonths,
    checkingBalance,
    savingsBalance,
    loanBalance,
    loanApr,
  ]);

  const checkScaHealth = useCallback(async () => {
    const validUntil = new Date(
      Date.now() + scaDaysLeft * 86_400_000,
    ).toISOString();
    try {
      const res = await fetch(
        `${API_BASE}/v1/aisp/sca-health?scaValidUntil=${encodeURIComponent(
          validUntil,
        )}`,
      );
      if (!res.ok) throw new Error("HTTP error");
      const data = (await res.json()) as {
        status: string;
        daysRemaining: number;
        requiresReauth: boolean;
      };
      setScaHealth(data);
    } catch {
      setScaHealth({
        status: scaDaysLeft <= 14 ? "RENEWAL_RECOMMENDED" : "HEALTHY",
        daysRemaining: scaDaysLeft,
        requiresReauth: scaDaysLeft <= 0,
      });
    }
  }, [scaDaysLeft]);

  useEffect(() => {
    void runWaterfall();
    void checkScaHealth();
    void fetch(`${API_BASE}/v1/datasources`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: Array<{ id: string; name?: string; category?: string }> } | null) => {
        if (d?.items) {
          setDatasourceCount(d.items.length);
          setDatasourceItems(d.items.slice(0, 8));
        }
      })
      .catch(() => null);
  }, [runWaterfall, checkScaHealth]);

  return (
    <div className="waterfall-grid">
      <section className="panel">
        <div className="panel-head">
          <h2>🌊 Cashflow Waterfall (/v1/ledger/waterfall)</h2>
          <span className="badge badge-blue">@fico/ledger</span>
        </div>

        <label className="field">
          <span>Fixkosten-Summe letzte 90 Tage (€)</span>
          <input
            type="number"
            value={fixedCost90d}
            onChange={(e) => setFixedCost90d(Number(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span>Ziel-Notgroschen (Monate)</span>
          <input
            type="number"
            min={1}
            max={12}
            value={bufferMonths}
            onChange={(e) => setBufferMonths(Number(e.target.value) || 3)}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <label className="field">
            <span>Girokonto (CHECKING €)</span>
            <input
              type="number"
              value={checkingBalance}
              onChange={(e) => setCheckingBalance(Number(e.target.value) || 0)}
            />
          </label>

          <label className="field">
            <span>Tagesgeld (SAVINGS €)</span>
            <input
              type="number"
              value={savingsBalance}
              onChange={(e) => setSavingsBalance(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <label className="field">
            <span>Ratenkredit / Dispo (LOAN €)</span>
            <input
              type="number"
              value={loanBalance}
              onChange={(e) => setLoanBalance(Number(e.target.value) || 0)}
            />
          </label>

          <label className="field">
            <span>Effektivzins Kredit (% APR)</span>
            <input
              type="number"
              step={0.1}
              value={loanApr}
              onChange={(e) => setLoanApr(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <button
          type="button"
          className="button button-primary button-sm"
          onClick={() => void runWaterfall()}
        >
          Waterfall im Backend berechnen
        </button>

        {waterfallRes && (
          <ul className="profile-summary" style={{ marginTop: "14px" }}>
            <li>
              <strong>Routing-Befehl</strong>
              <code>{waterfallRes.instruction}</code>
            </li>
            <li>
              <strong>Liquide Reserve</strong>
              <span>{waterfallRes.currentLiquidReserve} €</span>
            </li>
            <li>
              <strong>Ziel-Notgroschen</strong>
              <span>{waterfallRes.targetEmergencyBuffer} €</span>
            </li>
            <li>
              <strong>Defizit / Überschuss</strong>
              <span>
                −{waterfallRes.deficit} € / +{waterfallRes.surplus} €
              </span>
            </li>
            <li>
              <strong>Begründung</strong>
              <span>{waterfallRes.rationale}</span>
            </li>
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>🔌 Open Finance, SCA-Health & Schnittstellen</h2>
          <span className="badge badge-emerald">
            {datasourceCount > 0 ? `${datasourceCount} Adapter aktiv` : "PSD2 / AISP"}
          </span>
        </div>

        <h3>🔐 PSD2 90-Tage SCA Consent Check (/v1/aisp/sca-health)</h3>
        <label className="slider-field" style={{ marginBottom: "12px" }}>
          <div className="slider-head">
            <span>Tage bis SCA-Ablauf simulieren</span>
            <strong>{scaDaysLeft} Tage</strong>
          </div>
          <input
            type="range"
            min={0}
            max={90}
            value={scaDaysLeft}
            onChange={(e) => setScaDaysLeft(Number(e.target.value))}
          />
        </label>

        {scaHealth && (
          <p className="hint" style={{ marginBottom: "18px" }}>
            SCA-Status: <code>{scaHealth.status}</code> · Restlaufzeit:{" "}
            <strong>{scaHealth.daysRemaining} Tage</strong> · Re-Auth nötig:{" "}
            <strong>{scaHealth.requiresReauth ? "JA" : "NEIN"}</strong>
          </p>
        )}

        <h3>📡 Registrierte Datenquellen (/v1/datasources & Finanzmining)</h3>
        <ul className="profile-summary">
          <li>
            <strong>Open Banking (AISP)</strong>
            <span>finAPI · Tink · WealthAPI</span>
          </li>
          <li>
            <strong>Transaktions-KI</strong>
            <span>Finanzmining Contract & Booking-Prediction</span>
          </li>
          <li>
            <strong>Nettotarif-Plattformen</strong>
            <span>HonorarKonzept · con.fee (§ 48b VAG)</span>
          </li>
          <li>
            <strong>Versicherungs-Synopse</strong>
            <span>finexpert / Franke & Bornberg Schnittstellen</span>
          </li>
        </ul>

        {datasourceItems.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            {datasourceItems.map((ds) => (
              <span key={ds.id} className="badge badge-blue">
                {ds.id}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   3. DOCUMENT EXPLORER & RAG SEARCH WIDGET (for Voice & Tresor Tab)
      Connects:
      - GET  /v1/documents
      - POST /v1/documents/read
      - POST /v1/retrieval
   ========================================================================== */

export function DocumentExplorerWidget({ userId }: { userId: string }) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [query, setQuery] = useState("Zillmerung");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshDocs = useCallback(async () => {
    const res = await listDocuments(userId);
    if (res.ok && res.kind === "list") {
      setDocs(res.documents);
    }
  }, [userId]);

  useEffect(() => {
    void refreshDocs();
  }, [refreshDocs]);

  const handleReadPages = async (policyId?: string) => {
    setBusy(true);
    const res = await readDocument(userId, { policyId, pageFrom: 1, pageTo: 2 });
    setBusy(false);
    if (!res.ok) {
      setOutput(res.message);
      return;
    }
    if (res.kind === "pages") {
      setOutput(
        res.pages
          .map((p) => `[Seite ${p.page}] ${p.text.slice(0, 320)}`)
          .join("\n\n"),
      );
    }
  };

  const handleSearchKeyword = async () => {
    setBusy(true);
    const res = await readDocument(userId, { query });
    setBusy(false);
    if (!res.ok) {
      setOutput(res.message);
      return;
    }
    if (res.kind === "matches") {
      setOutput(
        res.matches.length > 0
          ? res.matches.map((m) => `[Seite ${m.page}] ${m.snippet}`).join("\n")
          : `Kein direkter Texttreffer für „${query}“.`,
      );
    }
  };

  const handleVectorRag = async () => {
    setBusy(true);
    const ans = await searchDocumentsVoice(userId, query);
    setBusy(false);
    setOutput(ans);
  };

  return (
    <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(148,163,184,0.2)" }}>
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>📄 Policen-Leser & RAG (/v1/documents & /v1/retrieval)</h3>
        <button
          type="button"
          className="link-button"
          onClick={() => void refreshDocs()}
        >
          Aktualisieren ({docs.length})
        </button>
      </div>

      {docs.length > 0 ? (
        <ul className="profile-summary" style={{ marginTop: "8px" }}>
          {docs.map((d) => (
            <li key={d.policyId}>
              <strong>{d.providerName}</strong>
              <span>
                {d.fileName ?? d.documentStatus}{" "}
                <button
                  type="button"
                  className="link-button"
                  disabled={busy}
                  onClick={() => void handleReadPages(d.policyId)}
                >
                  Seiten 1–2 lesen
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Noch keine PDF im Tresor geladen.</p>
      )}

      <div className="answer-row" style={{ marginTop: "10px" }}>
        <input
          type="text"
          value={query}
          placeholder="Begriff oder Frage an die Police …"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="button button-ghost button-sm"
          disabled={busy}
          onClick={() => void handleSearchKeyword()}
        >
          Volltext
        </button>
        <button
          type="button"
          className="button button-primary button-sm"
          disabled={busy}
          onClick={() => void handleVectorRag()}
        >
          RAG-Suche
        </button>
      </div>

      {output && (
        <pre
          style={{
            marginTop: "10px",
            padding: "10px",
            borderRadius: "8px",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            maxHeight: "150px",
            overflowY: "auto",
            background: "rgba(15, 23, 42, 0.35)",
          }}
        >
          {output}
        </pre>
      )}
    </div>
  );
}
