import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
  type MessagePayload,
} from "@elevenlabs/react";
import { DemoPanel } from "./demo/DemoPanel";
import { DropVault } from "./vault/DropVault";
import { GamificationHub } from "./gamification";
import {
  VoiceClientTools,
  type ProfileUiState,
} from "./voice/VoiceClientTools";
import type { ProfileField } from "./voice/api";

type Turn = {
  id: number;
  role: "user" | "agent";
  text: string;
};

type Mode = "elevenlabs" | "local";
type NavTab = "gamification" | "copilot";

type RecognitionResultList = {
  length: number;
  [index: number]: {
    isFinal: boolean;
    0: { transcript: string };
  };
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const STORAGE_KEY = "fico:agent-id";
const ENV_AGENT_ID = (import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? "").trim();
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).trim();

const DEMO_USER_ID = (
  import.meta.env.VITE_DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001"
).trim();
const LEGACY_DEMO_AGENT_ID = "agent_7101k5zvyjhmfg983brhmhkd98n6";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Bereit",
  connecting: "Verbinde …",
  connected: "Live",
  disconnecting: "Beende …",
  error: "Fehler",
};

const INTAKE_QUESTIONS = [
  "Guten Tag, ich bin FiCo. Wie heißen Sie und welche Vorsorge oder Police möchten Sie prüfen?",
  "Worum geht es – Altersvorsorgedepot-Wechsel, Altvertrag-Gebührencheck oder Cashflow-Planung?",
  "Welcher monatliche Sparbetrag oder welche Laufzeit ist für Sie relevant?",
  "Was soll ich mir besonders ansehen – Abschlusskosten (Zillmerung), laufende TER oder Nettotarif?",
];

function getRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function pickGermanVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("de")) ?? null;
}

function buildSummary(answers: string[]) {
  const [who, topic, term, focus] = answers;
  return [
    `Danke. Aufgenommen: ${who}.`,
    `Fokusbereich: ${topic}.`,
    `Sparbetrag / Horizont: ${term}.`,
    `Prüfschwerpunkt: ${focus}.`,
    "Ich habe das Transkript für die Altersvorsorgedepot- & Nettotarif-Analyse vorbereitet.",
  ].join(" ");
}

