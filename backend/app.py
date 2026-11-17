"""
Inference server for the trained EchoNet-Dynamic model (abnormal LV function = EF < 50%).
Run from the echo_app folder:   uvicorn backend.app:app --port 8000      (or: cd backend && uvicorn app:app --port 8000)
Then open http://localhost:8000  (the frontend/ folder is served from "/").

Needs in ../model/ :  best.pt  (required),  test_results.json, history.csv, curves_epoch_050.png (optional, for the Model page)
"""
import os, sys, json, base64, tempfile, mimetypes
from pathlib import Path

# Windows registry sometimes maps .js to text/plain, which breaks ES-module scripts in the browser
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from omniread_kaggle_train import X3DMulti, read_clip   # same model/reader code used for training

MODEL_DIR = Path(os.environ.get("MODEL_DIR", HERE.parent / "model"))
FRONTEND_DIR = HERE.parent / "frontend"
MAX_MB = 100
ALLOWED = {".avi", ".mp4", ".mov"}

# ---------------- load model once at startup ----------------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
def _find(*names):
    for n in names:
        p = MODEL_DIR / n
        if p.is_file():
            return p
    return None

BEST = _find("best.pt")
if BEST is None:
    hint = (" 'best' is a FOLDER: the checkpoint was extracted. Delete it and re-download best.pt as ONE file."
            if (MODEL_DIR / "best").is_dir() else "")
    raise SystemExit(f"ERROR: best.pt not found in {MODEL_DIR}.{hint}")
ck = torch.load(BEST, map_location="cpu", weights_only=False)
cfg, mean, std = ck["cfg"], ck["mean"], ck["std"]          # training config + normalisation stats (per view)
model = X3DMulti(len(ck["cols"]), cfg["NUM_FRAMES"], paper_head=cfg["PAPER_HEAD"])
model.load_state_dict(ck["model"])
model.to(device).eval()

_rp = _find("test_results.json", "test_results.txt")      # .txt tolerated (Windows may save it that way)
RESULTS = json.loads(_rp.read_text()) if _rp else {}
THRESHOLD = float(os.environ.get("THRESHOLD", RESULTS.get("threshold", 0.5)))   # chosen on the validation set in training
print(f"Model loaded (best epoch {ck.get('epoch')}, val AUC {ck.get('val_auc'):.3f}) | threshold {THRESHOLD:.3f} | device {device}")

app = FastAPI(title="Echo LV function demo")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health():
    return {"status": "ok", "device": str(device)}

@app.get("/api/metrics")
def metrics():
    hist = []
    h = _find("history.csv", "history.txt")
    if h:
        import csv
        hist = [{k: float(v) for k, v in r.items()} for r in csv.DictReader(open(h))]
    return {"test": RESULTS, "history": hist, "threshold": THRESHOLD,
            "best_epoch": ck.get("epoch"), "best_val_auc": ck.get("val_auc"),
            "config": {k: cfg[k] for k in ["NUM_FRAMES", "PERIOD", "RES", "OPTIM", "LR", "EPOCHS"] if k in cfg}}

@app.get("/api/curves")
def curves():
    files = sorted(MODEL_DIR.glob("curves_epoch_*.png"))
    if not files:
        raise HTTPException(404, "No curves image in model/")
    return FileResponse(files[-1])

@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    suffix = Path(file.filename or "x.avi").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Upload a video file ({', '.join(sorted(ALLOWED))}).")
    data = await file.read()
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"File larger than {MAX_MB} MB.")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data); path = f.name
    try:
        clip = read_clip(path, cfg["NUM_FRAMES"], cfg["PERIOD"], cfg["RES"])     # (T,H,W,3) uint8, same as training
    except Exception:
        raise HTTPException(422, "Could not read frames from this video.")
    finally:
        os.unlink(path)

    x = torch.from_numpy(clip).permute(0, 3, 1, 2).float() / 255.0               # T,3,H,W
    x = (x - torch.tensor(mean[0]).view(1, 3, 1, 1)) / torch.tensor(std[0]).view(1, 3, 1, 1)
    x = x.permute(1, 0, 2, 3)[None, None].to(device)                             # B=1, V=1, 3, T, H, W
    with torch.no_grad():
        prob = torch.sigmoid(model(x)).item()

    frames = []                                                                   # the frames the model saw (for the 3D viewer)
    for fr in clip:
        ok, buf = cv2.imencode(".jpg", cv2.cvtColor(fr, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
        frames.append("data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode())
    return {"probability": prob, "threshold": THRESHOLD, "abnormal": prob >= THRESHOLD,
            "label": "Reduced LV function (EF < 50%) likely" if prob >= THRESHOLD else "Normal LV function likely",
            "frames": frames, "frame_period": cfg["PERIOD"]}

# serve the frontend last so /api/* routes win
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
