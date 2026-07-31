let leDocumentChart = null;

function leDocEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function leDocFormatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}/${Number(match[3])}` : value || '-';
}

function leDocSummaryCard(label, value, hint, valueClass = 'text-gray-800') {
  return `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center transition-all hover:shadow-md">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">${leDocEscape(label)}</div>
      <div class="text-4xl font-black ${valueClass}">${leDocEscape(value)}</div>
      <div class="text-xs font-medium text-gray-400 mt-1">${leDocEscape(hint)}</div>
    </div>`;
}

function renderLeDocumentView(profile) {
  const data = profile.le_document;
  const cards = document.getElementById('le-doc-summary-cards');
  const historyBox = document.getElementById('le-doc-history');
  const noteBox = document.getElementById('le-doc-source-note');
  const caption = document.getElementById('le-doc-chart-caption');

  if (!data || !cards || !historyBox || !noteBox || !caption) {
    return;
  }

  const current = Number(data.current_pages || 0);
  const target = Number(data.today_target_pages || 0);
  const gap = Number(data.gap_pages || 0);
  const targetPerDay = Number(data.target_pages_per_business_day || 10);
  const lastRecord = data.last_recorded_date || '';
  const gapText = `${gap > 0 ? '+' : ''}${gap}P`;
  const gapClass = gap >= 0 ? 'text-emerald-600' : 'text-red-600';

  cards.innerHTML = [
    leDocSummaryCard('平日目標', `${targetPerDay}P`, '1日あたり', 'text-blue-600'),
    leDocSummaryCard('現在地', `${current}P`, `最終実績 ${leDocFormatDate(lastRecord)}`, 'text-gray-800'),
    leDocSummaryCard('今日の累積目標', `${target}P`, `基準開始 ${leDocFormatDate(data.target_start_date)}`, 'text-gray-800'),
    leDocSummaryCard('目標との差', gapText, '最終実績 vs 今日の目標', gapClass),
  ].join('');

  caption.textContent = `最終実績: ${leDocFormatDate(lastRecord)} / ダッシュボード更新: ${leDocFormatDate(data.generated_for_date)}`;

  const history = Array.isArray(data.history) ? data.history : [];
  historyBox.innerHTML = history.length
    ? history.slice().reverse().map((entry, index) => {
        const previous = history[history.length - index - 2];
        const change = previous ? entry.completed_pages - previous.completed_pages : null;
        const changeText = change === null ? '基準記録' : `${change >= 0 ? '+' : ''}${change}P`;
        const changeClass = change === null || change >= 0 ? 'text-emerald-600' : 'text-red-600';
        return `
          <div class="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
            <div>
              <div class="font-bold text-gray-800">${leDocEscape(leDocFormatDate(entry.date))}</div>
              <div class="text-xs text-gray-400">PM進捗ログ</div>
            </div>
            <div class="text-right">
              <div class="font-black text-lg text-gray-800">${leDocEscape(entry.completed_pages)}P</div>
              <div class="text-xs font-bold ${changeClass}">${leDocEscape(changeText)}</div>
            </div>
          </div>`;
      }).join('')
    : '<div class="text-gray-400 text-sm">進捗ログがまだ見つからない。</div>';

  const totalLabel = data.total_pages ? `総ページ数 ${data.total_pages}P` : '総ページ数は確認中';
  noteBox.innerHTML = `
    <p>実績は <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">${leDocEscape(data.source_label || 'IW LE DOC PM')}</code> の進捗ログから抽出する。</p>
    <p class="mt-3">${leDocEscape(totalLabel)}。PMに54Pと100Pの記載が混在するため、母数が確定するまで完了率は表示しない。</p>
    <p class="mt-3">日次更新は、実績記録を上書きせず、平日10Pの累積目標だけを当日分まで進める。</p>`;

  renderLeDocumentChart(data);
}

function renderLeDocumentChart(data) {
  const canvas = document.getElementById('le-doc-progress-chart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-sm text-gray-400">グラフライブラリを読み込めないため、数値カードのみ表示中</div>';
    return;
  }

  const actualHistory = Array.isArray(data.history) ? data.history : [];
  const targets = Array.isArray(data.target_schedule) ? data.target_schedule : [];
  const labels = [...new Set([
    ...actualHistory.map(item => item.date),
    ...targets.map(item => item.date),
  ])].sort();
  const actualByDate = new Map(actualHistory.map(item => [item.date, item.completed_pages]));
  const targetByDate = new Map(targets.map(item => [item.date, item.target_pages]));

  if (leDocumentChart) leDocumentChart.destroy();
  leDocumentChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels.map(leDocFormatDate),
      datasets: [
        {
          label: '実績（記録済み）',
          data: labels.map(date => actualByDate.has(date) ? actualByDate.get(date) : null),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          spanGaps: false,
          tension: 0.2,
        },
        {
          label: '累積目標（平日10P）',
          data: labels.map(date => targetByDate.has(date) ? targetByDate.get(date) : null),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.08)',
          borderWidth: 2,
          borderDash: [6, 5],
          pointRadius: 0,
          spanGaps: false,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 9, color: '#4b5563' } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}P` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280', precision: 0, callback: value => `${value}P` } },
      },
    },
  });
}
