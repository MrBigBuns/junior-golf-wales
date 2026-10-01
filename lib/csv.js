// Minimal RFC 4180 CSV helpers (quoted fields, embedded commas/quotes/newlines).

function toCsv(rows) {
  const cell = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM so Excel opens it as UTF-8 (keeps characters like the £ sign and Welsh accents)
  return '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// Excel saves "CSV (Comma delimited)" in Windows-1252, "CSV UTF-8" in UTF-8.
function decodeUpload(buffer) {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
}

module.exports = { toCsv, parseCsv, decodeUpload };
