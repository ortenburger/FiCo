import { useConversationClientTool, type ClientTools } from "@elevenlabs/react";
import {
  askCopilot,
  postProfileField,
  type ProfileField,
} from "./api";

export type ProfileUiState = Record<ProfileField, string | null>;

type FicoVoiceTools = ClientTools & {
  set_profile_field: (params: { field: ProfileField; value: string }) => string;
  ask_copilot: (params: { question: string }) => string;
};

type VoiceClientToolsProps = {
  userId: string;
  onProfileField: (field: ProfileField, value: string) => void;
};

export function VoiceClientTools({
  userId,
  onProfileField,
}: VoiceClientToolsProps) {
  useConversationClientTool<FicoVoiceTools>(
    "set_profile_field",
    async ({ field, value }) => {
      const normalizedField = field;
      if (normalizedField !== "salary" && normalizedField !== "marital_status") {
        return `Unbekanntes Profilfeld „${String(field)}“. Erlaubt: salary, marital_status.`;
      }

      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue) {
        return `Kein Wert für ${normalizedField} angegeben.`;
      }

      const result = await postProfileField(
        normalizedField,
        normalizedValue,
        userId,
      );
      if (result.ok) {
        // Only mirror into the UI once the value was accepted and persisted.
        onProfileField(normalizedField, normalizedValue);
        return `${normalizedField} wurde gespeichert.`;
      }
      if (result.reason === "invalid") {
        return `„${result.detail}" konnte nicht als ${normalizedField} gelesen werden. Bitte anders formulieren.`;
      }
      if (result.reason === "network") {
        return `${normalizedField} konnte nicht gespeichert werden: die FiCo-Engine ist nicht erreichbar.`;
      }
      return `${normalizedField} konnte nicht gespeichert werden (${result.detail ?? "Serverfehler"}).`;
    },
  );

  useConversationClientTool<FicoVoiceTools>("ask_copilot", async ({ question }) => {
    return askCopilot(String(question ?? ""));
  });

  return null;
}
