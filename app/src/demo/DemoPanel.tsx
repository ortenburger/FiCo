import { useCallback, useEffect, useState } from "react";
import {
  fetchDemoSnapshot,
  postDemoCheckIn,
  type DemoSnapshot,
} from "../voice/api";
import "./DemoPanel.css";

type Props = {
  userId: string;
};

export function DemoPanel({ userId }: Props) {
  const [snap, setSnap] = useState<DemoSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkInMsg, setCheckInMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchDemoSnapshot(userId);
    if (!result.ok) {
      setError(result.detail);
      setSnap(null);
      return;
    }
    setSnap(result.data);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCheckIn = async (snackSlug?: string) => {
    setBusy(true);
    setCheckInMsg(null);
    const result = await postDemoCheckIn(userId, snackSlug);
    setBusy(false);
    if (!result.ok) {
      setCheckInMsg(result.detail);
      return;
    }
    setCheckInMsg(
      `+${result.data.xpGain} XP · Level ${result.data.currentLevel} · Streak ${result.data.currentStreakWeeks} Wo.`,
    );
    await load();
  };

  if (error) {
    return (
      <section className="demo-panel panel">
        <h2>Lena Demo</h2>
        <p className="demo-error">{error}</p>
        <p className="hint">
          API starten und <code>pnpm --filter @fico/db seed</code> ausführen.
        </p>
        <button type="button" className="button button-ghost" onClick={() => void load()}>
          Neu laden
        </button>
      </section>
    );
  }

  if (!snap) {
    return (
      <section className="demo-panel panel">
        <h2>Lena Demo</h2>
        <p className="hint">Lade Demo-Snapshot …</p>
      </section>
    );
  }

  const g = snap.gamification;
  const w = snap.weeklyWrapped;
  const boss = snap.bossFight;
  const nextSnack = snap.snacks.find((s) => !s.completed);

  return (
    <section className="demo-panel panel">
      <div className="demo-head">
        <div>
          <h2>{snap.persona.displayName}</h2>
          <p className="demo-tagline">{snap.persona.tagline}</p>
        </div>
        {g ? (
          <div className={`flame flame-${g.flame.toLowerCase()}`} title={`${g.flame} flame`}>
            <span className="flame-mark" aria-hidden />
            <span>{g.currentStreakWeeks} Wo.</span>
          </div>
        ) : null}
      </div>

      {g ? (
        <div className="xp-bar-wrap">
          <div className="xp-meta">
            <span>
              Level {g.currentLevel} · {g.totalXp} XP
            </span>
            <span>{g.badges.length} Badges</span>
          </div>
          <div className="xp-bar" aria-hidden>
            <div
              className="xp-fill"
              style={{ width: `${Math.min(100, (g.totalXp % 200) / 2)}%` }}
            />
          </div>
        </div>
      ) : null}

      {w ? (
        <article className="wrapped">
          <header>
            <strong>Weekly Money Wrapped</strong>
            <span>
              KW {w.weekNumber}/{w.year}
            </span>
          </header>
          <p>{typeof w.story === "object" && w.story && "headline" in w.story
            ? String((w.story as { headline?: string }).headline ?? "")
            : null}</p>
          <ul className="wrapped-stats">
            <li>
              <span>Surplus</span>
              <strong>{w.savingsTotal} €</strong>
            </li>
            <li>
              <span>Fees avoided</span>
              <strong>{w.feesAvoided} €</strong>
            </li>
            <li>
              <span>XP</span>
              <strong>+{w.xpEarned}</strong>
            </li>
          </ul>
          {typeof w.story === "object" && w.story && "quest" in w.story ? (
            <p className="quest">
              Quest: {String((w.story as { quest?: string }).quest)}
            </p>
          ) : null}
        </article>
      ) : null}

      {boss ? (
        <article className="boss">
          <strong>{boss.name}</strong>
          <p>
            {boss.monthlyPremium} €/Mo · Brutto {boss.annualGross} €/Jahr → Netto
            hint {boss.annualNetHint} € (−{boss.annualSavingsHint} €)
          </p>
          <p className="quest">{boss.quest}</p>
          <span className="boss-status">{boss.switchStatus}</span>
        </article>
      ) : null}

      <div className="demo-accounts">
        {snap.accounts.map((a) => (
          <div key={a.id} className="acct">
            <span>{a.type}</span>
            <strong>
              {a.balanceAmount} {a.currency}
            </strong>
          </div>
        ))}
      </div>

      {snap.waterfall ? (
        <p className="waterfall-hint">
          Waterfall: <code>{snap.waterfall.instruction}</code> — Puffer{" "}
          {snap.waterfall.currentLiquidReserve} € / Ziel{" "}
          {snap.waterfall.targetEmergencyBuffer} €
        </p>
      ) : null}

      <div className="snack-row">
        {nextSnack ? (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={() => void onCheckIn(nextSnack.slug)}
          >
            Snack: {nextSnack.title} (+{nextSnack.xpReward} XP)
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={() => void onCheckIn()}
          >
            Wöchentlicher Check-in (+50 XP)
          </button>
        )}
        <button
          type="button"
          className="button button-ghost"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {checkInMsg ? <p className="checkin-msg">{checkInMsg}</p> : null}

      <details className="voice-hints">
        <summary>Voice-Prompts für die Demo</summary>
        <ul>
          {snap.voiceHints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
