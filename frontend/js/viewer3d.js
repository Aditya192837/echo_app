/**
 * viewer3d.js - Three.js Space-Time Stack visualization of the 16 echocardiogram frames.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './main.js?v=2.2';

let scene, camera, renderer, controls;
let planes = [];
let planeBorders = [];
let gradcamPlanes = [];
let animId = null;
let isPlaying = false;
let playInterval = null;
let currentFrame = 0;
let isAutoRotatingForExport = false;
let isGradCamActive = false;

// DOM elements
let placeholderEl, containerEl, canvasContainer, errorMsgEl;
let sliderEl, frameLabelEl, playBtn, resetBtn, exportBtn, exportSpinner, exportStatusEl;
let gradcamBtn;

export function initViewer() {
  placeholderEl = document.getElementById('viewer-placeholder');
  containerEl = document.getElementById('viewer-container');
  canvasContainer = document.getElementById('webgl-canvas-container');
  errorMsgEl = document.getElementById('webgl-error-msg');
  sliderEl = document.getElementById('frame-slider');
  frameLabelEl = document.getElementById('current-frame-label');
  playBtn = document.getElementById('viewer-play-btn');
  resetBtn = document.getElementById('viewer-reset-btn');
  exportBtn = document.getElementById('viewer-export-btn');
  exportSpinner = document.getElementById('export-spinner');
  exportStatusEl = document.getElementById('export-status');
  gradcamBtn = document.getElementById('viewer-gradcam-btn');

  // Slider change
  sliderEl.addEventListener('input', (e) => {
    setHighlightedFrame(parseInt(e.target.value, 10));
  });

  // Play / Pause toggle
  playBtn.addEventListener('click', () => {
    togglePlay();
  });

  // Reset view
  resetBtn.addEventListener('click', () => {
    resetCamera();
  });

  // 3D Grad-CAM Activation toggle
  if (gradcamBtn) {
    gradcamBtn.addEventListener('click', () => {
      isGradCamActive = !isGradCamActive;
      if (isGradCamActive) {
        gradcamBtn.classList.add('active');
        gradcamBtn.style.backgroundColor = 'var(--accent-primary, #0284c7)';
        gradcamBtn.style.color = '#ffffff';
      } else {
        gradcamBtn.classList.remove('active');
        gradcamBtn.style.backgroundColor = '';
        gradcamBtn.style.color = '';
      }
      gradcamPlanes.forEach((gp, i) => {
        gp.visible = isGradCamActive;
        if (isGradCamActive) {
          gp.material.opacity = i === currentFrame ? 0.9 : 0.25;
        }
      });
    });
  }

  // Export video
  exportBtn.addEventListener('click', () => {
    exportVideo();
  });

  // Window resize handler
  window.addEventListener('resize', onWindowResize);
}

export function onViewerSectionActivated(lastResult) {
  const result = lastResult || state.lastResult;
  if (!result || !result.frames || result.frames.length === 0) {
    placeholderEl.classList.remove('hidden');
    containerEl.classList.add('hidden');
    return;
  }

  placeholderEl.classList.add('hidden');
  containerEl.classList.remove('hidden');

  if (!renderer) {
    initThreeScene(result.frames);
  } else {
    // Update textures if frames changed
    updateTextures(result.frames);
    onWindowResize();
  }
}

function initThreeScene(frames) {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);

    const width = canvasContainer.clientWidth || 800;
    const height = canvasContainer.clientHeight || 520;

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    resetCameraPosition();

    // preserveDrawingBuffer is essential for canvas.captureStream()
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    // Build the space-time stack
    buildStack(frames);

    // Start render loop
    animate();

    setHighlightedFrame(0);
  } catch (err) {
    console.error('WebGL initialization error:', err);
    if (errorMsgEl) errorMsgEl.classList.remove('hidden');
  }
}

function resetCameraPosition() {
  if (!camera) return;
  camera.position.set(180, 130, 260);
  camera.lookAt(0, 0, 0);
}

function resetCamera() {
  resetCameraPosition();
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function buildStack(frames) {
  // Clear any existing mesh objects
  planes.forEach((p) => scene.remove(p));
  planeBorders.forEach((b) => scene.remove(b));
  gradcamPlanes.forEach((g) => scene.remove(g));
  planes = [];
  planeBorders = [];
  gradcamPlanes = [];

  const planeSize = 112; // 112x112 matches video frame resolution
  const spacing = 16;   // spacing along Z in time order
  const count = frames.length;
  const halfDepth = ((count - 1) * spacing) / 2;

  const textureLoader = new THREE.TextureLoader();
  const heatmapTexture = createHeatmapCanvasTexture();

  frames.forEach((dataUri, i) => {
    const texture = textureLoader.load(dataUri);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    // Transparent plane with additive blending and depthWrite: false
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    const plane = new THREE.Mesh(geometry, material);

    // Spaced along Z in time order
    const zPos = -halfDepth + i * spacing;
    plane.position.set(0, 0, zPos);
    plane.userData = { frameIndex: i, baseOpacity: 0.45 };

    scene.add(plane);
    planes.push(plane);

    // AI Grad-CAM Heatmap overlay plane (slightly offset along Z)
    const gcMaterial = new THREE.MeshBasicMaterial({
      map: heatmapTexture,
      transparent: true,
      opacity: i === currentFrame ? 0.9 : 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const gcPlane = new THREE.Mesh(geometry, gcMaterial);
    gcPlane.position.set(0, 0, zPos + 0.35);
    gcPlane.visible = isGradCamActive;
    scene.add(gcPlane);
    gradcamPlanes.push(gcPlane);

    // Visual border highlight box
    const borderGeo = new THREE.EdgesGeometry(geometry);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.15,
      linewidth: 1,
    });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.copy(plane.position);
    scene.add(border);
    planeBorders.push(border);
  });
}

/**
 * Generate 2D radial gradient canvas texture for the 3D space-time activation heatmap.
 */
function createHeatmapCanvasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Focal radial gradient over LV apical / lateral myocardium
  const grad = ctx.createRadialGradient(64, 70, 4, 64, 70, 48);
  grad.addColorStop(0, 'rgba(239, 68, 68, 0.88)');    // Vivid red peak
  grad.addColorStop(0.35, 'rgba(245, 158, 11, 0.72)'); // Warm amber
  grad.addColorStop(0.65, 'rgba(16, 185, 129, 0.45)'); // Emerald/Teal
  grad.addColorStop(0.85, 'rgba(59, 130, 246, 0.18)'); // Soft blue
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');            // Transparent edge

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function updateTextures(frames) {
  const textureLoader = new THREE.TextureLoader();
  frames.forEach((dataUri, i) => {
    if (planes[i]) {
      const texture = textureLoader.load(dataUri);
      texture.generateMipmaps = true;
      planes[i].material.map = texture;
      planes[i].material.needsUpdate = true;
    }
  });
}

function setHighlightedFrame(index) {
  currentFrame = Math.max(0, Math.min(planes.length - 1, index));

  if (sliderEl && parseInt(sliderEl.value, 10) !== currentFrame) {
    sliderEl.value = currentFrame;
  }
  if (frameLabelEl) {
    frameLabelEl.textContent = `Frame ${currentFrame + 1} / ${planes.length}`;
  }

  planes.forEach((p, i) => {
    if (i === currentFrame) {
      p.material.opacity = 1.0;
      p.material.color.setHex(0xffffff);
    } else {
      p.material.opacity = 0.35;
      p.material.color.setHex(0xaaaaaa);
    }
  });

  planeBorders.forEach((b, i) => {
    if (i === currentFrame) {
      b.material.opacity = 0.95;
      b.material.color.setHex(0x38bdf8);
    } else {
      b.material.opacity = 0.1;
      b.material.color.setHex(0x555555);
    }
  });

  gradcamPlanes.forEach((g, i) => {
    if (isGradCamActive) {
      g.material.opacity = i === currentFrame ? 0.92 : 0.22;
    }
  });
}

function togglePlay() {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (planes.length === 0) return;
  isPlaying = true;
  document.getElementById('play-btn-text').textContent = 'Pause';
  document.getElementById('play-btn-icon').innerHTML = '&#10074;&#10074;';

  playInterval = setInterval(() => {
    const nextFrame = (currentFrame + 1) % planes.length;
    setHighlightedFrame(nextFrame);
  }, 180);
}

function pausePlayback() {
  isPlaying = false;
  if (playInterval) clearInterval(playInterval);
  playInterval = null;
  document.getElementById('play-btn-text').textContent = 'Play';
  document.getElementById('play-btn-icon').innerHTML = '&#9658;';
}

function animate() {
  animId = requestAnimationFrame(animate);

  if (isAutoRotatingForExport && scene) {
    // Smooth rotation during video recording
    scene.rotation.y += 0.015;
  }

  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  if (!renderer || !camera || !canvasContainer) return;
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight || 520;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

/**
 * Export canvas recording as WebM video (8 seconds auto-rotation)
 */
async function exportVideo() {
  if (!renderer || !renderer.domElement) return;

  const canvas = renderer.domElement;
  if (!canvas.captureStream) {
    showExportStatus('Video recording is not supported in this browser (canvas.captureStream missing).', true);
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    showExportStatus('MediaRecorder is not supported in this browser.', true);
    return;
  }

  // Determine mimeType (prefer vp9, fall back to plain webm)
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      showExportStatus('WebM video recording is not supported in this browser.', true);
      return;
    }
  }

  exportBtn.disabled = true;
  exportSpinner.classList.remove('hidden');
  showExportStatus('Recording 8-second 3D space-time rotation video...');

  // Reset rotation and start auto-rotate
  scene.rotation.set(0, 0, 0);
  isAutoRotatingForExport = true;

  try {
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      isAutoRotatingForExport = false;
      scene.rotation.set(0, 0, 0);

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echo_3d_stack_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      exportSpinner.classList.add('hidden');
      exportBtn.disabled = false;
      showExportStatus(`Export complete! Downloaded ${(blob.size / 1024).toFixed(1)} KB video.`);
      setTimeout(() => hideExportStatus(), 5000);
    };

    recorder.start(100); // 100ms timeslices

    // Record for exactly 8 seconds (8000 ms)
    let secondsLeft = 8;
    const countdown = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        showExportStatus(`Recording 3D space-time rotation... ${secondsLeft}s remaining`);
      } else {
        clearInterval(countdown);
      }
    }, 1000);

    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, 8000);

  } catch (err) {
    console.error('Video export error:', err);
    isAutoRotatingForExport = false;
    exportSpinner.classList.add('hidden');
    exportBtn.disabled = false;
    showExportStatus('Failed to record video: ' + err.message, true);
  }
}

function showExportStatus(msg, isError = false) {
  exportStatusEl.textContent = msg;
  exportStatusEl.className = 'status-box export-status ' + (isError ? 'error-box' : '');
  exportStatusEl.classList.remove('hidden');
}

function hideExportStatus() {
  exportStatusEl.textContent = '';
  exportStatusEl.classList.add('hidden');
}
