#!/usr/bin/env node
'use strict';
const { audit, LIMITS } = require('./token.js');
if (process.argv.length !== 2) {
  process.stderr.write('Usage: node cli.cjs < tokens.txt\nNo token arguments or file paths: input is read from stdin only.\n');
  process.exitCode = 64;
} else {
  const chunks = []; let bytes = 0, done = false;
  function emit(report) {
    if (done) return; done = true;
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = !report.complete ? 2 : report.conflicting_identities ? 3 : 0;
  }
  process.stdin.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > LIMITS.bytes) {
      emit(audit('x'.repeat(LIMITS.bytes + 1))); chunks.length = 0; process.stdin.destroy(); return;
    }
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    if (done) return;
    try { emit(audit(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
    catch { emit(audit(null)); }
    chunks.length = 0;
  });
  process.stdin.on('error', () => { if (!done) emit(audit(null)); });
}
