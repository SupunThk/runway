# Runway AI assistant scope

Added October 17, 2026 at the user's request. Phase 1 is now implemented locally using the supplied Gemini key; it is uncommitted and undeployed. Wallet reads and app actions remain later increments. The approved operating knowledge is [assistant-knowledge.md](assistant-knowledge.md), consumed directly by the backend.

Implementation uses AI SDK 7.0.143, Google provider 4.0.99 and configurable `gemini-3.8-flash`, verified against the live model list. A separate scope call selects relevant public sections, then an isolated answer call produces a validated structured response. Questions/history cannot inject trusted roles or sources. Only prior user questions are sent as follow-up context; previous model replies are excluded to prevent forged answer history from becoming trusted knowledge. Replies are returned complete after source validation, rather than streaming unvalidated partial text. No provider chat session or account-level conversation memory is created by the app.

## Delivery phases

| Phase | User experience | Boundary |
| --- | --- | --- |
| 1 — App and Mezo questions | Ask how Runway works, how to use each page, and what Mezo/MUSD concepts mean. Receive clear answers with supporting source links and relevant app links. | Reviewed documentation only; no wallet or transaction lookup tools. |
| 2 — Read wallet and transaction data | Ask about a supplied or connected wallet, a transaction hash, a schedule, or invoice payment evidence. | Read-only, chain-verified data; private workspace reads require the existing authenticated owner session. |
| 3 — Prepare app actions | Ask the assistant to prepare supported app workflows, such as a draft invoice or a payment form, then review and confirm the proposed action. | Separate authorization and deterministic validation; financial writes require explicit user confirmation in the wallet. No autonomous transactions or custody. |

Phase 1 is the first implementation increment in expanded Wave 1. Phases 2 and 3 are follow-on scope and require their own implementation and release checks. Direct borrowing/repayment through chat depends on those underlying app integrations being delivered and verified first.

## Phase 1 experience

Add an **Assistant** page in the existing shared navigation, with a responsive conversation view and a new-chat action. Questions should work without connecting a wallet. Provide example prompts:

- “How do I pay a contractor?”
- “What is the difference between funded and paid?”
- “What happens when I cancel a schedule?”
- “Why is invoice reconciliation unavailable?”
- “What is MUSD, and how does Mezo borrowing work?”

Support follow-up questions, visible answer-loading status, stop/retry controls and useful service-unavailable messages. Answers should give practical next steps and link to existing Runway pages. Keep conversation history in page memory for the initial release; durable account history is a later decision. Do not imply access to the user's wallet, invoices or transactions in this phase. A request for a live balance or transaction lookup should explain the current limitation and link to the relevant app/explorer workflow.

## Knowledge and answer quality

Build a small, reviewed knowledge collection rather than training a custom model. Retrieve the relevant passages for each question and supply them as context to a language model.

- Runway sources: the user-facing content in `apps/web/src/guide.ts`, reconciliation semantics, verified deployment manifests and an explicit supported-feature summary. Internal handoffs, secrets and speculative backlog entries are not public assistant knowledge.
- Mezo sources: an allowlist of official user/developer documentation covering the network, MUSD, gas, wallets, borrowing, repayment and risks. Store reviewed excerpts with source URLs, section titles, network tags, content versions and review dates. Check the current canonical URLs during implementation; omit unverified or conflicting material until reviewed.
- Distinguish features available in Runway from workflows that currently open the external Mezo app. Distinguish testnet from mainnet throughout.
- Link factual answers to the actual retrieved sources. The server must validate citation IDs and map them to approved URLs; the model cannot invent a source link. If the evidence does not support an answer, say so instead of filling the gap.
- Do not present documentation snapshots as live network state. Time-sensitive fees, thresholds, addresses and protocol parameters require explicit network/version context and a reviewed source; otherwise direct users to the current official page. Do not turn educational explanations into personalized borrowing recommendations.
- Treat retrieved passages and user messages as content, not instructions that can override the assistant's allowed behavior. Phase 1 has no transaction tools, database query tools, arbitrary URL fetching or access to private workspace records.

