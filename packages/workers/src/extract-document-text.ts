import { extractText, getDocumentProxy } from "unpdf";

export type DocumentTextResult = {
  text: string;
  /** Number of pages, 1 for plain text. */
  pageCount: number;
  /** How the text was obtained. */
  source: "pdf" | "text" | "image";
  /** Set when the file looked like a PDF but could not be parsed. */
  warning?: string;
};

const PDF_MAGIC = "%PDF";

function looksLikePdf(buffer: Buffer): boolean {
  // The magic bytes may be preceded by junk, so scan the first kilobyte.
  return buffer.subarray(0, 1024).toString("latin1").includes(PDF_MAGIC);
}

function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // PNG, JPEG, GIF, WEBP, TIFF magic bytes.
  return (
    buffer[0] === 0x89 ||
    buffer[0] === 0xff ||
    buffer.subarray(0, 3).toString("latin1") === "GIF" ||
    buffer.subarray(0, 4).toString("latin1") === "RIFF" ||
    buffer.subarray(0, 2).toString("latin1") === "II" ||
    buffer.subarray(0, 2).toString("latin1") === "MM"
  );
}

/**
 * Extracts readable text from an uploaded document.
 *
 * Insurance contracts arrive as PDF or as a scan (PNG/JPEG). A PDF is parsed
 * page by page. A scan has no text layer, so it is reported as an image —
 * OCR would be the next step and is out of scope for the hackathon slice.
 */
export async function extractDocumentText(
  buffer: Buffer,
): Promise<DocumentTextResult> {
  if (buffer.length === 0) {
    return { text: "", pageCount: 0, source: "text", warning: "empty file" };
  }

  if (looksLikeImage(buffer)) {
    return {
      text: "",
      pageCount: 1,
      source: "image",
      warning:
        "image upload has no text layer — OCR would be required to read it",
    };
  }

  if (!looksLikePdf(buffer)) {
    // Plain text, CSV, JSON and friends.
    return {
      text: buffer.toString("utf8"),
      pageCount: 1,
      source: "text",
    };
  }

  try {
    const document = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(document, { mergePages: true });
    await document.destroy();

    const cleaned = text.replace(/\u0000/g, "").trim();

    if (!cleaned) {
      return {
        text: "",
        pageCount: totalPages,
        source: "pdf",
        warning:
          "the PDF has no text layer, it is probably a scan — OCR would be required",
      };
    }

    return { text: cleaned, pageCount: totalPages, source: "pdf" };
  } catch (caught) {
    return {
      text: "",
      pageCount: 0,
      source: "pdf",
      warning:
        caught instanceof Error ? caught.message : "PDF parsing failed",
    };
  }
}
