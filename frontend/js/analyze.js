/**
 * analyze.js - Video selection, validation, API prediction call, gauge rendering, and filmstrip.
 */
import { state, fetchWithTimeout } from './main.js';

const ALLOWED_EXTENSIONS = ['.avi', '.mp4', '.mov'];
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

let dropZone, fileInput, analyzeBtn, clearFileBtn;
let fileDetails, fileNameEl, fileSizeEl;
let previewWrapper, videoPreview;
let statusMessageEl, errorMessageEl;
let resultCard, resultBadge, gaugeValue, gaugeFill, thresholdMarker, thresholdDisplayVal;
let filmstripContainer, analyzeSpinner;

export function initAnalyze() {
  dropZone = document.getElementById('drop-zone');
  fileInput = document.getElementById('file-input');
  analyzeBtn = document.getElementById('analyze-btn');
  clearFileBtn = document.getElementById('clear-file-btn');
  fileDetails = document.getElementById('file-details');
  fileNameEl = document.getElementById('selected-file-name');
  fileSizeEl = document.getElementById('selected-file-size');
  previewWrapper = document.getElementById('preview-wrapper');
  videoPreview = document.getElementById('video-preview');
  statusMessageEl = document.getElementById('status-message');
  errorMessageEl = document.getElementById('error-message');
  resultCard = document.getElementById('result-card');
  resultBadge = document.getElementById('result-badge');
  gaugeValue = document.getElementById('gauge-value');
  gaugeFill = document.getElementById('gauge-fill');
  thresholdMarker = document.getElementById('gauge-threshold-marker');
  thresholdDisplayVal = document.getElementById('threshold-display-value');
  filmstripContainer = document.getElementById('filmstrip-container');
  analyzeSpinner = document.getElementById('analyze-spinner');

  // Drag and drop events
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  clearFileBtn.addEventListener('click', () => {
    resetSelection();
  });

  analyzeBtn.addEventListener('click', () => {
    if (state.selectedFile) {
      runPrediction(state.selectedFile);
    }
  });
}

function showError(msg) {
  errorMessageEl.textContent = msg;
  errorMessageEl.classList.remove('hidden');
}

function clearError() {
  errorMessageEl.textContent = '';
  errorMessageEl.classList.add('hidden');
}

function showStatus(msg) {
  statusMessageEl.textContent = msg;
  statusMessageEl.classList.remove('hidden');
}

function clearStatus() {
  statusMessageEl.textContent = '';
  statusMessageEl.classList.add('hidden');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  return mb.toFixed(1) + ' MB';
}

function handleFileSelected(file) {
  clearError();
  clearStatus();

  // Pre-upload validation
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    showError(`Unsupported file format "${ext}". Please select a video file (${ALLOWED_EXTENSIONS.join(', ')}).`);
    resetSelection();
    return;
  }

  if (file.size > MAX_BYTES) {
    showError(`File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of 100 MB.`);
    resetSelection();
    return;
  }

  state.selectedFile = file;

  // Display details
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = `(${formatBytes(file.size)})`;
  fileDetails.classList.remove('hidden');
  analyzeBtn.disabled = false;

  // Attempt preview if browser supports container
  try {
    const objectUrl = URL.createObjectURL(file);
    videoPreview.src = objectUrl;
    previewWrapper.classList.remove('hidden');
  } catch (e) {
    previewWrapper.classList.add('hidden');
  }
}

function resetSelection() {
  state.selectedFile = null;
  fileInput.value = '';
  fileDetails.classList.add('hidden');
  previewWrapper.classList.add('hidden');
  videoPreview.pause();
  videoPreview.removeAttribute('src');
  videoPreview.load();
  analyzeBtn.disabled = true;
  clearError();
  clearStatus();
}

async function runPrediction(file) {
  clearError();
  clearStatus();
  showStatus('Analyzing... the first run can take a few seconds');
  analyzeBtn.disabled = true;
  analyzeSpinner.classList.remove('hidden');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetchWithTimeout('/api/predict', {
      method: 'POST',
      body: formData,
    }, 120000);

    if (!response.ok) {
      let errDetail = `Server returned status ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) {
          errDetail = errJson.detail;
        }
      } catch (_) {}
      throw new Error(errDetail);
    }

    const data = await response.json();
    clearStatus();

    // Cache the last result for 3D viewer
    state.lastResult = data;

    // Render result card
    renderResult(data);

  } catch (err) {
    clearStatus();
    showError(err.message || 'An unexpected error occurred during prediction.');
  } finally {
    analyzeSpinner.classList.add('hidden');
    analyzeBtn.disabled = false;
  }
}

function renderResult(data) {
  const prob = data.probability;
  const threshold = data.threshold;
  const abnormal = data.abnormal;
  const label = data.label;
  const frames = data.frames || [];

  // 1. Result Badge
  resultBadge.textContent = abnormal ? 'Abnormal LV Function (EF < 50%)' : 'Normal LV Function (EF ≥ 50%)';
  resultBadge.className = 'result-badge ' + (abnormal ? 'abnormal' : 'normal');

  // 2. Probability Gauge
  const probPct = Math.min(100, Math.max(0, prob * 100));
  const threshPct = Math.min(100, Math.max(0, threshold * 100));

  gaugeValue.textContent = `${probPct.toFixed(1)}%`;
  gaugeFill.style.width = `${probPct}%`;

  // Position threshold marker
  thresholdMarker.style.left = `${threshPct}%`;
  const tagText = document.getElementById('threshold-tag-text');
  if (tagText) {
    tagText.textContent = `Thr: ${threshPct.toFixed(1)}%`;
  }
  thresholdDisplayVal.textContent = `Decision Threshold: ${threshPct.toFixed(1)}% (${threshold.toFixed(4)})`;

  // Update ARIA values
  const gaugeContainer = document.getElementById('gauge-container');
  if (gaugeContainer) {
    gaugeContainer.setAttribute('aria-valuenow', probPct.toFixed(1));
  }

  // 3. Filmstrip
  filmstripContainer.innerHTML = '';
  frames.forEach((frameUri, idx) => {
    const item = document.createElement('div');
    item.className = 'filmstrip-item';

    const img = document.createElement('img');
    img.src = frameUri;
    img.alt = `Sampled frame ${idx + 1} of 16`;
    img.loading = 'lazy';

    const badge = document.createElement('span');
    badge.className = 'frame-badge';
    badge.textContent = `#${idx + 1}`;

    item.appendChild(img);
    item.appendChild(badge);
    filmstripContainer.appendChild(item);
  });

  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
