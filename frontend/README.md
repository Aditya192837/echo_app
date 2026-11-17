# Echo LV Function - Frontend

A lightweight, vanilla HTML/CSS/JavaScript single-page application for the Echo LV Function research demo.
No build tools, bundlers, or npm dependencies required. Built with ES modules and Three.js via import maps.

## File Structure

```
frontend/
  index.html            Single-page layout containing top navigation, 4 hash-routed sections, and persistent footer
  README.md             Documentation and file catalog
  css/
    styles.css          Comprehensive styling, light/dark themes via prefers-color-scheme, responsive down to 375px
  js/
    main.js             Hash-based router (#analyze, #viewer, #model, #about), shared state, and fetch API helper
    analyze.js          Drag-and-drop video upload, validation, preview player, API call, gauge & filmstrip rendering
    viewer3d.js         Three.js space-time frame stack (16 planes), OrbitControls, frame slider/player, video export
    model.js            Model metrics cards, inline SVG charts (50 epochs), overfitting notes, and metrics meaning table
```

## Sections

1. **Analyze (`#analyze`)**: Upload apical 4-chamber echo video (`.avi`, `.mp4`, `.mov` &le; 100 MB), preview video, submit to `/api/predict`, and view the estimated probability gauge with threshold line and 16 sampled frames.
2. **3D Stack View (`#viewer`)**: Interactive Three.js space-time stack rendering the 16 sampled frames as transparent planes with additive blending. Includes frame highlight slider, animation playback, view reset, and 8-second auto-rotating WebM video recording export.
3. **Model & Metrics (`#model`)**: Live metrics fetched from `/api/metrics`, including Test AUC (with 90% confidence interval), sensitivity, specificity, PPV, NPV, F1 score, decision threshold, and best epoch (epoch 26). Inline SVG line charts render 50-epoch loss and AUC curves with accessible dual-encoding legends.
4. **About (`#about`)**: Detailed background on the Stanford EchoNet-Dynamic dataset, model architecture (X3D-M with cross-view fusion head), limitations (single-view, single-hospital, uncalibrated probabilities), and academic citations.

## Research Disclaimer
Research demo only. Not for clinical use or diagnosis.
