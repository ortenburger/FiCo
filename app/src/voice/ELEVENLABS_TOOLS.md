# ElevenLabs client tools: PDF access for the voice agent

The voice agent reads the documents in the FiCo vault through **two client
tools**. They run in the browser (same `@elevenlabs/react` session) and call the
FiCo API. This is a direct read of the extracted page text — **not RAG**, no
embeddings and no vector search.

| Tool | Purpose | API |
| --- | --- | --- |
| `list_documents` | Show the user's uploaded policies with `policyId`, file name, provider and status. | `GET /v1/documents?userId=…` |
| `read_document` | Read a page range, a single page, or search the document text. | `POST /v1/documents/read` |

The implementation lives in [`VoiceClientTools.tsx`](./VoiceClientTools.tsx) and
[`api.ts`](./api.ts). The API routes are in
`packages/api/src/document-read.ts`.

## Register the tools in the ElevenLabs dashboard

Open the agent → **Tools** → **Client tools** and create both tools. The names
must match exactly, otherwise the browser cannot answer the tool call.

### `list_documents`

Description for the agent:

> List the user's uploaded insurance documents in the FiCo vault. Call this
> first when the user asks about their policy, contract or PDF. Returns file
> name, provider and a policyId for read_document.

Parameters: no parameters.

### `read_document`

Description for the agent:

> Read the actual text of an uploaded insurance PDF page by page. Use after
> list_documents. Read at most three pages per call and continue with pageFrom
> when the answer needs more. Never guess contract values; read the document.

Parameter schema (client tool JSON):

```json
{
  "type": "object",
  "properties": {
    "policyId": {
      "type": "string",
      "description": "policyId from list_documents. Optional when only one document exists."
    },
    "document": {
      "type": "string",
      "description": "Optional free-text hint instead of policyId: file name, insurer or policy number."
    },
    "page": {
      "type": "number",
      "description": "Read exactly this page (1-based)."
    },
    "pageFrom": {
      "type": "number",
      "description": "First page of a range. Default 1."
    },
    "pageTo": {
      "type": "number",
      "description": "Last page of a range. Default pageFrom + 2."
    },
    "query": {
      "type": "string",
      "description": "Search the document text for a term and return page snippets instead of a range."
    }
  },
  "required": []
}
```

## Suggested agent prompt block

```text
Du bist der FiCo Voice Copilot. Im Dokument-Tresor liegen die Policen des
Nutzers. Wenn der Nutzer nach seiner Police, seinen Vertragsdaten, Kosten,
Laufzeit, Beiträgen oder Klauseln fragt:
1. Rufe list_documents auf, falls noch nicht geschehen.
2. Rufe read_document mit der passenden policyId auf.
3. Zitiere nur Werte, die du tatsächlich gelesen hast, und nenne die Seite.
4. Lies höchstens drei Seiten pro Aufruf und arbeite mit pageFrom weiter.
5. Ist eine Seite ein Scan ohne Text, sage das offen statt zu raten.
```

## API contract (for testing without the dashboard)

```bash
curl "http://localhost:3001/v1/documents?userId=00000000-0000-4000-8000-000000000001"

curl -X POST http://localhost:3001/v1/documents/read \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "00000000-0000-4000-8000-000000000001",
    "pageFrom": 1,
    "pageTo": 3
  }'
```

`read_document` returns `pages: [{ page, text }]`, `nextPage` and a `hint`. With
`query` it returns `matches: [{ page, snippet }]` instead.

## Limits and behaviour

- A call returns at most **5 pages** and about **6,000 characters** (override
  with `maxChars`, up to 20,000) so the voice turn stays short.
- Page numbers are 1-based and preserved from the PDF.
- Image-only PDFs return HTTP 422 with the warning that OCR is required.
- The tool needs the browser session and the API server; it is not a server
  webhook.