/** Compound wealth helper for Arena & Overview */
function App() {
  const storedAgentId = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  const [agentId, setAgentId] = useState(() => {
    if (storedAgentId === LEGACY_DEMO_AGENT_ID) return ENV_AGENT_ID;
    return storedAgentId || ENV_AGENT_ID;
  });
  const [mode, setMode] = useState<Mode>(agentId ? "elevenlabs" : "local");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<Mode | null>(null);
  const [profile, setProfile] = useState<ProfileUiState>({
    salary: "4.200",
    marital_status: "Ledig",
  });
  const nextTurnId = useRef(1);

  const handleProfileField = useCallback((field: ProfileField, value: string) => {
    setProfile((previous) => ({ ...previous, [field]: value }));
  }, []);

  useEffect(() => {
    const value = agentId.trim();
    if (!value || value === LEGACY_DEMO_AGENT_ID) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, value);
  }, [agentId]);

  const appendTurn = useCallback((role: Turn["role"], text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTurns((previous) => [
      ...previous,
      { id: nextTurnId.current++, role, text: trimmed },
    ]);
  }, []);

  const handleMessage = useCallback(
    (payload: MessagePayload) => {
      appendTurn(payload.role, payload.message);
    },
    [appendTurn],
  );

  const handleConnect = useCallback(() => {
    setSessionStartedAt(new Date().toISOString());
  }, []);

  const handleError = useCallback((message: string) => {
    const normalized = message || "Unbekannter Verbindungsfehler.";
    if (normalized.includes("404") || /agent not found/i.test(normalized)) {
      setError(
        "Dieser ElevenLabs-Agent existiert nicht (mehr). Trage deine eigene Agent-ID ein oder nutze die Browser-Demo.",
      );
      return;
    }
    setError(normalized);
  }, []);

  const clearTranscript = useCallback(() => setTurns([]), []);

  const beginSession = useCallback((nextMode: Mode) => {
    setSessionStartedAt(new Date().toISOString());
    setSessionMode(nextMode);
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
  }, []);

  const exportTranscript = useCallback(() => {
    const payload = {
      app: "FiCo Voice Intake",
      mode: sessionMode ?? mode,
      exportedAt: new Date().toISOString(),
      sessionStartedAt,
      agentId:
        (sessionMode ?? mode) === "elevenlabs" ? agentId.trim() || null : null,
      turns: turns.map(({ role, text }) => ({ role, text })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fico-intake-${new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [agentId, mode, sessionMode, sessionStartedAt, turns]);

  return (
    <ConversationProvider
      onMessage={handleMessage}
      onConnect={() => handleConnect()}
      onError={handleError}
    >
      <Workspace
        mode={mode}
        onModeChange={switchMode}
        agentId={agentId}
        onAgentIdChange={setAgentId}
        turns={turns}
        error={error}
        onError={setError}
        onAppendTurn={appendTurn}
        onBeginSession={beginSession}
        onClearTranscript={clearTranscript}
        onExportTranscript={exportTranscript}
        profile={profile}
        onProfileField={handleProfileField}
        userId={DEMO_USER_ID}
      />
    </ConversationProvider>
  );
}

type WorkspaceProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  agentId: string;
  onAgentIdChange: (value: string) => void;
  turns: Turn[];
  error: string | null;
  onError: (message: string | null) => void;
  onAppendTurn: (role: Turn["role"], text: string) => void;
  onBeginSession: (mode: Mode) => void;
  onClearTranscript: () => void;
  onExportTranscript: () => void;
  profile: ProfileUiState;
  onProfileField: (field: ProfileField, value: string) => void;
  userId: string;
};

function Workspace({
  mode,
  onModeChange,
  agentId,
  onAgentIdChange,
  turns,
  error,
  onError,
  onAppendTurn,
  onBeginSession,
  onClearTranscript,
  onExportTranscript,
  profile,
  onProfileField,
  userId,
}: WorkspaceProps) {
  const { status, message: statusMessage } = useConversationStatus();
  const { startSession, endSession } = useConversationControls();
  const { isMuted, setMuted } = useConversationInput();
  const { isSpeaking, isListening } = useConversationMode();

  const [activeTab, setActiveTab] = useState<NavTab>("gamification");
  const [xp, setXp] = useState(1450);
  const [streakWeeks, setStreakWeeks] = useState(14);

  // WpIG Firewall test state
  const [copilotQuery, setCopilotQuery] = useState(
    "Wie teile ich 80% Welt-ETF und 20% Geldmarkt im Altersvorsorgedepot auf?",
  );
  const [firewallResult, setFirewallResult] = useState<{
    allowed: boolean;
    reason: string;
  } | null>(null);

  const evaluateFirewall = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/copilot/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: copilotQuery }),
      });
      const data = (await res.json()) as {
        allowed?: boolean;
        reason?: string;
        response?: string;
      };
      setFirewallResult({
        allowed: Boolean(data.allowed),
        reason:
          data.response ??
          data.reason ??
          (res.ok ? "Makro-Allokation freigegeben." : "Blockiert nach WpIG."),
      });
    } catch {
      // Local fallback matching @fico/regulatory WpIG rule
      const hasSingleStock =
        /kaufen|aktie|nvidia|tesla|apple|isin|wkn|all-in/i.test(copilotQuery);
      setFirewallResult({
        allowed: !hasSingleStock,
        reason: hasSingleStock
          ? "WpIG-Firewall BLOCKIERT: Keine Einzelaktien-Empfehlung (§ 2 Abs. 2 Nr. 4 WpIG). Nur Makro-Asset-Allocation."
          : "WpIG-Firewall FREIGEGEBEN: Reine Makro-Allokation & Altersvorsorgedepot-Bildung.",
      });
    }
  };

  const transcriptRef = useRef<HTMLDivElement>(null);
  const isConnecting = status === "connecting";
  const isLive = status === "connected";
  const canStart = !isLive && !isConnecting && agentId.trim().length > 0;

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns]);

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    if (isLive) void endSession();
    onError(null);
    onModeChange(next);
  };

  const handleStart = async () => {
    if (!agentId.trim() || isLive || isConnecting) return;
    onError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      onError(
        "Dieser Browser gibt keinen Mikrofonzugriff frei. Nutze localhost oder HTTPS.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      onError(
        "Mikrofonzugriff wurde abgelehnt. Erlaube ihn im Browser und starte erneut.",
      );
      return;
    }

    try {
      await startSession({ agentId: agentId.trim() });
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Verbindung zum ElevenLabs-Agent fehlgeschlagen.",
      );
    }
  };

  const tabHeaderMeta: Record<NavTab, { title: string; subtitle: string }> = {
    gamification: {
      title: "Gamification Hub: Weekly Streak, Wrapped, Skill Tree & Snacks",
      subtitle:
        "Duolingo-inspirierte Finanzbildung: Sunday Money Ritual, Questro Progress Rings, Weekly Money Wrapped & 90-Sekunden-Snacks.",
    },
    copilot: {
      title: "Voice Copilot, Policen-Tresor & WpIG-Firewall",
      subtitle:
        "Sprachgestützter Vertrags-Intake (ElevenLabs / Web Speech), S3-Dokument-Upload & regulatorische BaFin/WpIG-Prüfung.",
    },
  };

  return (
    <div className="app-frame">
      <VoiceClientTools userId={userId} onProfileField={onProfileField} />

      {/* LEFT SIDEBAR TEMPLATE */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-logo">FC</div>
            <div className="brand-text">
              <span className="brand-mark">FiCo</span>
              <span className="brand-sub">Financial Copilot · 2026</span>
            </div>
          </div>

          <div>
            <div className="nav-section-label">Plattform-Menü</div>
            <nav className="nav-list" aria-label="Hauptnavigation">

              <button
                type="button"
                className={`nav-item ${activeTab === "gamification" ? "is-active" : ""}`}
                onClick={() => setActiveTab("gamification")}
              >
                <span className="nav-item-left">
                  <span className="nav-icon">🎮</span>
                  <span>Gamification Hub</span>
                </span>
                <span className="nav-badge">🔥 {streakWeeks}W</span>
              </button>



              <button
                type="button"
                className={`nav-item ${activeTab === "copilot" ? "is-active" : ""}`}
                onClick={() => setActiveTab("copilot")}
              >
                <span className="nav-item-left">
                  <span className="nav-icon">🎙️</span>
                  <span>Voice & Tresor</span>
                </span>
                <span className="nav-badge">AI</span>
              </button>
            </nav>
          </div>

          <div>
            <div className="nav-section-label">Erfasstes Profil</div>
            <ul className="profile-summary">
              <li>
                <strong>Gehalt</strong>
                {profile.salary ? (
                  <span>{profile.salary} € / Mo</span>
                ) : (
                  <span className="is-empty">offen</span>
                )}
              </li>
              <li>
                <strong>Status</strong>
                {profile.marital_status ? (
                  <span>{profile.marital_status}</span>
                ) : (
                  <span className="is-empty">offen</span>
                )}
              </li>
              <li>
                <strong>Tarif-Typ</strong>
                <span style={{ color: "#2563eb" }}>Nettotarif (§ 48b VAG)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* GAMIFICATION STREAK CARD */}
        <div className="sidebar-streak-card">
          <div className="sidebar-streak-top">
            <span className="sidebar-streak-title">Sunday Ritual</span>
            <span className="sidebar-streak-flame">🔥 {streakWeeks} Wochen</span>
          </div>
          <p className="sidebar-streak-xp">{xp.toLocaleString("de-DE")} XP</p>
          <div className="xp-bar-track">
            <div
              className="xp-bar-fill"
              style={{ width: `${Math.min(100, (xp % 500) / 5)}%` }}
            />
          </div>
          <p className="sidebar-streak-sub">
            Silber-Flamme aktiv (1,25× XP). Noch 2 Wochen bis zum kostenlosen
            Policen-OCR-Scan!
          </p>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title-group">
            <h1>{tabHeaderMeta[activeTab].title}</h1>
            <p>{tabHeaderMeta[activeTab].subtitle}</p>
          </div>

          <div className="topbar-actions">
            <span className="badge badge-blue">
              🛡️ PSD2 / WpIG / § 48b VAG konform
            </span>
            <span
              className={`pill ${
                mode === "local" ? "pill-connected" : `pill-${status}`
              }`}
              aria-live="polite"
            >
              <span className="dot" />
              {mode === "local"
                ? "Voice: Browser-Demo"
                : `Voice: ${STATUS_LABEL[status] ?? status}`}
            </span>
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={() => setActiveTab("copilot")}
            >
              🎙️ Police prüfen
            </button>
          </div>
        </header>

        <main className="shell-content">
          {/* ================================================================
              TAB 1B: GAMIFICATION HUB (QUESTRO + WRAPPED + SKILL TREE + SNACKS)
              ================================================================ */}
          {activeTab === "gamification" && (
            <GamificationHub
              userId={userId}
              onXpChange={(nextXp, nextWeeks) => {
                setXp(nextXp);
                setStreakWeeks(nextWeeks);
              }}
            />
          )}
          {/* ================================================================
              TAB 4: VOICE COPILOT, VAULT & WPIG FIREWALL
              ================================================================ */}
          {activeTab === "copilot" && (
            <>
            <DemoPanel userId={userId} />
            <div className="layout">
              <section className="panel call-panel">
                <div className="panel-head">
                  <h2>🎙️ Voice Copilot Intake</h2>
                  <span className="badge badge-blue">Deutsch · Live</span>
                </div>

                <div className="mode-switch" role="tablist" aria-label="Modus">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "elevenlabs"}
                    className={mode === "elevenlabs" ? "is-active" : ""}
                    onClick={() => handleModeChange("elevenlabs")}
                  >
                    ElevenLabs Agent
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "local"}
                    className={mode === "local" ? "is-active" : ""}
                    onClick={() => handleModeChange("local")}
                  >
                    Browser-Demo (Web Speech)
                  </button>
                </div>

                {mode === "local" ? (
                  <LocalDemo
                    onBeginSession={onBeginSession}
                    onAppendTurn={onAppendTurn}
                    onClearTranscript={onClearTranscript}
                  />
                ) : (
                  <>
                    <label className="field">
                      <span>ElevenLabs Agent-ID</span>
                      <input
                        type="text"
                        value={agentId}
                        placeholder="agent_…"
                        spellCheck={false}
                        autoComplete="off"
                        disabled={isLive || isConnecting}
                        onChange={(event) => onAgentIdChange(event.target.value)}
                      />
                      <small>
                        Public Agent-ID eintragen oder direkt die Browser-Demo ohne API-Key
                        nutzen.
                      </small>
                    </label>

                    <div className="call-stage">
                      <div
                        className={`orb${isSpeaking ? " is-speaking" : ""}${
                          isListening ? " is-listening" : ""
                        }`}
                        aria-hidden="true"
                      >
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <p className="stage-label">
                        {isLive
                          ? isSpeaking
                            ? "FiCo spricht"
                            : "FiCo hört zu"
                          : "Bereit für Sprach-Intake"}
                      </p>
                      {statusMessage && isLive ? (
                        <p className="stage-note">{statusMessage}</p>
                      ) : null}
                    </div>

                    <div className="controls">
                      {isLive ? (
                        <>
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => void endSession()}
                          >
                            Gespräch beenden
                          </button>
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => setMuted(!isMuted)}
                          >
                            {isMuted ? "Mikrofon an" : "Mikrofon aus"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={!canStart}
                          onClick={() => void handleStart()}
                        >
                          {isConnecting ? "Verbinde …" : "Gespräch starten"}
                        </button>
                      )}
                    </div>
                  </>
                )}

                {error ? (
                  <div className="alert" role="alert">
                    <span>{error}</span>
                    <div className="alert-actions">
                      {mode === "elevenlabs" ? (
                        <button
                          type="button"
                          onClick={() => handleModeChange("local")}
                        >
                          Browser-Demo
                        </button>
                      ) : null}
                      <button type="button" onClick={() => onError(null)}>
                        Schließen
                      </button>
                    </div>
                  </div>
                ) : null}

                <DropVault userId={userId} />
              </section>

              <section className="panel transcript-panel">
                <div className="panel-head">
                  <h2>💬 Live-Transkript</h2>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="link-button"
                      disabled={turns.length === 0}
                      onClick={onClearTranscript}
                    >
                      Leeren
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      disabled={turns.length === 0}
                      onClick={onExportTranscript}
                    >
                      JSON exportieren
                    </button>
                  </div>
                </div>

                <div className="transcript" ref={transcriptRef}>
                  {turns.length === 0 ? (
                    <div className="empty">
                      <p>
                        Starte das Gespräch oder die Browser-Demo — alle Fragen &
                        Antworten erscheinen hier in Echtzeit.
                      </p>
                      <p className="empty-example">
                        Beispiel: „Ich möchte meine Allianz-Rentenpolice von 2019 gegen
                        das neue Altersvorsorgedepot vergleichen.“
                      </p>
                    </div>
                  ) : (
                    turns.map((turn) => (
                      <article
                        key={turn.id}
                        className={`turn turn-${turn.role}`}
                      >
                        <span className="turn-role">
                          {turn.role === "user" ? "Du" : "FiCo Copilot"}
                        </span>
                        <p>{turn.text}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <aside className="panel side-panel">
                <h2>🛡️ WpIG Regulatory Firewall</h2>
                <p className="panel-subtitle">
                  Testet live die regulatorische Schranke (<code>/v1/copilot/query</code>):
                  Makro-Allokation ist erlaubt, Einzelaktien-Tipps werden hart blockiert.
                </p>

                <label className="field">
                  <span>Copilot-Anfrage testen</span>
                  <input
                    type="text"
                    value={copilotQuery}
                    onChange={(e) => setCopilotQuery(e.target.value)}
                  />
                </label>

                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  <button
                    type="button"
                    className="button button-primary button-sm"
                    onClick={() => void evaluateFirewall()}
                  >
                    Firewall prüfen
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-sm"
                    onClick={() =>
                      setCopilotQuery("Soll ich jetzt NVIDIA Aktien kaufen?")
                    }
                  >
                    Einzelaktie testen
                  </button>
                </div>

                {firewallResult && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      fontSize: "0.8rem",
                      lineHeight: 1.45,
                      marginBottom: "18px",
                      background: firewallResult.allowed ? "#ecfdf5" : "#fff1f2",
                      border: `1px solid ${
                        firewallResult.allowed ? "#a7f3d0" : "#fecdd3"
                      }`,
                      color: firewallResult.allowed ? "#065f46" : "#9f1239",
                    }}
                  >
                    <strong>
                      {firewallResult.allowed ? "✓ ERLAUBT: " : "⛔ BLOCKIERT: "}
                    </strong>
                    {firewallResult.reason}
                  </div>
                )}

                <h3>Erfasstes Client-Tool-Profil</h3>
                <ul className="profile-summary">
                  <li>
                    <strong>Gehalt</strong>
                    {profile.salary ? (
                      <span>{profile.salary} € brutto/Mo</span>
                    ) : (
                      <span className="is-empty">noch nicht erfasst</span>
                    )}
                  </li>
                  <li>
                    <strong>Familienstand</strong>
                    {profile.marital_status ? (
                      <span>{profile.marital_status}</span>
                    ) : (
                      <span className="is-empty">noch nicht erfasst</span>
                    )}
                  </li>
                </ul>
                <small className="profile-hint">
                  Wird vom ElevenLabs-Agent über <code>set_profile_field</code>{" "}
                  gesetzt und per <code>PUT /v1/profile</code> gespeichert.
                </small>
              </aside>
            </div>
            </>
          )}

          <footer className="footer">
            <span>
              <strong>FiCo</strong> · Financial Copilot & Net-Tariff Orchestration
              Engine (Founders Hackathon Stuttgart 2026)
            </span>
            <span>Clean Blue Fintech UI Template · PSD2 / WpIG / VAG</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

