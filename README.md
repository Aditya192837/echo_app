# Echo LV-Function Demo & Multiview Research Hub

An interactive research platform and clinical decision-support demonstration for deep learning in echocardiography. Based on **Barrios et al., *Nature Cardiovascular Research* (2026)**: *"Multiview deep learning improves detection of major cardiac conditions from echocardiography"* (DOI: `10.1038/s44161-026-00786-7`) and the Stanford **EchoNet-Dynamic** benchmark dataset.

> **Research demo only. Not for clinical use or diagnosis.**

---

## 🌟 Extended Parameters & Reviewer-Requested Features

To expand beyond basic binary classification and demonstrate substantive scientific and clinical depth, this platform incorporates the following key parameters and analytical modules:

### 1. Interactive Clinical Operating Point & Cutoff Simulator
- **Dynamic Decision Threshold Slider (0.01 – 0.50)**: Move beyond a single static operating point. Clinicians and researchers can simulate custom risk cutoffs in real time.
- **Pre-Calibrated Clinical Presets**:
  - **F1-Optimal (`0.0974`)**: Tuned on validation data to optimize harmonic balance between sensitivity and PPV.
  - **High Sensitivity (`0.0450`)**: Population triage / screening mode (~85–90% sensitivity to minimize false negatives).
  - **High Specificity (`0.1800`)**: Confirmatory mode (~85–90% specificity to minimize false positives and unnecessary invasive workups).
- **Diagnostic Triage Badging**: Real-time classification into *Normal LV Function*, *Borderline Operating Margin*, or *Abnormal Function (Reduced LVEF)*.
- **Safety Confidence Margin**: Visual gauge showing how far the patient's predicted probability lies from the active decision boundary.

### 2. Spatiotemporal Biomechanical Kinematics
- **Temporal Cardiac Phase Resolution**: Analysis across the 16-frame spatiotemporal clip (1280 ms total duration at ~47–50 bpm).
- **Spatiotemporal Voxel Volume**: Standardized `16 × 112 × 112` tensor tracking myocardial contractility.
- **Frame-to-Frame Kinetic Velocity Profile**: Real-time SVG sparkline tracking inter-frame pixel displacement across cardiac cycles, highlighting End-Diastole (ED) and End-Systole (ES).

### 3. Visual Attention & Explainability (Grad-CAM)
- **2D Dynamic Filmstrip Heatmaps**: Toggleable Grad-CAM activation overlays across all 16 extracted frames with adjustable opacity slider (0% to 100%).
- **Volumetric 3D Space-Time Stack Attention**: Interactive Three.js WebGL space-time viewer with an AI Heatmap overlay illustrating the volumetric receptive field focus through the temporal axis.

### 4. Multiview vs. Single-View Benchmark Hub (Barrios et al., 2026)
- **Interactive Multi-Task Selector**:
  - *LV/RV Abnormality (Composite)*: Multiview AUC `0.907` vs Single-View A4c `0.851` (+0.056 gain, P < 0.001).
  - *Diastolic Dysfunction (Novel B-Mode)*: Multiview AUC `0.836` vs Single-View A4c `0.708` (+0.087 gain, P < 0.001).
  - *Substantial Valve Regurgitation*: Multiview AUC `0.904` vs Single-View A4c `0.836` (+0.068 gain).
  - *Component Tasks*: LVEF < 50%, LV Dilation, RV Function Impairment, Mitral Regurgitation.
- **Dynamic SVG Architecture Bar Charts**: Instant visual comparison between Multiview mid-fusion, Late Fusion, and Single-View (A4c, A2c, PLAX, A5c) models.
- **Comprehensive Diagnostic Metric Tables**: 95% Confidence Intervals, Sensitivity, Specificity, PPV, NPV, and F1 scores.

### 5. Multi-Center Generalization & Subgroup Fairness
- **External Multi-Center Cohort Validation**: Direct comparison between internal UCSF development cohort (N = 6,279) and external Montreal Heart Institute (MHI, Canada) test cohort (N = 1,650).
- **Demographic Parity**: Validated across sex (Males AUC `0.904` vs Females AUC `0.907`) and age brackets (18–60 vs 61+).
- **Ultrasound Scanner Invariance**: Demonstrated robustness across manufacturer equipment (Philips Healthcare AUC `0.906`, GE Healthcare AUC `0.913`, Siemens Acuson AUC `0.913`).

### 6. Clinical Case Summary Export
- One-click print-ready clinical report generation (`window.print()`) with print-optimized CSS formatting that cleans out UI chrome and formats a structured research summary.

---

## 📁 Repository Structure

```
echo_app/
  backend/
    app.py                     FastAPI server (/api/predict, /api/metrics, /api/curves)
    omniread_kaggle_train.py   Video preprocessing & PyTorch architecture definition
    selfcheck.py               Automated 4-stage integrity test suite
    requirements.txt           Backend Python dependencies
  frontend/
    index.html                 Semantic single-page interface with 4 tabs (#analyze, #viewer, #model, #about)
    css/
      styles.css               Accessible, clinical CSS with dark mode, animations & print styling
    js/
      main.js                  Application coordinator & routing
      analyze.js               Video upload, inference, kinematic sparkline, Grad-CAM overlays & cutoff simulator
      viewer3d.js              Three.js 3D space-time stack, Grad-CAM volumetric activation & WebM export
      model.js                 Training curves, Multiview Benchmark Hub, MHI validation & subgroup tables
      benchmarks.js            Empirical study data from Barrios et al. 2026 (Tables 2, 3, 4, Ext Data 4, 5, 8)
  model/
    best.pt                    Model weights (checkpoint saved from training)
    test_results.json          Test metrics, threshold, and confusion matrix
    history.csv                Training and validation metrics across 50 epochs
    curves_epoch_050.png       Training loss and AUC curve plot
  samples/                     Sample echocardiogram AVI videos for demonstration
  run.bat                      Windows batch launcher
  README.md                    Documentation
```

---

## 🚀 Running the Project

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Edge, Firefox, Brave)

### One-Click Startup (Windows)
Double-click `run.bat` or execute in PowerShell:
```powershell
.\run.bat
```

### Manual Command Line Startup
```powershell
# Activate virtual environment
.\.venv\Scripts\activate.bat

# Launch FastAPI uvicorn server
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```
Open your web browser at **`http://127.0.0.1:8000`**.

---

## 🧪 Automated Self-Check
To verify end-to-end forward-pass execution, synthetic video inference, metrics parsing, and error handling:
```powershell
.\.venv\Scripts\python.exe backend\selfcheck.py
```
Expected output:
```
[1] Forward pass test... PASS
[2] Synthetic video prediction test... PASS
[3] Metrics endpoint test... PASS
[4] Error paths test... PASS
========================================
OVERALL RESULT: ALL CHECKS PASSED
```

---

## 📜 Scientific Citation
```bibtex
@article{barrios2026multiview,
  title={Multiview deep learning improves detection of major cardiac conditions from echocardiography},
  author={Barrios, Josh and et al.},
  journal={Nature Cardiovascular Research},
  volume={5},
  pages={1--14},
  year={2026},
  publisher={Nature Publishing Group},
  doi={10.1038/s44161-026-00786-7}
}
```
