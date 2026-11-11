import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL, centsToInput, formatPhone } from './format';

test('parseBRL entende os formatos que a equipe digita', () => {
  assert.equal(parseBRL('45'), 4500);
  assert.equal(parseBRL('45,90'), 4590);
  assert.equal(parseBRL('45.90'), 4590);
  assert.equal(parseBRL('R$ 1.234,56'), 123456);
  assert.equal(parseBRL('0,1'), 10);
  assert.equal(parseBRL(''), null);
  assert.equal(parseBRL('abc'), null);
});

test('centsToInput é o inverso de parseBRL', () => {
  assert.equal(centsToInput(4590), '45,90');
  assert.equal(parseBRL(centsToInput(123456)), 123456);
});

test('formatPhone mostra número brasileiro no formato local', () => {
  assert.equal(formatPhone('+5511966661234'), '(11) 96666-1234');
  assert.equal(formatPhone('+551133334444'), '(11) 3333-4444');
  assert.equal(formatPhone('+14155550123'), '+14155550123');
});
