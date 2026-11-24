/* MIT License. Cashu Backup Audit. No I/O; reports never contain proof material. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CashuAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ bytes: 1048576, tokens: 200, proofs: 10000, depth: 32, nodes: 60000 });
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  const messages = Object.freeze({
    INPUT: 'Use one cashuA or cashuB token per line.',
    LIMIT: 'Input exceeds a documented size, count or nesting limit.',
    BASE64: 'Invalid base64url encoding.',
    JSON: 'Invalid or ambiguous JSON structure.',
    CBOR: 'Invalid, truncated or ambiguous CBOR structure.',
    FORMAT: 'Unsupported token prefix or structure.',
    MINT: 'Mint must be an HTTP(S) URL without credentials, query or fragment.',
    UNIT: 'Invalid currency unit.',
    PROOF: 'Invalid proof amount, keyset, secret or compressed signature.',
    EMPTY: 'No tokens supplied.'
  });
  function fail(code) { const e = new Error(messages[code]); e.auditCode = code; throw e; }
  function budget() {
    let n = 0;
    return depth => { if (depth > LIMITS.depth || ++n > LIMITS.nodes) fail('LIMIT'); };
  }
  // Parse JSON explicitly so duplicate keys cannot silently override proof fields.
  function jsonRead(text) {
    let p = 0;
    const tick = budget();
    function ws() { while (p < text.length && /[ \t\r\n]/.test(text[p])) p++; }
    function string() {
      const start = p++;
      while (p < text.length) {
        const c = text[p++];
        if (c === '"') {
          try { return JSON.parse(text.slice(start, p)); } catch { fail('JSON'); }
        }
        if (c === '\\') p++;
      }
      fail('JSON');
    }
    function value(depth) {
      tick(depth); ws(); const c = text[p];
      if (c === '"') return string();
      if (c === '[') {
        p++; ws(); const a = [];
        if (text[p] === ']') { p++; return a; }
        for (;;) {
          a.push(value(depth + 1)); ws();
          if (text[p] === ']') { p++; return a; }
          if (text[p++] !== ',') fail('JSON');
        }
      }
      if (c === '{') {
        p++; ws(); const m = new Map();
        if (text[p] === '}') { p++; return m; }
        for (;;) {
          ws(); if (text[p] !== '"') fail('JSON');
          const k = string(); ws();
          if (text[p++] !== ':' || m.has(k)) fail('JSON');
          m.set(k, value(depth + 1)); ws();
          if (text[p] === '}') { p++; return m; }
          if (text[p++] !== ',') fail('JSON');
        }
      }
      for (const [word, v] of [['true', true], ['false', false], ['null', null]]) {
        if (text.startsWith(word, p)) { p += word.length; return v; }
      }
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(p));
      if (!match) fail('JSON');
      p += match[0].length;
      // Retain the original spelling to reject rounded JSON proof amounts.
      return { jsonNumber: match[0] };
    }
    const out = value(0); ws(); if (p !== text.length) fail('JSON');
    return out;
  }
  function cborRead(bytes) {
    let p = 0;
    const tick = budget(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function need(n) { if (n < 0 || p + n > bytes.length) fail('CBOR'); }
    function uint(n) {
      need(n); let x = 0n;
      for (let i = 0; i < n; i++) x = (x << 8n) | BigInt(bytes[p++]);
      return x;
    }
    function length(ai) {
      if (ai < 24) return BigInt(ai);
      if (ai <= 27) return uint(2 ** (ai - 24));
      if (ai === 31) return null;
      fail('CBOR');
    }
    function count(n) {
      if (n === null || n > BigInt(LIMITS.bytes)) fail('CBOR');
      return Number(n);
    }
    function read(depth) {
      tick(depth); need(1);
      const b = bytes[p++], major = b >> 5, ai = b & 31;
      if (major === 7) {
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22) return null;
        if (ai === 23) return undefined;
        if (ai < 20) return { simple: ai };
        if (ai === 24) { const v = Number(uint(1)); if (v < 32) fail('CBOR'); return { simple: v }; }
        if (ai === 25) {
          const h = Number(uint(2)), e = (h >> 10) & 31, f = h & 1023;
          return (h >> 15 ? -1 : 1) * (e === 31 ? (f ? NaN : Infinity) : e ? 2 ** (e - 15) * (1 + f / 1024) : 2 ** -14 * f / 1024);
        }
        if (ai === 26 || ai === 27) {
          const n = ai === 26 ? 4 : 8; need(n);
          const v = n === 4 ? view.getFloat32(p) : view.getFloat64(p); p += n; return v;
        }
        fail('CBOR');
      }
      const n = length(ai);
      if (major === 0 || major === 1) {
        if (n === null) fail('CBOR');
        return major === 0 ? n : -1n - n;
      }
      if (major === 2 || major === 3) {
        let out;
        if (n !== null) { const size = count(n); need(size); out = bytes.slice(p, p + size); p += size; }
        else {
          const chunks = []; let size = 0;
          for (;;) {
            need(1); if (bytes[p] === 255) { p++; break; }
            if ((bytes[p] >> 5) !== major || (bytes[p] & 31) === 31) fail('CBOR');
            // A text chunk must itself be valid UTF-8, not just the concatenation.
            const chunk = read(depth + 1), buf = major === 3 ? encoder.encode(chunk) : chunk;
            size += buf.length; if (size > LIMITS.bytes) fail('LIMIT');
            chunks.push(buf);
          }
          out = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
        }
        if (major === 2) return out;
        try { return utf8.decode(out); } catch { fail('CBOR'); }
      }
      if (major === 4 || major === 5) {
        const out = major === 4 ? [] : new Map();
        const size = n === null ? null : count(n);
        let i = 0;
        while (size === null || i < size) {
          need(1);
          if (size === null && bytes[p] === 255) { p++; break; }
          const k = read(depth + 1);
          if (major === 4) out.push(k);
          else {
            if (out.has(k)) fail('CBOR');
            out.set(k, read(depth + 1));
          }
          i++;
        }
        return out;
      }
      if (major === 6) {
        if (n === null) fail('CBOR');
        return { tag: n, value: read(depth + 1) };
      }
      fail('CBOR');
    }
    const result = read(0); if (p !== bytes.length) fail('CBOR'); return result;
  }
  function decode(s) {
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) fail('BASE64');
    const raw = s.replace(/=+$/, '');
    if (raw.length % 4 === 1 || (s.includes('=') && s.length % 4 !== 0)) fail('BASE64');
    let binary;
    try { binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/')); } catch { fail('BASE64'); }
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (canonical !== raw || (s.includes('=') && s.length - raw.length !== (4 - raw.length % 4) % 4)) fail('BASE64');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  function map(x) { if (!(x instanceof Map)) fail('FORMAT'); return x; }
  function list(x) { if (!Array.isArray(x) || !x.length) fail('FORMAT'); return x; }
  function mint(x) {
    if (typeof x !== 'string' || x.length > 2048 || /[\s\\]/u.test(x)) fail('MINT');
    let u; try { u = new URL(x); } catch { fail('MINT'); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) fail('MINT');
    return u.href.replace(/\/+$/, '');
  }
  function unit(x, optional) {
    if (x === undefined && optional) return null;
    if (typeof x !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(x)) fail('UNIT');
    return x;
  }
  function hex(x, sizes, signature) {
    let s;
    if (x instanceof Uint8Array) s = Array.from(x, b => b.toString(16).padStart(2, '0')).join('');
    else if (typeof x === 'string') s = x.toLowerCase();
    else fail('PROOF');
    if (!/^[0-9a-f]+$/.test(s) || !sizes.includes(s.length) || (signature && !/^(02|03)/.test(s))) fail('PROOF');
    return s;
  }
  function amount(x, json) {
    if (json) {
      if (!x || typeof x.jsonNumber !== 'string') fail('PROOF');
      // Only JSON integer spellings are accepted; reject exponent/fraction and rounded values.
      if (!/^[0-9]+$/.test(x.jsonNumber)) fail('PROOF');
      if (x.jsonNumber.length > 16) fail('PROOF');
      const b = BigInt(x.jsonNumber);
      if (b > BigInt(Number.MAX_SAFE_INTEGER)) fail('PROOF'); x = b;
    }
    if (typeof x !== 'bigint' || x <= 0n || x > 18446744073709551615n) fail('PROOF');
    return x;
  }
  function parseToken(text) {
    let s = text.startsWith('cashu:') ? text.slice(6) : text;
    if (!/^cashu[AB]/.test(s)) fail('FORMAT');
    const json = s[5] === 'A', bytes = decode(s.slice(6));
    let obj;
    if (json) { try { obj = jsonRead(utf8.decode(bytes)); } catch (e) { if (e.auditCode) throw e; fail('JSON'); } }
    else obj = cborRead(bytes);
    const root = map(obj), proofs = [];
    function proof(m, u, id, p) {
      map(p);
      const a = amount(p.get(json ? 'amount' : 'a'), json), secret = p.get(json ? 'secret' : 's');
      if (typeof secret !== 'string' || !secret.length || secret.length > 16384) fail('PROOF');
      if (!json && !(p.get('c') instanceof Uint8Array)) fail('PROOF');
      for (const c of secret) { const n = c.codePointAt(0); if (n >= 0xd800 && n <= 0xdfff) fail('PROOF'); }
      const signature = hex(p.get(json ? 'C' : 'c'), [66], true);
      if (++proofs.length > LIMITS.proofs) fail('LIMIT');
      proofs[proofs.length - 1] = { mint: m, unit: u, id, a, secret, signature };
    }
    if (json) {
      const u = unit(root.get('unit'), true);
      for (const entry of list(root.get('token'))) {
        map(entry); const m = mint(entry.get('mint'));
        for (const p of list(entry.get('proofs'))) {
          map(p); proof(m, u, hex(p.get('id'), [16, 66], false), p);
        }
      }
    } else {
      const m = mint(root.get('m')), u = unit(root.get('u'), false);
      for (const entry of list(root.get('t'))) {
        map(entry); if (!(entry.get('i') instanceof Uint8Array)) fail('PROOF');
        const id = hex(entry.get('i'), [16, 66], false);
        for (const p of list(entry.get('p'))) proof(m, u, id, p);
      }
    }
    return proofs;
  }
  function audit(input) {
    const report = {
      format: 'cashu-backup-audit/1', complete: true, valid_tokens: 0, invalid_tokens: 0,
      listed_proofs: 0, duplicate_copies: 0, conflicting_identities: 0, eight_byte_keyset_copies: 0,
      groups: [], errors: [],
      notice: 'Unverified face values only. No signature, keyset resolution, mint availability or spent-state check. Not a spendable balance.',
      privacy: 'No token, proof, secret, signature, witness, memo or secret hash is included. Mint URLs and amounts remain metadata.'
    };
    function error(line, code) {
      report.complete = false; report.invalid_tokens++; report.errors.push({ line, code, message: messages[code] || messages.FORMAT });
    }
    if (typeof input !== 'string') { error(0, 'INPUT'); return report; }
    if (input.length > LIMITS.bytes || encoder.encode(input).length > LIMITS.bytes) { error(0, 'LIMIT'); return report; }
    const lines = input.split(/\r?\n/).map((value, i) => ({ value: value.trim(), line: i + 1 })).filter(x => x.value);
    if (!lines.length) { error(0, 'EMPTY'); return report; }
    if (lines.length > LIMITS.tokens) { error(0, 'LIMIT'); return report; }
    const identities = new Map(), groups = new Map();
    function group(m, u) {
      const key = JSON.stringify([m, u]);
      if (!groups.has(key)) groups.set(key, { mint: m, unit: u, listed_face_value: 0n, deduplicated_face_value: 0n,
        listed_proofs: 0, duplicate_copies: 0, conflict_copies: 0 });
      return groups.get(key);
    }
    for (const { value, line } of lines) {
      let proofs;
      try {
        proofs = parseToken(value);
        if (report.listed_proofs + proofs.length > LIMITS.proofs) fail('LIMIT');
      } catch (e) { error(line, e.auditCode || 'FORMAT'); continue; }
      report.valid_tokens++;
      for (const p of proofs) {
        const g = group(p.mint, p.unit);
        report.listed_proofs++; g.listed_proofs++; g.listed_face_value += p.a;
        if (p.id.length === 16) report.eight_byte_keyset_copies++;
        const key = JSON.stringify([p.mint, p.secret]);
        if (!identities.has(key)) identities.set(key, { variants: new Map(), copies: [] });
        const entity = identities.get(key), fingerprint = JSON.stringify([p.unit, p.id, p.a.toString(), p.signature]);
        if (entity.variants.has(fingerprint)) { g.duplicate_copies++; report.duplicate_copies++; }
        else entity.variants.set(fingerprint, { a: p.a, g });
        entity.copies.push(g);
      }
    }
    for (const entity of identities.values()) {
      if (entity.variants.size > 1) {
        report.conflicting_identities++;
        for (const g of entity.copies) g.conflict_copies++;
      } else {
        const v = entity.variants.values().next().value; v.g.deduplicated_face_value += v.a;
      }
    }
    report.groups = Array.from(groups.values(), g => ({ ...g, listed_face_value: g.listed_face_value.toString(), deduplicated_face_value: g.deduplicated_face_value.toString() }))
      .sort((a, b) => a.mint.localeCompare(b.mint) || String(a.unit).localeCompare(String(b.unit)));
    return report;
  }
  return Object.freeze({ audit, LIMITS });
});
