import { extractText, getDocumentProxy } from "unpdf";

export type DocumentPages = {
  /** Page text, index 0 is page 1. Empty when the file has no text layer. */
  pages: string[];
  pageCount: number;
  source: "pdf" | "text" | "image";
  warning?: string;
};

const PDF_MAGIC = "%PDF";

function looksLikePdf(buffer: Buffer): boolean {
  // The magic bytes may be preceded by junk, so scan the first kilobyte.
  return buffer.subarray(0, 1024).toString("latin1").includes(PDF_MAGIC);
}

function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
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
 * Extracts the text of an uploaded document page by page.
 *
 * This is the direct-read path for the voice agent: no embeddings, no
 * similarity search, just the actual document text in reading order. Page
 * boundaries are preserved so a voice turn can continue on the next page.
 */
export async function extractDocumentPages(
  buffer: Buffer,
): Promise<DocumentPages> {
  if (buffer.length === 0) {
    return { pages: [], pageCount: 0, source: "text", warning: "empty file" };
  }

  if (looksLikeImage(buffer)) {
    return {
      pages: [],
      pageCount: 1,
      source: "image",
      warning:
        "image upload has no text layer — OCR would be required to read it",
    };
  }

  if (!looksLikePdf(buffer)) {
    return {
      pages: [buffer.toString("utf8")],
      pageCount: 1,
      source: "text",
    };
  }

  try {
    const document = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(document, {
      mergePages: false,
    });

    const pages = text.map((page) => page.replace(/\u0000/g, "").trim());
    const hasText = pages.some((page) => page.length > 0);

    if (!hasText) {
      return {
        pages,
        pageCount: totalPages,
        source: "pdf",
        warning:
          "the PDF has no text layer, it is probably a scan — OCR would be required",
      };
    }

    return { pages, pageCount: totalPages, source: "pdf" };
  } catch (caught) {
    return {
      pages: [],
      pageCount: 0,
      source: "pdf",
      warning: caught instanceof Error ? caught.message : "PDF parsing failed",
    };
  }
}
