import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMessage, parseReply } from './messages';

const base = { clientName: 'João da Silva', tenantName: 'Barbearia Vikings', service: 'Corte', barber: 'Ragnar', date: '14/11', time: '09:30', link: 'https://x/agendamento#t' };

test('confirmação: template e texto com primeiro nome, link e ordem dos parâmetros', () => {
  const m = renderMessage({ ...base, type: 'CONFIRMATION' });
  assert.equal(m.template, 'agendamento_confirmado');
  assert.deepEqual(m.params, ['João', 'Barbearia Vikings', 'Corte', '14/11', '09:30', 'Ragnar', 'https://x/agendamento#t']);
  assert.ok(m.text.includes('confirmado') && m.text.includes('https://x/agendamento#t'));
});

test('confirmação pendente usa outro template', () => {
  assert.equal(renderMessage({ ...base, type: 'CONFIRMATION', pending: true }).template, 'agendamento_recebido');
});

test('lembrete pede 1 ou 2; mensagem livre não tem template', () => {
  assert.ok(renderMessage({ ...base, type: 'REMINDER' }).text.includes('Responda 1'));
  const free = renderMessage({ ...base, type: 'MESSAGE', text: 'oi' });
  assert.equal(free.template, null);
  assert.equal(free.text, 'oi');
});

test('respostas do cliente', () => {
  assert.equal(parseReply(' 1 '), 'CONFIRM');
  assert.equal(parseReply('Sim, confirmo'), 'CONFIRM');
  assert.equal(parseReply('2'), 'CANCEL');
  assert.equal(parseReply('cancelar'), 'CANCEL');
  assert.equal(parseReply('Sair'), 'OPT_OUT');
  assert.equal(parseReply('12'), null);
  assert.equal(parseReply('bom dia'), null);
});
