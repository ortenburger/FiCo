import { useMemo, useState } from "react";
import type { GuildDto } from "./types";

const euroFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

type Props = {
  guild: GuildDto;
};

export function GuildCard({ guild }: Props) {
  const [inviteToast, setInviteToast] = useState<string | null>(null);

  const inviteLink = useMemo(
    () => `https://fico.app/guilds/${guild.slug}/join?quest=invite`,
    [guild.slug],
  );

  const handleInvite = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        setInviteToast("Invite link copied — drop it in your Quest chat!");
      } else {
        setInviteToast(inviteLink);
      }
    } catch {
      setInviteToast(inviteLink);
    }
    window.setTimeout(() => setInviteToast(null), 2800);
  };

  return (
    <section className="guild-card" aria-label="Cooperative Guild">
      <div className="panel-head">
        <div>
          <h2>{guild.name}</h2>
          <p className="panel-subtitle" style={{ marginTop: 4 }}>
            {guild.memberCount} members · cooperative only (no leaderboards)
          </p>
        </div>
        <span className="badge badge-emerald">Guild Perk</span>
      </div>

      <div className="guild-metrics">
        <div className="guild-metric">
          <span>Collective Fees Avoided</span>
          <strong>{euroFmt.format(guild.metrics.feesAvoidedEur)}</strong>
        </div>
        <div className="guild-metric">
          <span>Combined Streak</span>
          <strong>{guild.metrics.combinedStreakWeeks} Weeks</strong>
        </div>
        <div className="guild-metric">
          <span>Debt Eliminated</span>
          <strong>{euroFmt.format(guild.metrics.debtEliminatedEur)}</strong>
        </div>
        <div className="guild-metric">
          <span>Snacks Mastered</span>
          <strong>{guild.metrics.snacksMastered}</strong>
        </div>
      </div>

      <div className="guild-perk" role="status">
        🔥 {guild.activePerk}
      </div>

      <div className="guild-actions">
        <button type="button" className="checkin-btn" onClick={() => void handleInvite()}>
          + Invite Teammate via Quest
        </button>
        {inviteToast ? (
          <span className="guild-invite-toast" role="status">
            {inviteToast}
          </span>
        ) : null}
      </div>
    </section>
  );
}
