const A = obj => 'cashuA' + Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');
const bytes = hex => Buffer.from(hex, 'hex');
const sig = '02' + '17'.repeat(32), key = '0011223344556677';
function proof(o = {}) { return { amount: 2, id: key, secret: 'synthetic-secret-alpha', C: sig, ...o }; }
function v3(ps = [proof()], extra = {}) { return { token: [{ mint: 'https://mint.example', proofs: ps }], unit: 'sat', ...extra }; }
function v4(ps = [proof()], extra = {}) {
  return new Map([['m', 'https://mint.example'], ['u', 'sat'], ['t', [new Map([['i', bytes(key)], ['p', ps.map(p => new Map([['a', BigInt(p.amount)], ['s', p.secret], ['c', bytes(p.C)]]))]])]], ...Object.entries(extra)]);
}
function enc(x) {
  function head(m, v) {
    v = BigInt(v);
    if (v < 24n) return Buffer.from([(m << 5) | Number(v)]);
    const n = v <= 255n ? 1 : v <= 65535n ? 2 : v <= 4294967295n ? 4 : 8;
    const b = Buffer.alloc(n + 1); b[0] = m << 5 | ({1:24,2:25,4:26,8:27})[n];
    for (let i = n; i > 0; i--) { b[i] = Number(v & 255n); v >>= 8n; }
    return b;
  }
  if (typeof x === 'bigint' || Number.isInteger(x)) return x < 0 ? head(1, -1n - BigInt(x)) : head(0, x);
  if (typeof x === 'string') { const b = Buffer.from(x); return Buffer.concat([head(3, b.length), b]); }
  if (Buffer.isBuffer(x)) return Buffer.concat([head(2, x.length), x]);
  if (Array.isArray(x)) return Buffer.concat([head(4, x.length), ...x.map(enc)]);
  if (x instanceof Map) return Buffer.concat([head(5, x.size), ...Array.from(x, ([k,v]) => [enc(k),enc(v)]).flat()]);
  if (x === null) return Buffer.from([246]);
  if (typeof x === 'boolean') return Buffer.from([x ? 245 : 244]);
  throw Error('unsupported fixture type');
}
const B = x => 'cashuB' + enc(x).toString('base64url');
module.exports = { A, B, enc, proof, v3, v4, bytes, sig, key };
