const XLSX = require('xlsx');
const wb = XLSX.readFile('temp/file/template.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
console.log('Sheet name:', wb.SheetNames[0]);
console.log('Range:', ws['!ref']);
const range = XLSX.utils.decode_range(ws['!ref']);
for (let r = range.s.r; r <= Math.min(range.e.r, 40); r++) {
  const row = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    row.push(ws[addr]?.v ?? '');
  }
  console.log(`Row ${r}:`, JSON.stringify(row));
}
console.log('Merges:', JSON.stringify(ws['!merges']));
