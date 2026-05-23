import { formatMonthLabel, moneyFromCents } from './dateMoney.js';

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.fillStyle = options.color || '#3d1f2e';
  ctx.font = `${options.weight || 600} ${options.size || 24}px Inter, Arial, sans-serif`;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(text), x, y);
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 3 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function isIncomeRecord(record) {
  return (record?.type || 'expense') === 'income';
}

function categoryNameFor(expense, categoryMap) {
  if (isIncomeRecord(expense)) return 'Income';
  return categoryMap.get(String(expense.categoryId)) || 'Uncategorized';
}

export function exportStatementImage(data, { month }) {
  const categories = data.categories || [];
  const categoryMap = new Map(categories.map((c) => [String(c._id), c.name]));
  const allExpenses = data.expenses || [];
  const rows = allExpenses
    .filter((x) => !month || String(x.date || '').startsWith(`${month}-`))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const incomeRows = rows.filter(isIncomeRecord);
  const expenseRows = rows.filter((x) => !isIncomeRecord(x));
  const totalIn = incomeRows.reduce((sum, x) => sum + Number(x.amountCents || 0), 0);
  const totalOut = expenseRows.reduce((sum, x) => sum + Number(x.amountCents || 0), 0);
  const balance = totalIn - totalOut;
  const width = 1200;
  const rowHeight = 54;
  const height = Math.max(1380, 820 + Math.max(rows.length, 8) * rowHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#fff7fb');
  bg.addColorStop(0.45, '#ffffff');
  bg.addColorStop(1, '#fdf2f8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 60, 60, width - 120, height - 120, 36);
  ctx.fill();
  ctx.strokeStyle = 'rgba(219, 39, 119, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fce7f3';
  roundedRect(ctx, 90, 90, 88, 88, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const logoGrad = ctx.createLinearGradient(104, 100, 168, 168);
  logoGrad.addColorStop(0, '#fbcfe8');
  logoGrad.addColorStop(0.45, '#f472b6');
  logoGrad.addColorStop(1, '#be185d');
  ctx.fillStyle = logoGrad;
  roundedRect(ctx, 102, 110, 64, 48, 13);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(102, 118, 64, 16);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(150, 138, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#db2777';
  ctx.beginPath();
  ctx.arc(150, 138, 4.3, 0, Math.PI * 2);
  ctx.fill();

  drawText(ctx, 'RosyLedger', 190, 102, { size: 34, weight: 800 });
  drawText(ctx, 'PRIVATE LEDGER STATEMENT', 190, 144, {
    size: 15,
    weight: 800,
    color: '#9d174d'
  });
  drawText(ctx, `Generated ${new Date().toLocaleString()}`, 1040, 112, {
    size: 18,
    weight: 600,
    color: '#7a5a66',
    align: 'right'
  });

  drawText(ctx, 'Statement period', 96, 226, { size: 18, color: '#7a5a66' });
  drawText(ctx, month ? formatMonthLabel(month) : 'All records', 96, 254, {
    size: 34,
    weight: 800
  });
  drawText(ctx, 'Account holder', 600, 226, { size: 18, color: '#7a5a66' });
  drawText(ctx, data.user?.username || 'RosyLedger user', 600, 254, {
    size: 34,
    weight: 800
  });

  const summary = [
    ['Money in', moneyFromCents(totalIn), '#166534'],
    ['Money out', moneyFromCents(totalOut), '#9f1239'],
    ['Net position', moneyFromCents(balance), balance >= 0 ? '#166534' : '#9f1239']
  ];
  summary.forEach((item, i) => {
    const x = 96 + i * 336;
    ctx.fillStyle = i === 0 ? '#f0fdf4' : i === 1 ? '#fff1f2' : '#fdf2f8';
    roundedRect(ctx, x, 340, 304, 116, 24);
    ctx.fill();
    drawText(ctx, item[0], x + 24, 364, { size: 17, color: '#7a5a66' });
    drawText(ctx, item[1], x + 24, 394, { size: 32, weight: 800, color: item[2] });
  });

  drawText(ctx, 'Transaction details', 96, 520, { size: 28, weight: 800 });
  drawText(ctx, `${rows.length} record(s)`, 1040, 526, {
    size: 18,
    color: '#7a5a66',
    align: 'right'
  });

  const tableX = 96;
  const tableY = 580;
  const tableW = width - 192;
  ctx.fillStyle = '#fdf2f8';
  roundedRect(ctx, tableX, tableY, tableW, 52, 18);
  ctx.fill();
  drawText(ctx, 'Date', tableX + 24, tableY + 17, { size: 16, weight: 800, color: '#9d174d' });
  drawText(ctx, 'Description', tableX + 170, tableY + 17, { size: 16, weight: 800, color: '#9d174d' });
  drawText(ctx, 'Category', tableX + 640, tableY + 17, { size: 16, weight: 800, color: '#9d174d' });
  drawText(ctx, 'Amount', tableX + tableW - 24, tableY + 17, {
    size: 16,
    weight: 800,
    color: '#9d174d',
    align: 'right'
  });

  if (!rows.length) {
    drawText(ctx, 'No transactions for this statement period.', tableX + 24, tableY + 88, {
      size: 22,
      color: '#7a5a66'
    });
  }

  rows.forEach((expense, i) => {
    const y = tableY + 60 + i * rowHeight;
    const income = isIncomeRecord(expense);
    const amount = Number(expense.amountCents || 0);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.86)' : 'rgba(253,242,248,0.52)';
    roundedRect(ctx, tableX, y, tableW, rowHeight - 8, 14);
    ctx.fill();
    drawText(ctx, expense.date || '-', tableX + 24, y + 14, { size: 17, color: '#3d1f2e' });
    ctx.font = '700 17px Inter, Arial, sans-serif';
    drawText(ctx, fitText(ctx, expense.title || (income ? 'Income' : 'Expense'), 420), tableX + 170, y + 14, {
      size: 17,
      weight: 800
    });
    drawText(ctx, fitText(ctx, categoryNameFor(expense, categoryMap), 190), tableX + 640, y + 14, {
      size: 17,
      color: income ? '#047857' : '#7a5a66'
    });
    drawText(
      ctx,
      `${income ? '+' : '-'}${moneyFromCents(amount)}`,
      tableX + tableW - 24,
      y + 14,
      {
        size: 17,
        weight: 800,
        color: income ? '#047857' : '#9f1239',
        align: 'right'
      }
    );
  });

  const footY = height - 150;
  ctx.strokeStyle = 'rgba(219, 39, 119, 0.18)';
  ctx.beginPath();
  ctx.moveTo(96, footY);
  ctx.lineTo(width - 96, footY);
  ctx.stroke();
  drawText(ctx, 'This statement was generated by RosyLedger from your private ledger data.', 96, footY + 28, {
    size: 17,
    color: '#7a5a66'
  });
  drawText(ctx, 'rosyledger.statement.png', width - 96, footY + 28, {
    size: 17,
    color: '#9d174d',
    align: 'right'
  });

  const safeName = String(data.user?.username || 'user').replace(/[^A-Za-z0-9_.-]/g, '_');
  downloadCanvas(canvas, `rosyledger-statement-${safeName}-${month || 'all'}.png`);
}
