# Cashu Backup Audit

A small offline tool for comparing saved Cashu token strings. It finds repeated proofs across backups so copies do not look like extra ecash. It also flags inconsistent copies rather than choosing one silently.

**This is not a wallet or a balance checker. Every amount is an unverified face value.** A structurally correct token may be forged, spent, locked, expired or unavailable at its mint. This tool cannot establish redeemability.

## Run

Download the repository from a source you trust and open **index.html** locally in a modern browser. There is no server, installation, build step, CDN or wallet connection.

Paste one cashuA or cashuB token per line, then choose **Analyse backups**. Clear removes the visible input and results. Export downloads only the redacted report.

For the same analysis from a terminal, use Node.js 20 or newer:

    node cli.cjs < tokens.txt > report.json

The CLI accepts stdin only, so bearer tokens need not appear in command arguments or shell history. It prints JSON, never proof material. Exit codes: 0 = parsed without conflicting copies; 2 = incomplete/invalid input; 3 = conflicting proof copies; 64 = incorrect invocation. Repeated identical backups alone are not an error. Protect your original backup file yourself; the tool does not delete or modify it.

## Read a report

Results are grouped by normalized mint URL **and** currency unit. There is no combined balance across mints or currencies.

| Column | Meaning |
| --- | --- |
| Listed | Face value of every parsed proof copy, including repeated backups |
| Deduplicated | One face value per identical mint/secret identity, excluding every conflicting identity |
| Repeated copies | Extra copies with the same amount, unit, keyset and signature |
| Conflict copies | Every copy belonging to an identity with contradictory amount, unit, keyset or signature |

For example, pasting the same two-proof 10-sat backup twice lists 20 sat and deduplicates to 10 sat. That **does not** establish that 10 sat can be spent.

If two copies share a mint and secret but disagree on a core field, all copies of that identity are excluded from deduplicated values. A missing V3 unit stays unspecified; it is never assumed to be sat. Equal secrets at different mints are kept separate.

Short and full keyset IDs are not resolved or assumed equivalent. Eight-byte IDs can also be complete legacy IDs. A short/full mismatch for the same mint and secret is conservatively reported as a conflict, not silently merged. Spending-condition secrets are treated as opaque UTF-8 strings; no script or witness is evaluated.

Invalid lines remain visible as sanitized errors, with line numbers. Other parsed lines are included, but the whole report is explicitly **incomplete**. In the JSON API, valid_tokens means structurally parsed tokens, not validated money.

## Privacy and boundaries

- No mint requests, backend, analytics, external fonts, automatic clipboard reading, cookies, localStorage, IndexedDB or service worker.
- No token, proof secret, signature, witness, memo, input string or secret fingerprint appears in the report or errors. Mint URLs and amounts **are metadata**; the report is not anonymous.
- Tokens are bearer data. Use a trusted computer and review downloaded code before entering real funds. Browser extensions, malware, the OS, swap, crash reports and browser internals are outside this tool's control.
- Clear drops the UI's references and removes the visible input/report. JavaScript and browser memory cannot be securely erased; close the tab afterward. The CLI does not securely erase process memory either.
- The page has a restrictive meta CSP, including connect-src 'none', form-action 'none' and worker-src 'none'. This is defense in depth, not a guarantee against a compromised browser or modified source.
- No public hosted form is needed: the app works from disk. Do not paste live tokens into a random hosted copy.

## Supported inputs

NUT-00 cashuA (V3 JSON) and cashuB (V4 CBOR), including the optional cashu: URI prefix and padded/unpadded base64url. V3 may contain multiple mints. V4 supports 8-byte and 33-byte keyset IDs structurally.

Positive integer amounts use exact BigInt arithmetic. JSON amount spellings must be plain integers no larger than Number.MAX_SAFE_INTEGER; unsafe JSON integers, fractions and exponent spellings are rejected rather than rounded. CBOR unsigned integers through 2^64−1 are accepted; totals may exceed that value.

Unknown fields and map order do not affect analysis. Duplicate map keys and malformed encodings are rejected. CBOR parsing is bounded and supports definite/indefinite collections and strings. See [SPEC.md](SPEC.md) for the exact supported subset and limits.

This is deliberately not a complete Cashu wallet implementation: no cryptographic point validation, DLEQ/signature validation, key fetching, keyset resolution, fees, expiry, spent-state checks, swaps, redemption or raw crawB/binary input.

## Tests

    node --test test/*.test.cjs

The suite covers the official public NUT-00 vectors (10 sat and 4 sat), cross-encoding duplicates, inconsistent copies, integer boundaries, malformed encodings, resource limits, deterministic malformed CBOR cases, redaction and real CLI input/output.

Browser QA is recorded in [QA.md](QA.md). Chrome was exercised with public/synthetic inputs, local-file opening, real keyboard/pointer events and an actual downloaded report. Firefox, Safari and assistive technologies have not been tested; no cross-browser or full accessibility acceptance is claimed.

## About this contribution

Created in November 2026 for [Nut November](https://nutnovember.org/). Original implementation developed with an AI coding assistant and tested by the project maintainer. No production token data was used. The project does not promise a prize or income.

MIT licensed. The public specification examples in test/vectors.json retain their upstream MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
