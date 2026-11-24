/**
 * model.js - Model evaluation metrics, inline SVG charts (50 epochs), overfitting note, and table.
 * Complemented with Barrios et al. (Nature Cardiovascular Research 2026) Multiview Benchmark Hub.
 */
import { fetchWithTimeout } from './main.js?v=2.2';
import { PAPER_TASKS, EXTERNAL_VALIDATION_MHI } from './benchmarks.js?v=2.2';

let metricsData = null;
let isLoaded = false;

export function initModel() {
  const curvesImg = document.getElementById('curves-img');
  if (curvesImg) {
    curvesImg.addEventListener('error', () => {
      const wrapper = document.getElementById('curves-image-wrapper');
      if (wrapper) wrapper.classList.add('hidden');
    });
  }

  initBenchmarkHub();
  renderMultiCenterGrid();
}

export async function onModelSectionActivated() {
  if (isLoaded) return;
  await loadMetrics();
}

async function loadMetrics() {
  try {
    const response = await fetchWithTimeout('/api/metrics', {}, 30000);
    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: status ${response.status}`);
    }
    const data = await response.json();
    metricsData = data;
    isLoaded = true;
    renderMetrics(data);
  } catch (err) {
    console.error('Error loading metrics:', err);
  }
}

function renderMetrics(data) {
  const test = data.test || {};
  const bestEpoch = data.best_epoch !== undefined ? data.best_epoch : test.best_epoch;
  const bestValAuc = data.best_val_auc !== undefined ? data.best_val_auc : test.val_auc;
  const threshold = data.threshold !== undefined ? data.threshold : test.threshold;

  // 1. Metric Cards
  setText('metric-test-auc', test.test_auc !== undefined ? test.test_auc.toFixed(3) : '--');
  if (test.test_auc_ci90 && test.test_auc_ci90.length === 2) {
    setText('metric-test-auc-ci', `90% CI: [${test.test_auc_ci90[0].toFixed(3)}, ${test.test_auc_ci90[1].toFixed(3)}]`);
  }

  setText('metric-best-val-auc', bestValAuc !== undefined ? bestValAuc.toFixed(3) : '--');
  setText('metric-threshold', threshold !== undefined ? threshold.toFixed(4) : '--');
  // Epochs are 0-indexed in history and test_results: display epoch + 1 to humans
  setText('metric-best-epoch', bestEpoch !== undefined ? `Epoch ${bestEpoch + 1}` : '--');

  setText('metric-sens', test.sens !== undefined ? `${(test.sens * 100).toFixed(1)}%` : '--');
  setText('metric-spec', test.spec !== undefined ? `${(test.spec * 100).toFixed(1)}%` : '--');
  setText('metric-ppv', test.ppv !== undefined ? `${(test.ppv * 100).toFixed(1)}%` : '--');
  setText('metric-npv', test.npv !== undefined ? `${(test.npv * 100).toFixed(1)}%` : '--');
  setText('metric-f1', test.f1 !== undefined ? test.f1.toFixed(3) : '--');

  // 2. Table values
  setText('tbl-sens', test.sens !== undefined ? `${(test.sens * 100).toFixed(1)}%` : '--');
  setText('tbl-spec', test.spec !== undefined ? `${(test.spec * 100).toFixed(1)}%` : '--');
  setText('tbl-ppv', test.ppv !== undefined ? `${(test.ppv * 100).toFixed(1)}%` : '--');
  setText('tbl-npv', test.npv !== undefined ? `${(test.npv * 100).toFixed(1)}%` : '--');

  // 3. SVG Charts (Loss and AUC over 50 epochs)
  const history = data.history || [];
  if (history.length > 0) {
    renderSvgChart('loss-chart-container', history, 'train_loss', 'val_loss', 'Loss', bestEpoch + 1);
    renderSvgChart('auc-chart-container', history, 'train_auc', 'val_auc', 'AUC', bestEpoch + 1);
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Render a responsive line chart with SVG (no library)
 * Includes train line, val line, best epoch vertical marker, grid lines, axes, and legend.
 */
function renderSvgChart(containerId, history, trainKey, valKey, metricName, bestEpochNum) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const w = 480;
  const h = 260;
  const pad = { top: 30, right: 25, bottom: 45, left: 55 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Extract values
  const epochs = history.map((r, i) => (r.epoch !== undefined ? r.epoch + 1 : i + 1));
  const trainVals = history.map((r) => r[trainKey]);
  const valVals = history.map((r) => r[valKey]);

  const allVals = [...trainVals, ...valVals].filter((v) => v !== undefined && !isNaN(v));
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);

  // Buffer range
  const range = maxVal - minVal || 1;
  minVal = Math.max(0, minVal - range * 0.05);
  maxVal = maxVal + range * 0.05;

  const minEpoch = 1;
  const maxEpoch = Math.max(...epochs, 50);

  const getX = (ep) => pad.left + ((ep - minEpoch) / (maxEpoch - minEpoch)) * plotW;
  const getY = (val) => pad.top + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

  // Build SVG paths
  const trainPoints = epochs.map((ep, i) => `${getX(ep).toFixed(1)},${getY(trainVals[i]).toFixed(1)}`).join(' ');
  const valPoints = epochs.map((ep, i) => `${getX(ep).toFixed(1)},${getY(valVals[i]).toFixed(1)}`).join(' ');

  // X ticks: 1, 10, 20, 30, 40, 50
  const xTicks = [1, 10, 20, 30, 40, 50];
  const yTicksCount = 5;
  const yTicks = [];
  for (let i = 0; i < yTicksCount; i++) {
    yTicks.push(minVal + (i / (yTicksCount - 1)) * (maxVal - minVal));
  }

  // Best epoch vertical marker
  const bestX = getX(bestEpochNum);

  let svgHtml = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${metricName} chart">
      <!-- Grid lines -->
      ${yTicks
        .map(
          (y) => `
        <line x1="${pad.left}" y1="${getY(y).toFixed(1)}" x2="${w - pad.right}" y2="${getY(y).toFixed(1)}" class="chart-grid-line" />
        <text x="${pad.left - 8}" y="${(getY(y) + 3).toFixed(1)}" text-anchor="end" class="chart-text">${y.toFixed(2)}</text>
      `
        )
        .join('')}

      <!-- X Axis Ticks -->
      ${xTicks
        .map(
          (ep) => `
        <line x1="${getX(ep).toFixed(1)}" y1="${pad.top + plotH}" x2="${getX(ep).toFixed(1)}" y2="${pad.top + plotH + 5}" class="chart-axis-line" />
        <text x="${getX(ep).toFixed(1)}" y="${pad.top + plotH + 18}" text-anchor="middle" class="chart-text">${ep}</text>
      `
        )
        .join('')}

      <!-- Axes -->
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" class="chart-axis-line" />
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${w - pad.right}" y2="${pad.top + plotH}" class="chart-axis-line" />

      <!-- Axis Labels -->
      <text x="${pad.left + plotW / 2}" y="${h - 5}" text-anchor="middle" class="chart-title-text">Epoch (1 to 50)</text>
      <text x="14" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 14 ${pad.top + plotH / 2})" class="chart-title-text">${metricName}</text>

      <!-- Best Epoch Line -->
      <line x1="${bestX.toFixed(1)}" y1="${pad.top}" x2="${bestX.toFixed(1)}" y2="${pad.top + plotH}" class="chart-best-marker" />
      <text x="${bestX.toFixed(1)}" y="${pad.top - 8}" text-anchor="middle" class="chart-text" style="fill: var(--chart-best); font-weight: 700;">Best Ep ${bestEpochNum}</text>

      <!-- Polyline Data -->
      <polyline points="${trainPoints}" class="chart-train-line" />
      <polyline points="${valPoints}" class="chart-val-line" />

      <!-- Legend (uses shape + line pattern, not color alone) -->
      <g transform="translate(${pad.left + 15}, ${pad.top + 8})">
        <!-- Train legend -->
        <line x1="0" y1="0" x2="20" y2="0" class="chart-train-line" />
        <circle cx="10" cy="0" r="3" fill="var(--chart-train)" />
        <text x="26" y="4" class="chart-text" style="font-weight: 600;">Train (Solid &bull;)</text>

        <!-- Validation legend -->
        <line x1="120" y1="0" x2="140" y2="0" class="chart-val-line" />
        <rect x="127" y="-3" width="6" height="6" fill="var(--chart-val)" />
        <text x="146" y="4" class="chart-text" style="font-weight: 600;">Val (Dashed &#9632;)</text>
      </g>
    </svg>
  `;

  container.innerHTML = svgHtml;
}

/**
 * Benchmark Hub: Initializes task tabs and renders dynamic comparative analytics.
 */
function initBenchmarkHub() {
  const tabsContainer = document.getElementById('task-tabs-container');
  if (!tabsContainer) return;

  const tabButtons = tabsContainer.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const taskId = btn.getAttribute('data-task');
      renderBenchmarkTask(taskId);
    });
  });

  // Default initial render
  renderBenchmarkTask('lvrv');
}

