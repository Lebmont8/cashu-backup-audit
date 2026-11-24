# Verification

Checked on Project81, 2026-11-24. No real bearer tokens, personal inbox or owner account profile was used. Public examples and synthetic data only.

Final result: **37/37 Node tests and 17/17 actual Chrome checks passed.**

## Automated checks

Node.js v24.19.0. The test suite covers public V3/V4 vectors, cross-encoding duplicates, same-secret conflicts, mint/unit separation, 33-byte IDs, missing units, exact uint64 and larger totals, unsafe JSON numbers, malformed/truncated CBOR/base64, unknown fields, indefinite collections, duplicate keys, redaction, input/depth/node/proof limits, 300 deterministic malformed byte sequences and CLI stdin/exit/output behavior.

The server's Node child-process invocation via the resolved /opt path returned EACCES. The test harness used the same installed Node through /usr/bin/node and --test-isolation=none; CLI subprocess tests also ran through /usr/bin/node. No executable permissions or system policy were changed. This is an environment-specific test invocation, not an application dependency.

## Actual browser

Chrome 157.0.8103.78 under a bounded DynamicUser service, private temporary 128 MiB RAM profile, memory cap 768 MiB, no owner cookies or account data. Local-app verification used PrivateNetwork, an isolated loopback static server, and direct file:/// opening.

Real pointer/keyboard interaction checked local-file operation, the two official 10/4-sat examples, duplicate/conflict reporting, 390px layout with long mint metadata, visible linked parsing errors, focus, clearing, stale-report invalidation, actual redacted JSON download, and no page network requests after static load. The initial keyboard test omitted the Enter text event in CDP; adding the real Enter event sequence fixed the test harness, not product code.

Desktop and mobile screenshots were visually reviewed. A mobile table readability issue was corrected with a deliberately scrollable table and explicit scroll guidance. Eight-byte keyset wording distinguishes legacy full IDs from potentially shortened IDs.

The error-state interaction follows the official Modern Web Guidance accessible-error-announcement guide: no premature invalid state, linked error and polite live status, focus on the input after an attempted invalid analysis. The outbound-connection guide informed the CSP fallback for a local static file. Connection-Allowlist is an HTTP-header, limited-browser feature and is not claimed as present here.

Guidance snapshot: GoogleChrome/modern-web-guidance 4dd968349e54ca45a05dd5c818fb035c9054b022.
Guides: accessibility/accessible-error-announcement.md; security/restrict-outbound-connections.md.

## Not verified

No Firefox/Safari/assistive-technology/full accessibility acceptance. No cryptographic Cashu proof validation, live mint availability, keyset resolution, spending-condition evaluation, spent-state or redeemability checks. No prize, acceptance or payment follows from these tests.

Official guides: https://github.com/GoogleChrome/modern-web-guidance/blob/4dd968349e54ca45a05dd5c818fb035c9054b022/skills/modern-web-guidance/guides/accessibility/accessible-error-announcement.md and https://github.com/GoogleChrome/modern-web-guidance/blob/4dd968349e54ca45a05dd5c818fb035c9054b022/skills/modern-web-guidance/guides/security/restrict-outbound-connections.md