type LocalDemoProps = {
  onBeginSession: (mode: Mode) => void;
  onAppendTurn: (role: Turn["role"], text: string) => void;
  onClearTranscript: () => void;
};

function LocalDemo({
  onBeginSession,
  onAppendTurn,
  onClearTranscript,
}: LocalDemoProps) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const answersRef = useRef<string[]>([]);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const germanVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoice = () => {
      germanVoiceRef.current = pickGermanVoice();
    };
    loadVoice();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoice);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoice);
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = 1.02;
    const voice = germanVoiceRef.current ?? pickGermanVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startDemo = () => {
    onClearTranscript();
    answersRef.current = [];
    setStep(0);
    setRunning(true);
    setFinished(false);
    setAnswer("");
    setNotice(null);
    onBeginSession("local");
    const first = INTAKE_QUESTIONS[0];
    onAppendTurn("agent", first);
    speak(first);
  };

  const stopDemo = () => {
    stopListening();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setRunning(false);
    setFinished(true);
    setAnswer("");
  };

  const submitAnswer = () => {
    const text = answer.trim();
    if (!text || !running) return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);

    const answers = [...answersRef.current, text];
    answersRef.current = answers;
    onAppendTurn("user", text);
    setAnswer("");

    const nextStep = step + 1;
    if (nextStep < INTAKE_QUESTIONS.length) {
      setStep(nextStep);
      const question = INTAKE_QUESTIONS[nextStep];
      onAppendTurn("agent", question);
      speak(question);
      return;
    }

    setRunning(false);
    setFinished(true);
    const summary = buildSummary(answers);
    onAppendTurn("agent", summary);
    speak(summary);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setNotice(
        "Spracherkennung ist in diesem Browser nicht verfügbar. Tippe die Antwort einfach ein.",
      );
      return;
    }

    window.speechSynthesis?.cancel();
    setSpeaking(false);

    const recognition = new Recognition();
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setAnswer(transcript);
    };
    recognition.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setNotice("Mikrofonzugriff wurde abgelehnt. Erlaube ihn im Browser.");
      } else if (event.error === "no-speech") {
        setNotice("Nichts gehört. Versuche es erneut oder tippe die Antwort.");
      } else {
        setNotice(
          `Spracherkennung fehlgeschlagen (${event.error}). Tippe die Antwort.`,
        );
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setNotice(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setNotice(
        "Spracherkennung konnte nicht gestartet werden. Tippe die Antwort.",
      );
    }
  };

  const canSubmit = running && answer.trim().length > 0;

  return (
    <>
      <div className="call-stage">
        <div
          className={`orb${speaking ? " is-speaking" : ""}${
            listening ? " is-listening" : ""
          }`}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="stage-label">
          {speaking
            ? "FiCo spricht"
            : listening
              ? "FiCo hört zu"
              : running
                ? "FiCo wartet auf deine Antwort"
                : finished
                  ? "Demo beendet"
                  : "Bereit für die Browser-Demo"}
        </p>
        <p className="stage-note">Web Speech API · kein API-Key nötig</p>
      </div>

      {!running ? (
        <div className="controls">
          <button
            type="button"
            className="button button-primary"
            onClick={startDemo}
          >
            {finished ? "Nochmal starten" : "Lokale Demo starten"}
          </button>
        </div>
      ) : (
        <>
          <form
            className="answer-row"
            onSubmit={(event) => {
              event.preventDefault();
              submitAnswer();
            }}
          >
            <input
              type="text"
              value={answer}
              placeholder="Antwort tippen oder sprechen …"
              onChange={(event) => setAnswer(event.target.value)}
            />
            <button
              type="submit"
              className="button button-primary"
              disabled={!canSubmit}
            >
              Senden
            </button>
          </form>
          <div className="controls">
            <button
              type="button"
              className="button button-ghost"
              onClick={toggleListening}
              disabled={speaking}
            >
              {listening ? "Aufnahme stoppen" : "Antwort sprechen"}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={stopDemo}
            >
              Demo beenden
            </button>
          </div>
        </>
      )}

      {notice ? <p className="hint">{notice}</p> : null}
      {running ? (
        <p className="hint">
          Frage {Math.min(step + 1, INTAKE_QUESTIONS.length)} von{" "}
          {INTAKE_QUESTIONS.length}. Die Antwort landet direkt im Transkript.
        </p>
      ) : null}
    </>
  );
}

export default App;