Start with section-based retrieval over this small collection. Evaluate whether embeddings/vector search improve answer quality before adding that infrastructure. Refresh and review the collection when Runway behavior or official Mezo guidance changes; do not crawl the web on every chat request.

## Proposed implementation in the current stack

Use the existing React frontend, same-origin Vercel `/api` proxy and Render Hono backend. The local implementation uses a React conversation UI and AI SDK server-side structured generation; this extends the established application rather than creating a separate agent service. Full answers are validated before display.

```text
Assistant page → POST /api/assistant/chat → validate and limit request
  → retrieve reviewed Runway/Mezo passages → language model
  → validated answer plus registered sources → Assistant page
```

The server owns the system instructions, context selection, citation registry and allowed model configuration. The browser sends bounded user questions, not trusted instructions, tool results or arbitrary source documents. Provider credentials remain server-side. The user supplied a paid Gemini key and authorized using it for implementation. The app has a durable configurable daily request cap; this is not a dollar budget. No provider subscription or new paid hosting was provisioned.

Add message/history/output limits, request timeout, cancellation, per-client throttling, concurrent-request bounds and a global usage budget. Enforce the existing exact-origin policy and validate request roles and body sizes. Provide a server-side enable/disable switch and sanitized errors. Log request IDs, latency, source IDs and usage without storing full questions or private data by default. Verify that streaming works across the actual Vercel-to-Render proxy, including cold starts and disconnects.

Likely implementation locations:

- `apps/web/src/Assistant.tsx`, `Router.tsx`, `Sidebar.tsx` and shared styles for the page and navigation.
- `apps/api/src/assistant.ts` and `app.ts` for validation, retrieval and chat responses.
- A versioned public knowledge directory and source manifest; exact placement can be chosen during implementation.
- Dedicated API, answer-quality and browser cases for the assistant.

No Solidity changes, wallet signing or production workspace writes are needed for Phase 1.

## Phase 1 release acceptance

1. A disconnected visitor can ask questions and follow up on desktop and mobile, with source links and working app navigation.
2. A reviewed evaluation set covers Runway usage, funding versus claims, cancellation/refund accounting, indexer lag, current borrowing limitations, Mezo basics, ambiguous questions, missing evidence and testnet/mainnet distinctions. Important accounting and network answers must be correct and supported before release.
3. Requests for live wallet/transaction information do not fabricate results or invoke tools. Attempts to reveal secrets, change instructions or introduce unsupported sources do not bypass the server's boundaries.
4. Loading, cancellation, retry, rate limits, exhausted budget, provider failures and Render cold starts produce usable UI states. Untrusted answer content is rendered safely.
5. Hosted checks confirm the complete browser → proxy → API → model → cited-answer flow. Measure response time, token usage and cost on the evaluation set before choosing final limits.
6. Update the user guide and handoff to describe only the shipped phase. Real-wallet signing remains a separate existing validation task.

## Later phase details

Phase 2 tools should reuse existing typed chain readers, transaction receipt handling and confirmed reconciliation data. Validate addresses, hashes, chain IDs and contract identity before reads. Display source block, confirmation status and data freshness. A public address lookup does not prove wallet ownership; access to private workspace records must always use server-side session authorization. Return deterministic structured results and let the model explain them, preserving exact base-unit accounting.

Phase 3 should expose a narrow allowlist of app operations. First show the proposed recipient, token, network, amount and terms. Revalidate permissions and values when the user confirms, and use the existing simulation, wallet confirmation and recovery flows for financial transactions. Never accept an arbitrary contract, calldata or destination generated by the model as an executable instruction. AI assistance does not bypass the app's existing ownership and transaction rules.

## Technical references

- [AI SDK chat UI](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK streaming generation](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [Mezo official MUSD overview](https://testnet.mezo.org/docs/users/borrow/)

These links establish starting references; exact SDK APIs, model availability and canonical Mezo source pages must be checked again during implementation.
