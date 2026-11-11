/**
 * Baixa uma tabela como CSV que o Excel brasileiro abre direto:
 * separador ";" e BOM UTF-8 (acentos corretos). Valores com ; " ou quebra de linha vão entre aspas.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Centavos no formato numérico do Excel BR (vírgula decimal, sem "R$"). */
export const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
