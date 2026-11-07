import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
  type MessagePayload,
} from "@elevenlabs/react";
import { DropVault } from "./vault/DropVault";
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

/**
 * Demo user for the voice intake. The seed script creates this exact id so
 * the client tools can persist what the agent collects.
 */
const DEMO_USER_ID =
  (import.meta.env.VITE_DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001").trim();
// Old public agent from the ElevenLabs docs; the API now returns 404 for it.
const LEGACY_DEMO_AGENT_ID = "agent_7101k5zvyjhmfg983brhmhkd98n6";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Bereit",
  connecting: "Verbinde …",
  connected: "Live",
  disconnecting: "Beende …",
  error: "Fehler",
};

const INTAKE_QUESTIONS = [
  "Guten Tag, ich bin FiCo. Wie heißen Sie und für welches Unternehmen sprechen Sie?",
  "Worum geht es – zum Beispiel Rahmenvertrag, Rechnung, Kündigung oder etwas anderes?",
  "Welche Laufzeit oder Frist ist für Sie relevant?",
  "Was soll ich mir besonders ansehen – Betrag, Klausel oder Termin?",
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
    `Es geht um ${topic}.`,
    `Relevante Laufzeit oder Frist: ${term}.`,
    `Prüfschwerpunkt: ${focus}.`,
    "Ich habe das Transkript für den nächsten Schritt vorbereitet – du kannst es jetzt als JSON exportieren.",
  ].join(" ");
}

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
    salary: null,
    marital_status: null,
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

  return (
    <div className="shell">
      {/*
        The client tools must live inside the ConversationProvider — the
        useConversationClientTool hook throws otherwise. The component renders
        null, so it has no layout impact.
      */}
      <VoiceClientTools userId={userId} onProfileField={onProfileField} />

      <header className="hero">
        <div className="brand">
          <span className="brand-mark">FiCo</span>
          <span className="brand-sub">Finance Copilot · Voice Intake</span>
        </div>
        <span
          className={`pill ${
            mode === "local" ? "pill-connected" : `pill-${status}`
          }`}
          aria-live="polite"
        >
          <span className="dot" />
          {mode === "local"
            ? "Browser-Demo"
            : STATUS_LABEL[status] ?? status}
        </span>
      </header>

      <main className="layout">
        <section className="panel call-panel">
          <h2>Gespräch</h2>

          <div className="mode-switch" role="tablist" aria-label="Modus">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "elevenlabs"}
              className={mode === "elevenlabs" ? "is-active" : ""}
              onClick={() => handleModeChange("elevenlabs")}
            >
              ElevenLabs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "local"}
              className={mode === "local" ? "is-active" : ""}
              onClick={() => handleModeChange("local")}
            >
              Browser-Demo
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
                  Public Agent: die ID genügt. Der frühere Docs-Demo-Agent ist
                  offline – trage deine eigene ID ein oder wechsle zur
                  Browser-Demo.
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
                    : "Noch kein Gespräch"}
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

              {!agentId.trim() ? (
                <p className="hint">
                  Ohne Agent-ID kein ElevenLabs-Start: Lege den Agent im
                  ElevenLabs-Dashboard an oder trage{" "}
                  <code>VITE_ELEVENLABS_AGENT_ID</code> in{" "}
                  <code>.env.local</code> ein.
                </p>
              ) : null}
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

          <DropVault userId="00000000-0000-4000-8000-000000000001" />
        </section>

        <section className="panel transcript-panel">
          <div className="panel-head">
            <h2>Transkript</h2>
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
                Als JSON exportieren
              </button>
            </div>
          </div>

          <div className="transcript" ref={transcriptRef}>
            {turns.length === 0 ? (
              <div className="empty">
                <p>Das Transkript erscheint hier, sobald das Gespräch läuft.</p>
                <p className="empty-example">
                  Beispiel: „Ich möchte einen Rahmenvertrag mit zwölf Monaten
                  Laufzeit prüfen lassen.“
                </p>
              </div>
            ) : (
              turns.map((turn) => (
                <article key={turn.id} className={`turn turn-${turn.role}`}>
                  <span className="turn-role">
                    {turn.role === "user" ? "Du" : "FiCo"}
                  </span>
                  <p>{turn.text}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="panel side-panel">
          <h2>Erfasstes Profil</h2>
          <ul className="profile-summary">
            <li>
              <strong>Gehalt</strong>
              {profile.salary ? (
                <span>{profile.salary} € brutto/Monat</span>
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
            Voice-Tools: <code>set_profile_field</code>, <code>ask_copilot</code>,{" "}
            <code>evaluate_waterfall</code>, <code>list_net_tariffs</code>,{" "}
            <code>compare_net_tariff</code>, <code>evaluate_policy_gate</code>,{" "}
            <code>search_documents</code>.
          </small>

          <h2>Demo-Flow</h2>
          <ol className="steps">
            <li>
              <strong>Modus</strong> Browser-Demo startet ohne Key; ElevenLabs
              braucht eine eigene public Agent-ID.
            </li>
            <li>
              <strong>Intake</strong> Profil + Vault; Agent kann Waterfall,
              Nettotarife (HonorarKonzept/con.fee) und Policy-Gate aufrufen.
            </li>
            <li>
              <strong>Export</strong> Transkript als JSON sichern — Grundlage für
              den Vertragsvergleich.
            </li>
          </ol>

          <h3>Gut zu wissen</h3>
          <ul className="notes">
            <li>
              Die Browser-Demo nutzt die Web Speech API (Chrome, Edge, Safari).
              Kein ElevenLabs-Konto und kein API-Key nötig.
            </li>
            <li>
              <code>ELEVENLABS_API_KEY</code> gehört nie ins Frontend. Nur
              public Agents laufen direkt mit Agent-ID.
            </li>
            <li>
              Private Agents brauchen eine <code>signedUrl</code> von deinem
              Server — niemals den API-Key bündeln.
            </li>
          </ul>
        </aside>
      </main>

      <footer className="footer">
        <span>FiCo · Hackathon-Slice</span>
        <span>Voice Intake · ElevenLabs oder Browser-Demo</span>
      </footer>
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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNotice("Mikrofonzugriff wurde abgelehnt. Erlaube ihn im Browser.");
      } else if (event.error === "no-speech") {
        setNotice("Nichts gehört. Versuche es erneut oder tippe die Antwort.");
      } else {
        setNotice(`Spracherkennung fehlgeschlagen (${event.error}). Tippe die Antwort.`);
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
      setNotice("Spracherkennung konnte nicht gestartet werden. Tippe die Antwort.");
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
        <p className="stage-note">Web Speech API · kein Key nötig</p>
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
