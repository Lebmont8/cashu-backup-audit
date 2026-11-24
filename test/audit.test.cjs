const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { audit, LIMITS } = require('../token.js');
const { A, B, enc, proof, v3, v4, bytes, sig, key } = require('./helpers.cjs');
const vectors = require('./vectors.json');
const good = A(v3());
const first = text => audit(text).groups[0];
const invalid = text => assert.equal(audit(text).complete, false);
test('NUT-00 official public vectors: V3=10 sat, V4=4 sat', () => {
  assert.equal(vectors.length, 2);
  for (const [i, value] of ['10','4'].entries()) {
    const r = audit(vectors[i]); assert.equal(r.complete, true); assert.equal(r.groups[0].listed_face_value, value);
  }
});
test('URI, unpadded, padded and CRLF input', () => {
  for (const t of [good, 'cashu:' + good, good + '='.repeat((4 - (good.length - 6) % 4) % 4)]) {
    assert.equal(first('\r\n' + t + '\r\n').deduplicated_face_value, '2');
  }
});
test('same-proof duplicates across JSON and CBOR are counted once', () => {
  const r = audit(good + '\n' + B(v4())); assert.equal(r.listed_proofs, 2); assert.equal(r.duplicate_copies, 1);
  assert.equal(r.groups[0].listed_face_value, '4'); assert.equal(r.groups[0].deduplicated_face_value, '2');
});
for (const [label, change] of Object.entries({ amount: { amount: 4 }, keyset: { id: '008899aabbccddee' }, signature: { C: '03' + '31'.repeat(32) } })) {
  test('conflicting ' + label + ' excludes every copy, not first/last wins', () => {
    const r = audit([good, good, A(v3([proof(change)]))].join('\n'));
    assert.equal(r.conflicting_identities, 1); assert.equal(r.groups[0].deduplicated_face_value, '0'); assert.equal(r.groups[0].conflict_copies, 3);
  });
}
test('conflicting units flag both currency groups', () => {
  const r = audit(good + '\n' + A(v3([proof()], { unit: 'usd' })));
  assert.equal(r.groups.length, 2); assert.equal(r.conflicting_identities, 1);
  assert.ok(r.groups.every(g => g.deduplicated_face_value === '0' && g.conflict_copies === 1));
});
test('same secret at two mints is not a duplicate', () => {
  const r = audit(good + '\n' + A(v3([proof()], { token: [{ mint: 'https://second.example', proofs: [proof()] }] })));
  assert.equal(r.conflicting_identities, 0); assert.equal(r.duplicate_copies, 0); assert.equal(r.groups.length, 2);
});
test('normalize mint origin and trailing slash; preserve path case', () => {
  assert.equal(first(A(v3([proof()], { token: [{ mint: 'https://MINT.EXAMPLE:443///', proofs: [proof()] }] }))).mint, 'https://mint.example');
  assert.notEqual(first(A(v3([proof()], { token: [{ mint: 'https://mint.example/Path', proofs: [proof()] }] }))).mint, first(good).mint);
});
test('multiple mints in V3, no aggregate across currencies', () => {
  const r = audit(A(v3([], { token: [{ mint: 'http://localhost:3338', proofs: [proof()] }, { mint: 'https://mint.example', proofs: [proof()] }] })));
  assert.equal(r.groups.length, 2); assert.equal(r.total, undefined);
});
test('omitted V3 unit stays unspecified; missing V4 unit fails', () => {
  const a = v3(); delete a.unit; assert.equal(first(A(a)).unit, null);
  const b = v4(); b.delete('u'); invalid(B(b));
});
test('structured spending-condition secret is treated as opaque text', () => {
  const p = proof({ secret: JSON.stringify(['P2PK', { data: 'not-a-real-pubkey' }]) });
  assert.equal(first(A(v3([p]))).deduplicated_face_value, '2'); assert.equal(first(B(v4([p]))).deduplicated_face_value, '2');
});
test('33-byte keyset IDs parse; short/full are not resolved as identical', () => {
  const long = key + '42'.repeat(25), b = v4(); b.get('t')[0].set('i', bytes(long));
  const r = audit(B(b)); assert.equal(r.complete, true); assert.equal(r.eight_byte_keyset_copies, 0);
  assert.equal(audit(B(b) + '\n' + good).conflicting_identities, 1);
});
test('unsigned CBOR uint64 exact and totals exceed uint64 without rounding', () => {
  const b = v4([proof(), proof({ secret: 'second-synthetic-secret' })]);
  for (const p of b.get('t')[0].get('p')) p.set('a', 18446744073709551615n);
  assert.equal(first(B(b)).deduplicated_face_value, '36893488147419103230');
});
test('safe JSON integer boundary accepted, unsafe/floating/exponent rejected', () => {
  assert.equal(first(A(v3([proof({ amount: Number.MAX_SAFE_INTEGER })]))).listed_face_value, '9007199254740991');
  for (const n of ['9007199254740992','9007199254740993','1e0','2.0','1e309','-1','0']) {
    invalid(A(JSON.stringify(v3()).replace('"amount":2', '"amount":' + n)));
  }
});
test('CBOR float amount rejected even when mathematically integer', () => {
  const b = enc(v4()), at = b.indexOf(Buffer.from([97,97,2]));
  const value = Buffer.concat([b.subarray(0, at + 2), Buffer.from([250,64,0,0,0]), b.subarray(at + 3)]);
  invalid('cashuB' + value.toString('base64url'));
});
test('unknown fields, CBOR tags and map order ignored without prototype assignment', () => {
  const b = v4(); b.set('__proto__', new Map([['polluted', true]])); b.set('unknown', [1n, null, true]);
  const reversed = new Map(Array.from(b).reverse());
  assert.equal(first(B(reversed)).listed_face_value, '2'); assert.equal({}.polluted, undefined);
  const a = v3(); a.unknown = { nested: 2.5 }; assert.equal(first(A(a)).listed_face_value, '2');
});
test('unknown CBOR tagged value accepted; known typed field tag rejected', () => {
  const b = enc(v4()), unknown = Buffer.concat([Buffer.from([b[0] + 1]), b.subarray(1), enc('x'), Buffer.from([193,1])]);
  assert.equal(first('cashuB' + unknown.toString('base64url')).listed_face_value, '2');
  const i = b.indexOf(enc('sat')); const tag = Buffer.concat([b.subarray(0,i),Buffer.from([193]),b.subarray(i)]);
  invalid('cashuB' + tag.toString('base64url'));
});
test('indefinite CBOR root, arrays, byte and text strings parse', () => {
  const b = enc(v4());
  const indefiniteRoot = Buffer.concat([Buffer.from([191]), b.subarray(1), Buffer.from([255])]);
  assert.equal(first('cashuB' + indefiniteRoot.toString('base64url')).listed_face_value, '2');
  for (const [old, replacement] of [
    [enc('sat'), Buffer.concat([Buffer.from([127]), enc('s'), enc('at'), Buffer.from([255])])],
    [enc(bytes(key)), Buffer.concat([Buffer.from([95]), enc(bytes(key.slice(0,8))), enc(bytes(key.slice(8))), Buffer.from([255])])],
    [enc(v4().get('t')), Buffer.concat([Buffer.from([159]), enc(v4().get('t')[0]), Buffer.from([255])])]
  ]) {
    const i = b.indexOf(old); assert.ok(i >= 0);
    assert.equal(first('cashuB' + Buffer.concat([b.subarray(0,i), replacement,b.subarray(i + old.length)]).toString('base64url')).listed_face_value, '2');
  }
});
test('duplicate known JSON and CBOR map keys rejected', () => {
  invalid(A(JSON.stringify(v3()).replace('"unit":"sat"', '"unit":"sat","unit":"usd"')));
  const b = enc(v4()); invalid('cashuB' + Buffer.concat([Buffer.from([b[0]+1]),b.subarray(1),enc('u'),enc('usd')]).toString('base64url'));
});
test('malformed base64, prefixes, padding, noncanonical bits rejected', () => {
  for (const s of ['', 'cashuCabc', 'cashuB*', 'cashuB=', 'cashuBA', 'cashuBYQ=', 'cashuBYR', good + '===', good + ' x', 'cashuB__8']) invalid(s);
});
test('truncated CBOR every byte offset and trailing data are rejected', () => {
  const b = enc(v4());
  for (let i = 0; i < b.length; i++) invalid('cashuB' + b.subarray(0,i).toString('base64url'));
  invalid('cashuB' + Buffer.concat([b, Buffer.from([0])]).toString('base64url'));
});
test('CBOR reserved types, map break, invalid UTF8, chunk types reject', () => {
  for (const hex of ['f81f','f800','ff','1c','9fff00','bf616dff','7f4100ff','7f61c261a2ff','5f7f6161ffff','bfff','a16175ff']) {
    invalid('cashuB' + Buffer.from(hex,'hex').toString('base64url'));
  }
});
for (const [field, value] of [['amount','2'],['amount',null],['id','00'],['C','04'+'ab'.repeat(32)],['C',sig.slice(2)],['secret',''],['secret',42]]) {
  test('reject invalid proof field ' + field + ':' + String(value).slice(0,10), () => invalid(A(v3([proof({[field]:value})]))));
}
test('invalid mint credentials/query/fragment/scheme and unit rejected', () => {
  for (const mint of ['https://user:pass@mint.example','https://mint.example/?secret=foo','https://mint.example/#foo','javascript:alert(1)',' https://mint.example']) invalid(A(v3([], { token:[{mint,proofs:[proof()]}] })));
  for (const unit of ['', '<script>', 'x'.repeat(33), null]) invalid(A(v3([proof()],{unit})));
});
test('partial invalid lines retain valid totals with incomplete status and line index', () => {
  const r = audit(good + '\nprivate-bearer-like-garbage');
  assert.equal(r.complete, false); assert.equal(r.valid_tokens, 1); assert.equal(r.invalid_tokens, 1);
  assert.equal(r.errors[0].line, 2); assert.equal(r.groups[0].listed_face_value, '2');
});
test('no bearer material, memo, witness, input or fingerprints escape report/errors', () => {
  const p = proof({ secret:'PRIVATE_SYNTHETIC_SECRET', witness:'PRIVATE_WITNESS', C:sig });
  const b = v3([p], { memo:'PRIVATE_MEMO' });
  const out = JSON.stringify(audit(A(b) + '\nPRIVATE_INVALID_TOKEN'));
  for (const v of [p.secret, p.witness, sig, b.memo, 'PRIVATE_INVALID_TOKEN', A(b)]) assert.ok(!out.includes(v));
  assert.ok(!out.includes('fingerprint'));
});
test('byte, token, proof, depth and node limits fail boundedly', () => {
  invalid('x'.repeat(LIMITS.bytes + 1)); invalid(Array(201).fill(good).join('\n'));
  let a = v3(); a.extra = 0; for (let i=0;i<40;i++) a.extra = [a.extra]; invalid(A(a));
  let b = v4(); let x = 0n; for (let i=0;i<40;i++) x=[x]; b.set('x',x); invalid(B(b));
  a = v3(); a.extra = Array(60000).fill(0); invalid(A(a));
  // Use tiny, structurally valid proofs to stay under the input-byte limit.
  const many=B(v4(Array.from({length:6000},()=>proof({secret:'s'})))); const overflow=audit(many+'\n'+many); assert.equal(overflow.errors[0].code,'LIMIT'); assert.equal(overflow.valid_tokens,1);
});
test('deterministic malformed CBOR fuzz yields redacted reports without throws', () => {
  let seed=12345;
  for(let n=0;n<300;n++){
    const b=Buffer.alloc(1+n%127);
    for(let i=0;i<b.length;i++){ seed=(Math.imul(seed,1664525)+1013904223)>>>0;b[i]=seed>>>24; }
    const r=audit('cashuB'+b.toString('base64url')); assert.equal(typeof r.complete,'boolean');
  }
});
test('CLI uses stdin, safe redacted JSON, exits 0/2/3 and rejects arguments', () => {
  const cli = path.join(__dirname,'..','cli.cjs');
  const run = (input,args=[])=>spawnSync(process.env.CASHU_TEST_NODE || process.execPath,[cli,...args],{input,encoding:'utf8',maxBuffer:2e6});
  assert.equal(run(good).status,0); assert.equal(run('private-invalid').status,2);
  assert.equal(run(good+'\n'+A(v3([proof({amount:4})]))).status,3);
  assert.equal(run('', ['do-not-echo-token']).status,64);
  assert.ok(!run('', ['do-not-echo-token']).stderr.includes('do-not-echo-token'));
  assert.equal(run('x'.repeat(LIMITS.bytes+1)).status,2);
  assert.ok(!run(good).stdout.includes('synthetic-secret-alpha'));
  assert.equal(JSON.parse(run(good).stdout).groups[0].listed_face_value,'2');
});

test("unpaired surrogate secret rejected; Unicode scalar secret accepted",()=>{invalid(A(v3([proof({secret:"\ud800"})])));assert.equal(first(A(v3([proof({secret:"synthetic-\u{1f330}"})]))).listed_face_value,"2");});
