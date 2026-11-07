import { useEffect, useMemo, useState } from "react";
import {
  AchievementToast,
  ProgressRingsWithLabels,
  achievementToastStyles,
  type Achievement,
  type RingData,
} from "questro";
import {
  FLAME_TIER_LABELS,
  FLAME_TIER_THRESHOLDS,
  demoUserId,
  derivenLevelFromXp,
  flameTierForWeeks,
  levelTitleFor,
  loadGamificationHub,
  submitCheckIn,
  submitSnackAnswer,
  xpFloors,
} from "./mockApi";
import type {
  FinancialSnackDto,
  GamificationProfileDto,
  QuestChapterDto,
  WeeklyMoneyWrappedDto,
} from "./types";
import "./gamification.css";

export type GamificationHubProps = {
  userId?: string;
  onXpChange?: (totalXp: number, streakWeeks: number) => void;
};

const euroFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function GamificationHub({
  userId = demoUserId(),
  onXpChange,
}: GamificationHubProps) {
  const [dataSource, setDataSource] = useState<"api" | "demo">("demo");
  const [profile, setProfile] = useState<GamificationProfileDto | null>(null);
  const [wrapped, setWrapped] = useState<WeeklyMoneyWrappedDto | null>(null);
  const [snacks, setSnacks] = useState<FinancialSnackDto[]>([]);
  const [chapters, setChapters] = useState<QuestChapterDto[]>([]);

  const [selectedSnackIdx, setSelectedSnackIdx] = useState(0);
  const [snackAnswers, setSnackAnswers] = useState<
    Record<string, { optionId: string; correct: boolean; xpDelta: number }>
  >({});
  const [checkedInThisSession, setCheckedInThisSession] = useState(false);
  const [toast, setToast] = useState<Achievement | null>(null);

  useEffect(() => {
    let active = true;
    void loadGamificationHub(userId).then((hub) => {
      if (!active) return;
      setDataSource(hub.dataSource);
      setProfile(hub.profile);
      setWrapped(hub.wrapped);
      setSnacks(hub.snacks);
      setChapters(hub.chapters);
      onXpChange?.(hub.profile.totalXp, hub.profile.currentStreakWeeks);
    });
    return () => {
      active = false;
    };
  }, [userId, onXpChange]);

  const applyXpDelta = (
    delta: number,
    extraPatch?: Partial<GamificationProfileDto>,
  ) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const nextXp = Math.max(0, prev.totalXp + delta);
      const nextLevel = derivenLevelFromXp(nextXp);
      const nextTitle = levelTitleFor(nextLevel);
      const updated: GamificationProfileDto = {
        ...prev,
        ...extraPatch,
        totalXp: nextXp,
        currentLevel: nextLevel,
        levelTitle: nextTitle,
      };
      onXpChange?.(updated.totalXp, updated.currentStreakWeeks);
      return updated;
    });
  };

  const handleSundayCheckIn = async () => {
    if (!profile || checkedInThisSession) return;
    const res = await submitCheckIn(userId);
    setCheckedInThisSession(true);
    applyXpDelta(res.xpGained, {
      currentStreakWeeks: res.currentStreakWeeks,
      longestStreakWeeks: Math.max(
        profile.longestStreakWeeks,
        res.currentStreakWeeks,
      ),
      lastCheckInDate: new Date().toISOString(),
    });
    setToast({
      title: `🔥 Woche ${res.currentStreakWeeks} Streak gesichert!`,
      description: `Sunday Money Ritual abgeschlossen (+${res.xpGained} XP).`,
      type: "milestone",
      reward: { xp: res.xpGained },
      showConfetti: true,
    });
  };

  const handleAnswerSnack = async (
    snack: FinancialSnackDto,
    optionId: string,
  ) => {
    if (snackAnswers[snack.slug]) return;
    const res = await submitSnackAnswer({
      userId,
      snackSlug: snack.slug,
      optionId,
    });
    setSnackAnswers((prev) => ({
      ...prev,
      [snack.slug]: {
        optionId,
        correct: res.correct,
        xpDelta: res.xpGained,
      },
    }));
    applyXpDelta(res.xpGained, {
      completedSnacks: res.correct
        ? Array.from(new Set([...(profile?.completedSnacks ?? []), snack.slug]))
        : profile?.completedSnacks ?? [],
    });
    if (res.correct) {
      setToast({
        title: `🍿 Snack #${snack.number} gemeistert!`,
        description: `${snack.title} (+${res.xpGained} XP)`,
        type: "quest",
        reward: { xp: res.xpGained },
        showConfetti: true,
      });
    }
  };

  const handleCompleteQuest = (chapterIdx: number, questId: string) => {
    const chapter = chapters[chapterIdx];
    const quest = chapter?.quests.find((q) => q.id === questId);
    if (!quest || quest.completed) return;

    setChapters((prev) =>
      prev.map((ch, idx) =>
        idx !== chapterIdx
          ? ch
          : {
              ...ch,
              quests: ch.quests.map((q) =>
                q.id === questId ? { ...q, completed: true } : q,
              ),
            },
      ),
    );
    applyXpDelta(quest.xp);
    setToast({
      title: `🏆 Quest abgeschlossen: ${quest.title}`,
      description: `Skill-Tree Fortschritt freigeschaltet (+${quest.xp} XP)`,
      type: "level",
      reward: { xp: quest.xp },
      showConfetti: true,
    });
  };

  const completedQuestIds = useMemo(() => {
    const set = new Set<string>();
    for (const ch of chapters) {
      for (const q of ch.quests) {
        if (q.completed) set.add(q.id);
      }
    }
    return set;
  }, [chapters]);

  const totalQuestsCount = useMemo(
    () => chapters.reduce((acc, ch) => acc + ch.quests.length, 0),
    [chapters],
  );

  if (!profile || !wrapped) {
    return (
      <div className="panel">
        <p style={{ margin: 0, color: "#64748b" }}>
          Lade Gamification-Engine …
        </p>
      </div>
    );
  }

  const currentTier = flameTierForWeeks(profile.currentStreakWeeks);
  const nextFloor =
    xpFloors[Math.min(profile.currentLevel, xpFloors.length - 1)] ?? 7000;

  const rings: RingData[] = [
    {
      label: "Emergency Shield",
      value: wrapped.emergencyShield.percent,
      max: 100,
      color: "#C8F542",
      gradientColor: "#60a5fa",
    },
    {
      label: "Quests erledigt",
      value: completedQuestIds.size,
      max: Math.max(1, totalQuestsCount),
      color: "#059669",
      gradientColor: "#34d399",
    },
    {
      label: "Snacks gelernt",
      value: profile.completedSnacks.length,
      max: Math.max(1, snacks.length),
      color: "#0284c7",
      gradientColor: "#38bdf8",
    },
  ];

  const activeSnack = snacks[selectedSnackIdx] ?? snacks[0];
  const activeSnackState = activeSnack
    ? snackAnswers[activeSnack.slug]
    : undefined;

  return (
    <div className="gamification-hub">
      <style>{achievementToastStyles}</style>

      {toast ? (
        <AchievementToast
          achievement={toast}
          onClose={() => setToast(null)}
        />
      ) : null}

      {/* ROW 1: STREAK FLAME CARD + QUESTRO PROGRESS RINGS */}
      <div className="gamification-top-grid">
        <section className="flame-card" aria-label="Weekly Streak & Level">
          <div className="flame-card-head">
            <div className="flame-hero">
              <div className="flame-orb" aria-hidden="true">
                🔥
              </div>
              <div>
                <h2 className="flame-headline">
                  {profile.currentStreakWeeks} Wochen Streak ·{" "}
                  {FLAME_TIER_LABELS[currentTier]}
                </h2>
                <p className="flame-sub">
                  Level {profile.currentLevel} ·{" "}
                  <strong>{profile.levelTitle}</strong> ({profile.totalXp} /{" "}
                  {nextFloor} XP)
                </p>
              </div>
            </div>
            <span className="badge badge-emerald">
              {dataSource === "api" ? "Live API" : "Egon Demo-Welt"}
            </span>
          </div>

          <div className="tier-ladder">
            {FLAME_TIER_THRESHOLDS.map((step) => {
              const reached = profile.currentStreakWeeks >= step.weeks;
              return (
                <div
                  key={step.tier}
                  className={`tier-step ${reached ? "is-reached" : ""}`}
                >
                  <strong>{FLAME_TIER_LABELS[step.tier]}</strong>
                  <span>ab {step.weeks} Wo.</span>
                </div>
              );
            })}
          </div>

          <div className="flame-card-footer">
            <span className="freeze-pill">
              🧊 {profile.streakFreezeCount} Earned Streak-Freezes (Kein
              Pay-to-Win)
            </span>
            <button
              type="button"
              className="checkin-btn"
              disabled={checkedInThisSession}
              onClick={() => void handleSundayCheckIn()}
            >
              {checkedInThisSession
                ? "✓ Sunday Ritual erledigt (+150 XP)"
                : "⚡ Sunday Money Ritual einchecken (+150 XP)"}
            </button>
          </div>
        </section>

        <section className="rings-card" aria-label="Sovereignty Rings">
          <div className="panel-head">
            <h2>🎯 Financial Sovereignty Rings (Questro)</h2>
            <span className="badge badge-blue">
              Lv. {profile.currentLevel} {profile.levelTitle}
            </span>
          </div>
          <div className="rings-body">
            <ProgressRingsWithLabels
              rings={rings}
              size={168}
              strokeWidth={12}
              gap={5}
              showCenter={true}
              centerText={`${profile.totalXp}`}
              centerLabel="Total XP"
              showLabels={true}
            />
          </div>
        </section>
      </div>

      {/* ROW 2: WEEKLY MONEY WRAPPED (§3) */}
      <section className="wrapped-card" aria-label="Weekly Money Wrapped">
        <div className="panel-head">
          <div>
            <h2>
              📊 Your Weekly Money Wrapped · KW {wrapped.weekNumber} /{" "}
              {wrapped.year}
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "0.82rem",
                color: "#64748b",
              }}
            >
              Automatisch generiert von <code>@fico/workers</code> · Idempotent
              pro (User, ISO-Woche, Jahr)
            </p>
          </div>
          <span className="badge badge-emerald">
            +{wrapped.xpEarned} XP diese Woche
          </span>
        </div>

        <div className="wrapped-grid">
          <div className="wrapped-tile wrapped-tile--highlight">
            <span className="wrapped-tile-label">💰 Cashflow Pulse</span>
            <div className="wrapped-tile-value" style={{ color: "#C8F542" }}>
              {euroFmt.format(wrapped.cashflowPulse.freeSurplus)} Surplus
            </div>
            <div className="wrapped-tile-sub">
              Einkommen {euroFmt.format(wrapped.cashflowPulse.income)} · Fix{" "}
              {euroFmt.format(wrapped.cashflowPulse.fixedCosts)} · Variabel{" "}
              {euroFmt.format(wrapped.cashflowPulse.discretionarySpend)}{" "}
              {wrapped.cashflowPulse.routingNote}
            </div>
          </div>

          <div className="wrapped-tile">
            <span className="wrapped-tile-label">🛡️ Emergency Shield</span>
            <div className="wrapped-tile-value" style={{ color: "#059669" }}>
              {wrapped.emergencyShield.percent} %
            </div>
            <div className="wrapped-tile-sub">
              {wrapped.emergencyShield.targetLabel} (+
              {euroFmt.format(wrapped.emergencyShield.deltaThisWeek)} diese
              Woche)
            </div>
          </div>

          <div className="wrapped-tile">
            <span className="wrapped-tile-label">🥊 Boss Damage Report</span>
            <div className="wrapped-tile-value" style={{ color: "#e11d48" }}>
              −{euroFmt.format(wrapped.bossDamage.damageThisWeek)} Gebühren
            </div>
            <div className="wrapped-tile-sub">
              Schaden an „{wrapped.bossDamage.monster}“ durch Nettotarif-Switch
            </div>
          </div>

          <div className="wrapped-tile wrapped-tile--highlight">
            <span className="wrapped-tile-label">
              {wrapped.agenticHighlight.emoji} Agentic Habit Highlight
            </span>
            <div className="wrapped-tile-value" style={{ color: "#1e40af" }}>
              +{euroFmt.format(wrapped.agenticHighlight.savedThisMonth)} / Mo
            </div>
            <div className="wrapped-tile-sub">
              {wrapped.agenticHighlight.habit}.{" "}
              <strong>{wrapped.agenticHighlight.depotProjection}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ROW 3: SKILL TREE (§6) & 4 FINANCIAL SNACKS (§5) */}
      <div className="gamification-bottom-grid">
        <section className="panel" aria-label="Financial Skill Tree">
          <div className="panel-head">
            <h2>🌳 Financial Skill Tree (RPG Quests)</h2>
            <span className="badge badge-blue">
              {completedQuestIds.size} / {totalQuestsCount} abgeschlossen
            </span>
          </div>
          <p className="panel-subtitle">
            Schließe Quests der Reihe nach ab, um XP zu sammeln und bis{" "}
            <strong>Lv. 7 Financial Sovereign</strong> aufzusteigen.
          </p>

          {chapters.map((ch, cIdx) => (
            <div key={ch.chapter} className="chapter-block">
              <h3 className="chapter-title">{ch.title}</h3>
              <div className="quest-nodes">
                {ch.quests.map((q) => {
                  const unlocked =
                    q.requires === null || completedQuestIds.has(q.requires);
                  const stateClass = q.completed
                    ? "is-completed"
                    : unlocked
                      ? "is-unlocked"
                      : "is-locked";
                  return (
                    <div key={q.id} className={`quest-node ${stateClass}`}>
                      <div className="quest-node-left">
                        <span className="quest-emoji">{q.emoji}</span>
                        <div>
                          <h4 className="quest-node-title">
                            {q.title}{" "}
                            <span
                              style={{
                                fontSize: "0.74rem",
                                color: "#C8F542",
                                fontWeight: 700,
                              }}
                            >
                              (+{q.xp} XP)
                            </span>
                          </h4>
                          <p className="quest-node-detail">{q.detail}</p>
                        </div>
                      </div>

                      {q.completed ? (
                        <span className="badge badge-emerald">Erledigt ✓</span>
                      ) : unlocked ? (
                        <button
                          type="button"
                          className="button button-primary button-sm"
                          onClick={() => handleCompleteQuest(cIdx, q.id)}
                        >
                          Abschließen
                        </button>
                      ) : (
                        <span className="badge">🔒 Gesperrt</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* RIGHT: 4 FINANCIAL SNACKS */}
        <section className="panel" aria-label="Financial Snacks">
          <div className="panel-head">
            <h2>🍿 Just-In-Time Financial Snacks (90 Sek.)</h2>
            <span className="badge badge-emerald">
              +25 XP richtig · −5 XP falsch
            </span>
          </div>

          <div className="snack-tabs" role="tablist">
            {snacks.map((s, idx) => {
              const done =
                profile.completedSnacks.includes(s.slug) ||
                snackAnswers[s.slug]?.correct;
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="tab"
                  aria-selected={idx === selectedSnackIdx}
                  className={`snack-tab ${
                    idx === selectedSnackIdx ? "is-active" : ""
                  }`}
                  onClick={() => setSelectedSnackIdx(idx)}
                >
                  #{s.number} {s.category} {done ? "✓" : ""}
                </button>
              );
            })}
          </div>

          {activeSnack ? (
            <div className="snack-card">
              <div className="panel-head">
                <span className="badge badge-blue">
                  Snack #{activeSnack.number} · {activeSnack.category}
                </span>
                <span className="badge badge-emerald">
                  +{activeSnack.xpReward} XP
                </span>
              </div>

              <h3
                style={{
                  margin: "6px 0 10px",
                  fontSize: "0.98rem",
                  color: "#0f172a",
                }}
              >
                {activeSnack.title}
              </h3>

              <ul className="snack-bite-list">
                {activeSnack.bite.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <strong
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  color: "#C8F542",
                  marginBottom: "8px",
                }}
              >
                Quiz: {activeSnack.question}
              </strong>

              <div className="snack-options">
                {activeSnack.options.map((opt) => {
                  let cls = "";
                  if (activeSnackState) {
                    if (opt.correct) cls = "is-correct";
                    else if (opt.id === activeSnackState.optionId)
                      cls = "is-wrong";
                  }
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`snack-option ${cls}`}
                      onClick={() => void handleAnswerSnack(activeSnack, opt.id)}
                    >
                      <strong>{opt.id.toUpperCase()})</strong> {opt.text}
                    </button>
                  );
                })}
              </div>

              {activeSnackState ? (
                <p
                  style={{
                    marginTop: "12px",
                    marginBottom: 0,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: activeSnackState.correct ? "#059669" : "#e11d48",
                  }}
                >
                  {activeSnackState.correct
                    ? `🎉 Stark! +${activeSnackState.xpDelta} XP auf dein Konto gebucht.`
                    : `💡 Nicht ganz (${activeSnackState.xpDelta} XP). Die grün markierte Antwort zeigt dir den Zinseszins-Hebel!`}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
