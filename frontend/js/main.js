/**
 * main.js - Core application router and state manager.
 * Provides hash routing across #analyze, #viewer, #model, #about.
 */
import { initAnalyze } from './analyze.js';
import { initViewer, onViewerSectionActivated } from './viewer3d.js';
import { initModel, onModelSectionActivated } from './model.js';

// Global application state shared across modules
export const state = {
  lastResult: null, // holds { probability, threshold, abnormal, label, frames, frame_period }
  selectedFile: null,
};

// Available section IDs
const SECTIONS = ['analyze', 'viewer', 'model', 'about'];

/**
 * Route handler based on window.location.hash
 */
function handleRouting() {
  let hash = window.location.hash.replace(/^#/, '').trim();
  if (!SECTIONS.includes(hash)) {
    hash = 'analyze';
    if (!window.location.hash || window.location.hash !== '#analyze') {
      window.location.hash = '#analyze';
      return;
    }
  }

  // Hide all sections, display the active one
  SECTIONS.forEach((sec) => {
    const sectionEl = document.getElementById(`section-${sec}`);
    const navLink = document.getElementById(`nav-${sec}`);
    if (sec === hash) {
      if (sectionEl) sectionEl.classList.remove('hidden');
      if (navLink) navLink.classList.add('active');
    } else {
      if (sectionEl) sectionEl.classList.add('hidden');
      if (navLink) navLink.classList.remove('active');
    }
  });

  // Notify section handlers if needed
  if (hash === 'viewer') {
    onViewerSectionActivated(state.lastResult);
  } else if (hash === 'model') {
    onModelSectionActivated();
  }
}

/**
 * Common API helper with robust timeout and error handling
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out (120 s limit exceeded). The server took too long to respond.');
    }
    // Network failure
    throw new Error('Cannot reach the server. Is it running?');
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  initAnalyze();
  initViewer();
  initModel();

  // Listen for hash changes
  window.addEventListener('hashchange', handleRouting);
  // Initial route
  handleRouting();
});
