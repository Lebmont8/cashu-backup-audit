# Parsing and report contract

Reference: [NUT-00](https://github.com/cashubtc/nuts/blob/8f83a974503643d47fef12614039dca0e17e8ab1/00.md) and [NUT-02](https://github.com/cashubtc/nuts/blob/8f83a974503643d47fef12614039dca0e17e8ab1/02.md), checked 2026-11-24. This tool inspects the serialization, not Cashu validity.

## Limits

| Resource | Bound |
| --- | --- |
| Entire input | 1,048,576 UTF-8 bytes |
| Nonempty lines | 200 tokens |
| Accepted proof copies across the batch | 10,000 |
| Nested values | Depth 32 |
| Parsed values per token | 60,000 nodes |
| Individual secret | 16,384 UTF-16 code units; valid Unicode scalar sequence |
| Mint URL | 2,048 code units |
| Unit label | 1–32 ASCII letters/digits/underscore/hyphen, starting with a letter |

Blank lines are ignored. Each remaining line is one token; leading/trailing whitespace is trimmed. Multi-line wrapped tokens, raw binary tokens and legacy token versions other than A/B are not supported. A failed line contributes no proofs; errors make the report incomplete.

## Encoding

Base64url permits optional correct terminal padding, rejects noncanonical unused bits, invalid characters and invalid lengths. Decoded text must be valid UTF-8.

JSON is parsed with a bounded reader into Maps, rejecting repeated keys. Unknown fields are parsed safely but not copied to the report. Only positive, plain JSON integer amount spellings within 2^53−1 are accepted; exponent/fraction spellings are deliberately rejected. Negative, zero and unsafe amounts are errors.

CBOR supports unsigned/negative integers, strings/bytes, arrays/maps, simple values, floats and tagged values during structural parsing. It accepts definite and indefinite standard collections/strings; each indefinite text chunk must be valid UTF-8. Reserved encodings, misplaced break markers, duplicate primitive map keys, truncation and trailing bytes are rejected. Known fields still require their exact expected types: CBOR amount must be an unsigned positive integer, not a float or tagged integer; keyset/signature fields must be byte strings. Tags and numeric forms in unknown fields are ignored after bounded parsing.

## Proof fields

V3 uses token[].mint, token[].proofs[].{amount,id,secret,C} and optional top-level unit. V4 uses m, u and t[].{i,p}; proofs inside p use a,s,c. Keyset IDs have 8 or 33 bytes (16 or 66 hex characters). Signatures have 33 bytes and a compressed 02/03 prefix. These checks establish shape only, not that a point lies on secp256k1.

The tool does not retrieve public keys or resolve shortened IDs. NUT-02 legacy IDs prefixed 00 are complete 8-byte identifiers; 8-byte V4 representations can also be shortened modern IDs. eight_byte_keyset_copies is a length observation, not a claim that all such IDs are shortened.

Optional DLEQ, witness and memo fields are ignored. A missing or incorrect DLEQ/witness can affect actual spendability; the tool makes no judgment about it. Secrets are opaque Unicode strings; spending conditions are not evaluated.

Mint URLs must use HTTP(S), with no embedded credentials, query, fragment, whitespace or backslash. WHATWG URL parsing normalizes scheme/host/default port/path, then trailing slashes are removed. No network request is made. Currency labels preserve case; omitted V3 unit is null, distinct from sat and all explicit units.

## Deduplication

1. Internal identity: normalized mint URL plus exact secret string.
2. Internal variant: unit, amount, keyset ID and signature.
3. One variant: count its amount once in that mint/unit group.
4. Multiple variants: mark a conflicting identity and exclude every variant/copy from deduplicated values.
5. Additional copies of the same variant increment duplicate_copies even if another variant makes that identity conflicting.

Neither identity keys, variant strings nor hashes of secrets are exported. Different mints never merge. Unresolved short/full IDs are not considered equivalent. The conservative result can undercount; it must never be described as a spendable balance.

## Public API

token.js exposes CashuAudit.audit(text) in a browser and {audit,LIMITS} through CommonJS. audit returns a redacted report; it does not expose parsed proofs. No I/O is performed. Report amount values are decimal strings, not JSON numbers. Report format is cashu-backup-audit/1.

complete describes parsing completeness, not authenticity or redeemability. valid_tokens means parseable tokens; invalid_tokens counts rejected entries (or one overall limit/empty-input error). There is no all-mint or all-unit amount total.

This is a bounded inspection subset, not a NUT conformance certification.
