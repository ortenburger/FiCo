/**
 * Document vault: presigned MinIO upload + policy key persistence.
 *
 * Dependency (add to app/package.json when present):
 *   "react-dropzone": "^14.3.8"
 */
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import "./DropVault.css";

export type DropVaultProps = {
  userId: string;
  /** API origin, e.g. http://localhost:3000 — no S3 credentials in the client */
  apiBaseUrl?: string;
};

type UploadPhase = "idle" | "presigning" | "uploading" | "confirming" | "done" | "error";

const defaultApiBase =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  typeof import.meta.env.VITE_API_BASE_URL === "string"
    ? import.meta.env.VITE_API_BASE_URL
    : "http://localhost:3000";

export function DropVault({ userId, apiBaseUrl = defaultApiBase }: DropVaultProps) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [storedKey, setStoredKey] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setPhase("presigning");
      setMessage(null);
      setStoredKey(null);

      try {
        const presignRes = await fetch(`${apiBaseUrl}/v1/documents/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
          }),
        });

        if (!presignRes.ok) {
          const err = (await presignRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(err?.error ?? `Presign failed (${presignRes.status})`);
        }

        const presign = (await presignRes.json()) as {
          uploadUrl: string;
          s3Key: string;
          contentType: string;
        };

        setPhase("uploading");
        const putRes = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": presign.contentType },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Direct upload failed (${putRes.status})`);
        }

        setPhase("confirming");
        const completeRes = await fetch(`${apiBaseUrl}/v1/documents/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, s3Key: presign.s3Key }),
        });

        if (!completeRes.ok) {
          const err = (await completeRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(err?.error ?? `Complete failed (${completeRes.status})`);
        }

        const complete = (await completeRes.json()) as {
          rawDocumentS3Key: string;
        };

        setStoredKey(complete.rawDocumentS3Key);
        setMessage("Dokument gespeichert.");
        setPhase("done");
      } catch (e) {
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      }
    },
    [apiBaseUrl, userId],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const first = rejections[0]?.errors[0]?.message;
    setPhase("error");
    setMessage(first ?? "Datei abgelehnt");
  }, []);

  const busy = phase === "presigning" || phase === "uploading" || phase === "confirming";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    multiple: false,
    disabled: busy,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    },
  });

  return (
    <section className="drop-vault" aria-label="Dokument-Tresor">
      <h2 className="drop-vault__title">Policen-Dokument</h2>
      <p className="drop-vault__hint">
        PDF oder Bild hierher ziehen. Upload läuft direkt in den Tresor; der Schlüssel wird an
        deine Police gebunden.
      </p>

      <div
        {...getRootProps()}
        className={
          "drop-vault__zone" +
          (isDragActive ? " drop-vault__zone--active" : "") +
          (busy ? " drop-vault__zone--busy" : "")
        }
      >
        <input {...getInputProps()} />
        {busy ? (
          <span>
            {phase === "presigning" && "Upload-Adresse wird geholt…"}
            {phase === "uploading" && "Datei wird hochgeladen…"}
            {phase === "confirming" && "Police wird aktualisiert…"}
          </span>
        ) : isDragActive ? (
          <span>Loslassen zum Hochladen</span>
        ) : (
          <span>Datei ablegen oder klicken</span>
        )}
      </div>

      {message ? (
        <p
          className={
            phase === "error" ? "drop-vault__status drop-vault__status--error" : "drop-vault__status"
          }
          role="status"
        >
          {message}
        </p>
      ) : null}

      {storedKey ? (
        <p className="drop-vault__key">
          <span className="drop-vault__key-label">S3-Schlüssel:</span>{" "}
          <code>{storedKey}</code>
        </p>
      ) : null}
    </section>
  );
}
