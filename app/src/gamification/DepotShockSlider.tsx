import { useMemo, useState } from "react";
import { computeDepotShock, DEPOT_NET_RETURN, LEGACY_NET_RETURN } from "./compound";

const euroFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const pctFmt = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function DepotShockSlider() {
  const [monthly, setMonthly] = useState(150);
  const [years, setYears] = useState(35);

  const result = useMemo(
    () => computeDepotShock(monthly, years),
    [monthly, years],
  );

  const maxBar = Math.max(result.legacyFv, result.depotFv, 1);
  const legacyPct = Math.round((result.legacyFv / maxBar) * 100);
  const depotPct = Math.round((result.depotFv / maxBar) * 100);

  return (
    <section className="shock-card" aria-label="Altersvorsorgedepot Compounding Shock">
      <div className="panel-head">
        <div>
          <h2>📈 Altersvorsorgedepot · 40-Year Compounding Shock</h2>
          <p className="panel-subtitle" style={{ marginTop: 4 }}>
            Monatlicher Zinseszins · Brutto {pctFmt.format(0.07)} · Legacy-Drag{" "}
            {pctFmt.format(LEGACY_NET_RETURN)} vs. Depot-TER{" "}
            {pctFmt.format(DEPOT_NET_RETURN)}
          </p>
        </div>
        <span className="badge badge-emerald">Live Slider</span>
      </div>

      <div className="shock-controls">
        <label className="shock-slider">
          <span className="shock-slider-label">
            Monthly Contribution
            <strong>{euroFmt.format(monthly)}</strong>
          </span>
          <input
            type="range"
            min={25}
            max={1000}
            step={25}
            value={monthly}
            onChange={(event) => setMonthly(Number(event.target.value))}
            aria-valuetext={euroFmt.format(monthly)}
          />
        </label>

        <label className="shock-slider">
          <span className="shock-slider-label">
            Horizon (Years)
            <strong>{years} Jahre</strong>
          </span>
          <input
            type="range"
            min={10}
            max={45}
            step={1}
            value={years}
            onChange={(event) => setYears(Number(event.target.value))}
            aria-valuetext={`${years} Jahre`}
          />
        </label>
      </div>

      <div className="shock-bars" role="img" aria-label="Legacy vs Altersvorsorgedepot">
        <div className="shock-bar-row">
          <span className="shock-bar-label">🔴 Legacy Plan</span>
          <div className="shock-bar-track">
            <div
              className="shock-bar-fill shock-bar-fill--legacy"
              style={{ width: `${legacyPct}%` }}
            />
          </div>
          <strong className="shock-bar-value">{euroFmt.format(result.legacyFv)}</strong>
        </div>
        <div className="shock-bar-row">
          <span className="shock-bar-label">🟢 Altersvorsorgedepot</span>
          <div className="shock-bar-track">
            <div
              className="shock-bar-fill shock-bar-fill--depot"
              style={{ width: `${depotPct}%` }}
            />
          </div>
          <strong className="shock-bar-value shock-bar-value--depot">
            {euroFmt.format(result.depotFv)}
          </strong>
        </div>
      </div>

      <div className="shock-banner" role="status">
        +{euroFmt.format(result.delta)} More Retirement Wealth Rescued for
        Future-You! 🚀
      </div>
    </section>
  );
}
