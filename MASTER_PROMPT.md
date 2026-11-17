# MASTER PROMPT: build, run and verify the "Echo LV Function" demo website

You are working in the workspace folder `echo_app` on Windows. Build the website frontend, run the whole app locally,
and verify it end to end. Work autonomously and in the order below. Writing code is not enough: you are finished only
when every check in section 8 passes and you have written `TEST_REPORT.md`. If a check fails, fix the cause and re-run it.

## 1. Context (read all of it)

**What this project is.** A student research project. A deep-learning model watches one echocardiogram (heart ultrasound)
video and estimates the probability that the heart's left ventricle pumps abnormally (ejection fraction, EF, below 50%).
The website lets a user upload an echo video, see the model's result, see a 3D "stack of frames" view, and read how well the
model performed. It is a research demo, NOT a medical device.

**Model.** A 3D video network built on X3D-M with a cross-view fusion head (from the paper "Multiview deep learning improves
echocardiogram interpretation", Nature Cardiovascular Research 2026, code: github.com/JoshBarrios/omniread-echo). In this run it
is trained on ONE view, so it behaves as a single-view model. About 229 million parameters.
Input: 16 frames sampled from the video (every 4th frame, so about 64 frames, roughly 1.3 s at 50 fps), resized to 112x112.
Output: one probability. Training: 50 epochs on Kaggle, then the best checkpoint by validation AUC was saved as `best.pt`.

**Data.** EchoNet-Dynamic (Stanford): 10,030 apical 4-chamber (A4C) echo videos, 112x112, each with an expert EF.
Label used: EF < 50% = abnormal (1), else normal (0). Split: 7,465 train / 1,288 validation / 1,277 test videos. About 22% abnormal.

**Verified results (use ONLY for sanity checks; the site must read live numbers from the API, never hard-code them).**
- Test set: 500 videos (a random subset of the test split), 115 abnormal (23%).
- Test AUC 0.867 (90% confidence interval 0.836 to 0.896). Best validation AUC 0.9206.
- Decision threshold 0.0974 (chosen on the validation set to balance sensitivity and specificity).
- At that threshold: sensitivity 0.835, specificity 0.717, PPV 0.468, NPV 0.936, F1 0.60.
- Overfitting is visible: final training AUC about 0.996 vs final validation AUC about 0.91, and validation loss rises late in training.
- IMPORTANT: epoch numbers in `history.csv` and `test_results.json` are 0-indexed (`best_epoch: 25` means the 26th epoch).
  Always display `epoch + 1` to humans.

## 2. Hard rules

1. Do NOT modify model code or retrain. Do not edit `backend/omniread_kaggle_train.py`. Edit `backend/app.py` only to fix a real bug, and note it in TEST_REPORT.md.
2. Never invent numbers, reviews, accuracy claims, or "diagnosis" wording. Show only values returned by the API.
3. Everything runs locally. Bind the server to 127.0.0.1. Uploaded videos are never stored or sent anywhere; the backend deletes its temp file after reading.
4. No API keys, no accounts, no build tools (no npm). The only external requests allowed are the pinned Three.js files from jsDelivr (section 6).
5. Every page shows the footer: "Research demo only. Not for clinical use or diagnosis."
6. Do not use words like "diagnoses", "detects disease" or "accurate" without the numbers beside them. Say "estimates the probability of reduced LV function".

## 3. Expected folder and pre-flight fixes

Target layout:
```
echo_app/
  MASTER_PROMPT.md   README.md   run.bat (you create)   TEST_REPORT.md (you create)
  backend/   app.py   omniread_kaggle_train.py   requirements.txt   selfcheck.py (you create)
  frontend/  (you create, section 6)
  model/     best.pt   test_results.json   history.csv   curves_epoch_050.png
  samples/   (optional: sample .avi/.mp4 videos)
```
Do these checks BEFORE anything else:
- If `backend/app.py` or `backend/omniread_kaggle_train.py` is missing: STOP and tell me to copy them from the zip I was given.
- Some files may sit in the workspace root instead of `model/`. Move `best.pt`, `test_results.*`, `history.*` and `curves_epoch_050.png` into `model/`. Delete nothing.
- Windows may have saved them as `.txt`. If `model/test_results.txt` exists, rename it to `test_results.json` (it must parse as JSON). If `model/history.txt` exists, rename it to `history.csv`
  (header must be `epoch,train_loss,train_auc,val_loss,val_auc,lr`). Ignore `history_epoch_*` files.
- If `model/best` is a FOLDER (contains data.pkl, byteorder, version, data/...), the checkpoint was extracted by mistake. STOP and tell me to re-download `best.pt` from Kaggle
  as a single file (about 0.9 GB) and delete that folder. Do not try to rebuild it.
- Confirm `model/best.pt` is a single file larger than 500 MB.

## 4. Backend (already written; verify it, do not rewrite)

`backend/app.py` is a FastAPI app. It loads `model/best.pt` once at startup, serves `frontend/` at `/`, and exposes:
- `GET /api/health` returns `{"status":"ok","device":"cpu"}`
- `POST /api/predict` multipart field `file` (.avi, .mp4, .mov; max 100 MB) returns
  `{"probability":0.0-1.0, "threshold":0.0974, "abnormal":bool, "label":str, "frames":[16 data-URI JPEG strings, 112x112], "frame_period":4}`
  Errors return `{"detail": "message"}` with 400 (bad type), 413 (too large) or 422 (unreadable video).
- `GET /api/metrics` returns `{"test":{best_epoch, val_auc, test_auc, test_auc_ci90:[lo,hi], threshold, sens, spec, ppv, npv, f1}, "history":[{epoch,train_loss,train_auc,val_loss,val_auc,lr} x50], "threshold", "best_epoch", "best_val_auc", "config":{NUM_FRAMES,PERIOD,RES,OPTIM,LR,EPOCHS}}`
- `GET /api/curves` returns the training-curves PNG (404 if missing)

## 5. Environment, run, and backend self-check

Run these yourself in the terminal and fix any error before moving on. Python 3.10 to 3.12 is best (if only a newer Python is installed and torch will not install, use `py -3.11` if available).
```
python -m venv .venv
.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope Process Bypass
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements.txt
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```
Startup must print a line like `Model loaded (best epoch 25, val AUC 0.921) | threshold 0.097 | device cpu`.

Create `backend/selfcheck.py` (run: `python backend/selfcheck.py`) that prints PASS/FAIL for each of:
1. Import `backend.app` (or `app`) and run a forward pass on a random tensor of shape (1, 1, 3, 16, 112, 112); the output is one finite number.
2. Using `fastapi.testclient.TestClient`: create a synthetic 112x112 MJPG `.avi` with OpenCV (60 frames), POST it to `/api/predict`: status 200, 0 <= probability <= 1, exactly 16 frames, `abnormal == (probability >= threshold)`.
3. `/api/metrics`: contains all keys listed above, history has 50 rows, `test.test_auc` is between 0.86 and 0.87.
4. Error paths: a `.txt` upload gives 400; a garbage file named `x.avi` gives 422.
Also create `run.bat` that activates `.venv`, starts uvicorn, and opens http://127.0.0.1:8000 in the default browser.

## 6. Frontend spec (create in `frontend/`, plain HTML/CSS/JS, no build step)

Files: `index.html`, `css/styles.css`, `js/main.js` (hash router and API helper), `js/analyze.js`, `js/viewer3d.js`, `js/model.js`, `README.md` (list of files).
Use relative URLs and `<script type="module">`. One page with four sections routed by hash: `#analyze` (default), `#viewer`, `#model`, `#about`. Top navigation on every page.

**Analyze.** Drag-and-drop zone plus a file picker (accept `.avi,.mp4,.mov`), a video preview player, an "Analyze" button disabled until a file is chosen, a loading state
("Analyzing... the first run can take a few seconds"), and a request timeout of 120 s. Result card: the probability as a horizontal gauge from 0 to 100% with a marked threshold line,
the label from the API, the threshold value, a one-line plain-language explanation ("The threshold is deliberately low so that the model rarely misses a possible case, which also means
about half of its flags are false alarms."), and the 16 returned frames as a filmstrip. Keep the last result in memory so the 3D page can use it.
Handle errors: wrong file type or size (check before upload), non-200 responses (show `detail`), network failure (friendly "Cannot reach the server. Is it running?"). Never leave a spinner stuck.

**3D view.** Use Three.js pinned to 0.160.0 through an import map exactly like this:
```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
```
Build a "space-time stack": the 16 frames as textured planes (from the data-URI JPEGs), spaced along z in time order, using transparent planes with additive blending and `depthWrite:false`
so the black background of one frame does not hide the others. `OrbitControls` (drag to rotate, wheel to zoom), a slider and a play/pause button that highlights one frame at a time, a "Reset view" button,
and an "Export video" button that records the canvas with `canvas.captureStream(30)` and `MediaRecorder` while the stack auto-rotates for 8 seconds, then downloads a `.webm`
(try `video/webm;codecs=vp9`, fall back to `video/webm`; if MediaRecorder or WebGL is unsupported, show a clear message instead of failing).
If no result exists yet, show "Analyze a video first" with a link to `#analyze`.
Always show this caption: "Space-time visualization of the sampled frames. This is not a 3D anatomical reconstruction."

**Model.** Fetch `/api/metrics`. Show cards for test AUC (with its 90% interval), sensitivity, specificity, PPV, NPV, F1, threshold, and best epoch (display epoch + 1).
Draw two line charts (loss and AUC, train vs validation, x = epoch 1 to 50) with inline SVG or canvas and no library; mark the best epoch; add axis labels and a legend that does not rely on color alone.
Also show the `/api/curves` image (hide it gracefully on 404). Add a short plain-language note on overfitting (training AUC far above validation AUC).
Add a small table "What the numbers mean" for sensitivity, specificity, PPV, NPV in one sentence each.

**About.** Dataset (EchoNet-Dynamic, A4C only, label EF < 50%), how the model works in simple words (it looks at 16 frames across about 1.3 seconds of one heartbeat sequence),
the single-view limitation, that it was trained on videos from one hospital and may not work on other scanners, that it was evaluated on 500 test videos, that the probabilities are not calibrated,
the paper citation, and the disclaimer. No clinical claims.

**Design.** Calm, clean, medical-research look; one accent color; system font stack. Responsive down to 375 px wide with no horizontal scroll. Light and dark mode through `prefers-color-scheme`.
Accessible: real `<label>`s, visible focus states, contrast of at least 4.5:1, keyboard-operable controls, `alt` text, `aria-live` for status messages. Do not use a template look: give it a deliberate layout.

## 7. Working method

1. Do the pre-flight in section 3. 2. Set up the environment and start the server (section 5). 3. Write and pass `selfcheck.py`. 4. Build the frontend. 5. Run the checks in section 8 using the browser tool.
Keep a list of anything you changed outside `frontend/`.

## 8. Verification checklist (all must pass)

Backend: server starts with no traceback; `selfcheck.py` prints only PASS; `GET /api/health` is ok; the `.js` files are served with a JavaScript content type.
Browser, at http://127.0.0.1:8000 (open it yourself and look at the page):
- Upload a real sample video from `samples/` if present, otherwise the synthetic `.avi`. The result card, gauge, threshold marker and 16-frame filmstrip render.
- 3D view: 16 planes visible, orbit works, slider and play work, "Export video" downloads a `.webm` larger than 50 KB.
- Model page: all numbers match the sanity values in section 1 (within 0.001), both charts show 50 points, the best epoch is labeled as epoch 26, the curves image loads.
- About page renders; the footer disclaimer is on every page.
- Console has no errors; the network panel shows no 404 or failed requests.
- Responsive check at 375 px width (screenshot). Dark and light mode both readable.
- Stop the server and reload: the page shows a friendly error and does not crash. Restart it.
- Upload a `.txt` file and a corrupt `.avi`: the UI shows the error message from the API.

## 9. Deliverables

Working app started by `run.bat`; `backend/selfcheck.py`; `frontend/` with its README; `docs/screens/` with screenshots of each page;
`TEST_REPORT.md` listing each check in section 8 as PASS or FAIL with evidence, every fix you made, and any limitation you could not resolve.
End with a summary of exactly how I start the app next time.
