import { useEffect, useState } from "react";

const BOSS_MAX_HP = 1074;
const BOSS_NET_HP = 720;
const CRITICAL_DAMAGE = BOSS_MAX_HP - BOSS_NET_HP; // 354
const STRIKE_XP = 200;

type Props = {
  monsterName: string;
  onStrike: (xpGain: number) => void;
};

export function BossBattleCard({ monsterName, onStrike }: Props) {
  const [hp, setHp] = useState(BOSS_MAX_HP);
  const [defeated, setDefeated] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [floatText, setFloatText] = useState<string | null>(null);

  useEffect(() => {
    if (!floatText) return;
    const timer = window.setTimeout(() => setFloatText(null), 1600);
    return () => window.clearTimeout(timer);
  }, [floatText]);

  const hpPct = Math.max(0, Math.min(100, (hp / BOSS_MAX_HP) * 100));

  const handleStrike = () => {
    if (defeated) return;
    setHp(BOSS_NET_HP);
    setDefeated(true);
    setShaking(true);
    setFloatText(`💥 −${CRITICAL_DAMAGE} HP CRITICAL HIT!`);
    onStrike(STRIKE_XP);
    window.setTimeout(() => setShaking(false), 620);
  };

  return (
    <section
      className={`boss-card${shaking ? " is-shaking" : ""}${defeated ? " is-defeated" : ""}`}
      aria-label="Boss Battle"
    >
      <div className="panel-head">
        <div>
          <h2>⚔️ Boss Battle · {monsterName}</h2>
          <p className="panel-subtitle" style={{ marginTop: 4 }}>
            Lv. 42 Fee Dragon · Annual Gross Premium HP
          </p>
        </div>
        <span className={`badge ${defeated ? "badge-emerald" : "badge-blue"}`}>
          {defeated ? "Defeated ✓" : `HP ${hp} / ${BOSS_MAX_HP}`}
        </span>
      </div>

      <div className="boss-arena">
        <div className="boss-avatar" aria-hidden="true">
          {defeated ? "💀" : "👹"}
        </div>
        <div className="boss-vitals">
          <div className="boss-hp-meta">
            <span>Health</span>
            <strong>
              €{hp.toLocaleString("de-DE")} / €
              {BOSS_MAX_HP.toLocaleString("de-DE")}
            </strong>
          </div>
          <div
            className="boss-hp-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={BOSS_MAX_HP}
            aria-valuenow={hp}
            aria-label="Boss HP"
          >
            <div
              className={`boss-hp-fill${defeated ? " is-critical" : ""}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <p className="boss-hp-hint">
            {defeated
              ? `Nettotarif locked in · annual cost now €${BOSS_NET_HP} (−€${CRITICAL_DAMAGE})`
              : `Strike switches Gross €${BOSS_MAX_HP} → Net €${BOSS_NET_HP}`}
          </p>
        </div>

        {floatText ? (
          <div className="boss-float-text" aria-live="assertive">
            {floatText}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="boss-strike-btn"
        disabled={defeated}
        onClick={handleStrike}
      >
        {defeated
          ? "Defeated ✓ · Nettotarif Active"
          : "⚔️ Strike with Nettotarif Switch"}
      </button>
    </section>
  );
}
