import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, zonedToUtc, utcToZoned, dayOfWeek, dayRangeUtc } from './time';

const tz = 'America/Sao_Paulo';
const date = '2026-11-16'; // segunda-feira
const base = { date, tz, workStart: '09:00', workEnd: '12:00', stepMinutes: 15, notBefore: new Date(0) };
const at = (t: string) => zonedToUtc(date, t, tz);

test('fuso: 09:00 em São Paulo = 12:00 UTC e volta igual', () => {
  assert.equal(at('09:00').toISOString(), '2026-11-16T12:00:00.000Z');
  assert.deepEqual(utcToZoned(at('09:00'), tz), { date, time: '09:00' });
  assert.equal(dayOfWeek(date), 1);
  assert.equal(dayRangeUtc(date, tz).end.toISOString(), '2026-11-17T03:00:00.000Z');
});

test('serviço de 60 min só aparece onde cabe inteiro', () => {
  const busy = [{ start: at('10:00'), end: at('10:35') }];
  const slots = computeSlots({ ...base, durationMinutes: 60, busy });
  assert.deepEqual(slots, ['09:00', '10:45', '11:00']);
});

test('serviço curto usa os buracos e respeita o fim da jornada', () => {
  const busy = [{ start: at('10:00'), end: at('10:35') }];
  const slots = computeSlots({ ...base, durationMinutes: 35, busy });
  assert.ok(slots.includes('09:15')); // 09:15–09:50 cabe antes de 10:00
  assert.ok(!slots.includes('09:30')); // 09:30–10:05 bateria no agendamento
  assert.equal(slots.at(-1), '11:15'); // 11:15–11:50; 11:30 passaria das 12:00
});

test('não oferece horário antes de notBefore (antecedência mínima)', () => {
  const slots = computeSlots({ ...base, durationMinutes: 30, busy: [], notBefore: at('11:00') });
  assert.deepEqual(slots, ['11:00', '11:15', '11:30']);
});
