import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../shared/export.js';
test('CSV export neutralizes formula prefixes, including whitespace, without changing ordinary references', () => {
  for (const value of [
    '=1+1',
    '+SUM(A1)',
    '-1+1',
    '@formula',
    '  =HYPERLINK("https://example.com")',
    '\t=1',
    '\rvalue',
    '\nvalue',
  ])
    assert.ok(csvCell(value).startsWith("'"));
  assert.equal(csvCell('Office coffee, 500g'), 'Office coffee, 500g');
  assert.equal(csvCell('CAPTURE-123'), 'CAPTURE-123');
  assert.equal(csvCell(18), '18');
  assert.equal(csvCell(null), '');
});
