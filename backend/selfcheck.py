"""
Self-check script for the Echo LV Function backend.
Tests:
1. Import backend.app and run a forward pass on a random tensor (1, 1, 3, 16, 112, 112) -> one finite number.
2. Using fastapi.testclient.TestClient: synthetic 112x112 MJPG .avi (60 frames), POST to /api/predict -> status 200, 0 <= prob <= 1, 16 frames, abnormal == (prob >= threshold).
3. /api/metrics: contains required keys, history has 50 rows, test.test_auc is between 0.86 and 0.87.
4. Error paths: .txt upload gives 400; garbage x.avi gives 422.
"""
import io
import math
import os
import sys
import tempfile
from pathlib import Path

# Add project root and backend to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

import cv2
import numpy as np
import torch
from fastapi.testclient import TestClient

def run_selfcheck():
    all_passed = True

    # ---------------- Check 1: Forward pass ----------------
    print("[1] Forward pass test...")
    try:
        from backend.app import model, device
        x = torch.randn(1, 1, 3, 16, 112, 112, device=device)
        with torch.no_grad():
            out = model(x)
        # out should be logits (1,)
        val = out.item() if hasattr(out, "item") else float(out)
        if math.isfinite(val):
            print(f"    PASS: Forward pass produced finite output: {val:.4f}")
        else:
            print(f"    FAIL: Forward pass output is not finite: {val}")
            all_passed = False
    except Exception as e:
        print(f"    FAIL: Forward pass raised exception: {e}")
        all_passed = False

    # ---------------- Check 2: POST /api/predict with synthetic video ----------------
    print("[2] Synthetic video prediction test...")
    try:
        from backend.app import app
        client = TestClient(app)

        # Create a synthetic 112x112 MJPG .avi with OpenCV (60 frames)
        with tempfile.NamedTemporaryFile(suffix=".avi", delete=False) as tmp:
            tmp_path = tmp.name

        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        vw = cv2.VideoWriter(tmp_path, fourcc, 30.0, (112, 112))
        for i in range(60):
            # Create a moving shape to simulate motion
            img = np.zeros((112, 112, 3), dtype=np.uint8)
            cv2.circle(img, (56 + int(20 * math.sin(i / 5.0)), 56), 25, (200, 200, 200), -1)
            vw.write(img)
        vw.release()

        with open(tmp_path, "rb") as f:
            video_bytes = f.read()
        os.unlink(tmp_path)

        res = client.post("/api/predict", files={"file": ("synth.avi", video_bytes, "video/x-msvideo")})
        if res.status_code != 200:
            print(f"    FAIL: POST /api/predict returned status {res.status_code}: {res.text}")
            all_passed = False
        else:
            data = res.json()
            prob = data.get("probability")
            threshold = data.get("threshold")
            abnormal = data.get("abnormal")
            frames = data.get("frames", [])

            c1 = (prob is not None and 0.0 <= prob <= 1.0)
            c2 = (len(frames) == 16)
            c3 = (abnormal == (prob >= threshold))

            if c1 and c2 and c3:
                print(f"    PASS: Predict returned 200, prob={prob:.4f}, threshold={threshold}, abnormal={abnormal}, 16 frames")
            else:
                print(f"    FAIL: Conditions not met: prob_valid={c1}, 16_frames={c2}, abnormal_correct={c3}")
                all_passed = False
    except Exception as e:
        print(f"    FAIL: Synthetic prediction raised exception: {e}")
        all_passed = False

    # ---------------- Check 3: GET /api/metrics ----------------
    print("[3] Metrics endpoint test...")
    try:
        from backend.app import app
        client = TestClient(app)
        res = client.get("/api/metrics")
        if res.status_code != 200:
            print(f"    FAIL: GET /api/metrics returned status {res.status_code}")
            all_passed = False
        else:
            data = res.json()
            required_root_keys = ["test", "history", "threshold", "best_epoch", "best_val_auc", "config"]
            missing_root = [k for k in required_root_keys if k not in data]

            test = data.get("test", {})
            required_test_keys = ["best_epoch", "val_auc", "test_auc", "test_auc_ci90", "threshold", "sens", "spec", "ppv", "npv", "f1"]
            missing_test = [k for k in required_test_keys if k not in test]

            config = data.get("config", {})
            required_cfg_keys = ["NUM_FRAMES", "PERIOD", "RES", "OPTIM", "LR", "EPOCHS"]
            missing_cfg = [k for k in required_cfg_keys if k not in config]

            history = data.get("history", [])
            hist_len = len(history)

            test_auc = test.get("test_auc", 0.0)
            auc_in_range = (0.86 <= test_auc <= 0.87)

            if missing_root or missing_test or missing_cfg:
                print(f"    FAIL: Missing keys - root: {missing_root}, test: {missing_test}, config: {missing_cfg}")
                all_passed = False
            elif hist_len != 50:
                print(f"    FAIL: history length is {hist_len}, expected 50")
                all_passed = False
            elif not auc_in_range:
                print(f"    FAIL: test_auc={test_auc} is not between 0.86 and 0.87")
                all_passed = False
            else:
                print(f"    PASS: /api/metrics valid, test_auc={test_auc:.4f}, 50 history rows, config present")
    except Exception as e:
        print(f"    FAIL: Metrics endpoint raised exception: {e}")
        all_passed = False

    # ---------------- Check 4: Error paths ----------------
    print("[4] Error paths test...")
    try:
        from backend.app import app
        client = TestClient(app)

        # 4a. .txt file upload -> 400
        res_txt = client.post("/api/predict", files={"file": ("test.txt", b"Hello world", "text/plain")})
        c_txt = (res_txt.status_code == 400)

        # 4b. Garbage x.avi upload -> 422
        res_garbage = client.post("/api/predict", files={"file": ("x.avi", b"corrupted garbage video content 1234567890", "video/x-msvideo")})
        c_garbage = (res_garbage.status_code == 422)

        if c_txt and c_garbage:
            print("    PASS: Error paths verified: .txt -> 400, garbage x.avi -> 422")
        else:
            print(f"    FAIL: Error paths: txt_400={c_txt} (got {res_txt.status_code}), garbage_422={c_garbage} (got {res_garbage.status_code})")
            all_passed = False
    except Exception as e:
        print(f"    FAIL: Error paths raised exception: {e}")
        all_passed = False

    print("=" * 40)
    if all_passed:
        print("OVERALL RESULT: ALL CHECKS PASSED")
        sys.exit(0)
    else:
        print("OVERALL RESULT: FAILURES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    run_selfcheck()