function renderBenchmarkTask(taskId) {
  const task = PAPER_TASKS[taskId];
  if (!task) return;

  const chartTitle = document.getElementById('benchmark-chart-title');
  if (chartTitle) chartTitle.textContent = `AUC Comparison: ${task.name}`;

  const tableTitle = document.getElementById('benchmark-table-title');
  if (tableTitle) tableTitle.textContent = `Full Diagnostic Metrics: ${task.name}`;

  const callout = document.getElementById('benchmark-gain-callout');
  if (callout) {
    callout.innerHTML = `<strong>Architecture Advantage:</strong> Multiview mid-fusion ${task.multiviewGain} &bull; <em>${task.description}</em>`;
  }

  renderBenchmarkBarChart(task);
  renderBenchmarkTable(task);
}

/**
 * Render responsive horizontal SVG bar chart comparing AUC across models.
 */
function renderBenchmarkBarChart(task) {
  const container = document.getElementById('benchmark-bar-chart');
  if (!container) return;

  const models = task.models || [];
  const w = 540;
  const barHeight = 22;
  const rowGap = 16;
  const topPad = 25;
  const bottomPad = 35;
  const leftPad = 175;
  const rightPad = 75;
  const plotW = w - leftPad - rightPad;
  const h = topPad + models.length * (barHeight + rowGap) + bottomPad;

  const minAuc = 0.60;
  const maxAuc = 1.00;
  const getX = (val) => leftPad + Math.max(0, (val - minAuc) / (maxAuc - minAuc)) * plotW;

  const gridTicks = [0.60, 0.70, 0.80, 0.90, 1.00];

  let svgHtml = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Horizontal bar chart comparing AUC across model architectures">
      <!-- Grid lines -->
      ${gridTicks
        .map(
          (tick) => `
        <line x1="${getX(tick).toFixed(1)}" y1="${topPad}" x2="${getX(tick).toFixed(1)}" y2="${h - bottomPad}" stroke="var(--border-color, #e2e8f0)" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${getX(tick).toFixed(1)}" y="${h - bottomPad + 16}" text-anchor="middle" font-size="10" fill="var(--text-muted, #64748b)">${tick.toFixed(2)}</text>
      `
        )
        .join('')}

      <!-- Bottom Axis Line -->
      <line x1="${leftPad}" y1="${h - bottomPad}" x2="${w - rightPad}" y2="${h - bottomPad}" stroke="var(--border-color, #cbd5e1)" stroke-width="1" />
      <text x="${leftPad + plotW / 2}" y="${h - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text-subtle, #475569)">Area Under ROC Curve (AUC)</text>

      <!-- Bars -->
      ${models
        .map((m, idx) => {
          const y = topPad + idx * (barHeight + rowGap);
          const barW = Math.max(4, getX(m.auc) - leftPad);

          let barColor = '#64748b'; // single-view slate
          if (m.type === 'multiview') barColor = 'var(--accent-primary, #0284c7)';
          else if (m.type === 'fusion') barColor = '#0d9488'; // teal

          const isHighlighted = !!m.highlight;

          return `
            <g class="bar-group">
              <!-- Model Name Label -->
              <text x="${leftPad - 10}" y="${y + 15}" text-anchor="end" font-size="11" font-weight="${isHighlighted ? '700' : '500'}" fill="${isHighlighted ? 'var(--accent-primary, #0284c7)' : 'var(--text-main, #0f172a)'}">
                ${m.name}
              </text>

              <!-- Bar Rect -->
              <rect x="${leftPad}" y="${y}" width="${barW.toFixed(1)}" height="${barHeight}" rx="4" ry="4" fill="${barColor}" fill-opacity="${isHighlighted ? '1.0' : '0.85'}" ${isHighlighted ? 'stroke="#38bdf8" stroke-width="1.5"' : ''} />

              <!-- Value Text -->
              <text x="${(leftPad + barW + 8).toFixed(1)}" y="${y + 15}" font-size="11" font-weight="700" fill="var(--text-main, #0f172a)">
                ${m.auc.toFixed(3)}
              </text>
            </g>
          `;
        })
        .join('')}
    </svg>
  `;

  container.innerHTML = svgHtml;
}

function renderBenchmarkTable(task) {
  const tbody = document.getElementById('benchmark-table-body');
  if (!tbody) return;

  const models = task.models || [];
  tbody.innerHTML = models
    .map(
      (m) => `
    <tr class="${m.highlight ? 'row-highlight' : ''}">
      <td>
        <strong>${m.name}</strong>
        ${m.highlight ? '<span class="badge-accent" style="margin-left: 6px; font-size: 0.65rem; padding: 2px 6px;">Multiview</span>' : ''}
      </td>
      <td><strong>${m.auc.toFixed(3)}</strong> <span style="font-size: 0.72rem; color: var(--text-muted);">(${m.ci})</span></td>
      <td>${(m.sens * 100).toFixed(1)}%</td>
      <td>${(m.spec * 100).toFixed(1)}%</td>
      <td>${(m.ppv * 100).toFixed(1)}%</td>
      <td>${(m.npv * 100).toFixed(1)}%</td>
      <td>${m.f1.toFixed(3)}</td>
    </tr>
  `
    )
    .join('');
}

function renderMultiCenterGrid() {
  const grid = document.getElementById('multicenter-grid');
  if (!grid || !EXTERNAL_VALIDATION_MHI) return;

  grid.innerHTML = EXTERNAL_VALIDATION_MHI.tasks
    .map(
      (t) => `
    <div class="mhi-card">
      <div class="mhi-title">${t.task}</div>
      <div class="mhi-stats">External Cohort: Montreal Heart Institute (N = ${t.n.toLocaleString()})</div>
      <div class="mhi-auc-comparison">
        <span>MHI External AUC: <strong style="color: var(--accent-primary);">${t.multiviewAuc}</strong></span>
        <span>UCSF Internal: <strong>${t.ucsfAuc}</strong></span>
      </div>
      <div style="font-size: 0.75rem; margin-bottom: 0.5rem; color: var(--text-subtle);">
        Sens: <strong>${t.sens}</strong> &bull; Spec: <strong>${t.spec}</strong> &bull; PPV: <strong>${t.ppv}</strong> &bull; NPV: <strong>${t.npv}</strong> &bull; F1: <strong>${t.f1}</strong>
      </div>
      <div class="mhi-tag">&check; ${t.status}</div>
    </div>
  `
    )
    .join('');
}
