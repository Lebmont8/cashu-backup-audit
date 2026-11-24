'use strict';
(() => {
  const $ = id => document.getElementById(id), input = $('tokens');
  let report = null;
  function resetReport() {
    report = null; $('export').disabled = true; $('result').hidden = true;
    $('rows').replaceChildren(); $('errors').replaceChildren();
  }
  function clearError() {
    input.setAttribute('aria-invalid', 'false'); input.setAttribute('aria-describedby', 'help');
    $('input-error').hidden = true; $('input-error').textContent = '';
  }
  input.addEventListener('input', () => {
    resetReport(); clearError(); $('status').textContent = 'Input changed. Analyse again for an up-to-date report.';
  });
  $('analyse').addEventListener('click', () => {
    clearError(); report = CashuAudit.audit(input.value);
    $('export').disabled = false; $('result').hidden = false;
    $('summary').textContent = report.valid_tokens + ' parsed token(s) · ' + report.listed_proofs + ' listed proofs · ' + report.duplicate_copies + ' repeated copies' + (report.complete ? '' : ' · INCOMPLETE: invalid input is excluded.');
    $('rows').replaceChildren(); $('errors').replaceChildren();
    for (const g of report.groups) {
      const row = document.createElement('tr');
      for (const text of [g.mint + ' / ' + (g.unit === null ? 'unspecified unit' : g.unit), g.listed_face_value, g.deduplicated_face_value, g.duplicate_copies, g.conflict_copies]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      $('rows').append(row);
    }
    for (const error of report.errors) {
      const li = document.createElement('li'); li.textContent = (error.line ? 'Line ' + error.line + ': ' : '') + error.message; $('errors').append(li);
    }
    $('conflict-note').hidden = !report.conflicting_identities;
    $('conflict-note').textContent = report.conflicting_identities + ' conflicting mint/secret identity group(s). All their copies are excluded from deduplicated values. Resolve the original backups; do not treat the displayed total as spendable.';
    $('short-note').textContent = report.eight_byte_keyset_copies ? report.eight_byte_keyset_copies + ' proof copies use 8-byte keyset IDs (legacy full IDs or shortened IDs). No mint keys were fetched.' : 'No short-keyset resolution was performed.';
    $('status').textContent = report.complete ? 'Analysis complete. All values remain unverified.' : 'Analysis incomplete. Review the input errors.';
    if (!report.complete) {
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'help input-error');
      $('input-error').textContent = 'Some input could not be analysed. See the errors below the table.'; $('input-error').hidden = false; input.focus();
    }
  });
  $('clear').addEventListener('click', () => {
    input.value = ''; resetReport(); clearError(); $('summary').textContent = '';
    $('conflict-note').textContent = ''; $('short-note').textContent = '';
    $('status').textContent = 'Cleared. Browser memory is not securely erased.'; input.focus();
  });
  $('export').addEventListener('click', () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cashu-audit-redacted.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('status').textContent = 'Redacted report exported. Mint URLs and amounts are still metadata.';
  });
})();
