"""
Multiview X3D-M (omni-read) training script for Kaggle.
Paper: Barrios et al., Nature Cardiovascular Research 2026 (repo: JoshBarrios/omniread-echo)

Kaggle setup: Accelerator = GPU T4 x2 (or P100), then paste this whole file into one cell (or run it as a script).
Needs only preinstalled packages (torch, torchvision, opencv, sklearn, pandas). No wandb / pytorchvideo.

Your CSV needs these columns (same as the official repo):
    filepath_0, filepath_1, filepath_2   one video per view (e.g. A4C, A2C, PLAX), same order in every row
    gt                                   0/1 label
    split                                train / val / test   (optional; made patient-wise if absent)
    patient_id                           optional, used only if 'split' is missing
Works with any number of views: filepath_0 ... filepath_{V-1}.
"""
import os, time, json, random, math
import numpy as np, pandas as pd, cv2
import torch, torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision.transforms import v2
from sklearn.metrics import roc_auc_score, roc_curve, confusion_matrix

# ============================== CONFIG ==============================
CFG = dict(
    CSV_PATH   = "/kaggle/working/echonet_ds.csv",  # created by Cell 1
    VIDEO_ROOT = "/kaggle/input/datasets/mahnurrahman/echonet-dynamic/EchoNet-Dynamic/Videos",  # folder holding the .avi files.
                                # CSV paths like /app/data/lvrv_train_avis/x.avi are mapped to VIDEO_ROOT/x.avi
    LABEL_COL  = "gt",
    OUT_DIR    = "/kaggle/working/run1",
    NUM_FRAMES = 16,            # model head is built for this T (paper's 230M-param model uses 16)
    PERIOD     = 4,             # EchoNet videos are ~50 fps -> 16 frames x 4 = 64 frames (~1.3 s, >= 1 heartbeat)
    RES        = 112,           # EchoNet-Dynamic videos are already 112x112
    BATCH_SIZE = 8,             # per step. If CUDA OOM: use 4 and set ACCUM_STEPS = 2
    ACCUM_STEPS= 1,
    EPOCHS     = 5,             # test run. Paper used 50 epochs, no early stopping
    SAVE_EVERY = 5,             # every 5 epochs also save: model_epoch_XXX.pt, results_epoch_XXX.json, history_..., curves_...png
    CHECK_VIDEOS = False,       # True = open every video first (slow on Kaggle; EchoNet files are clean)
    TRAIN_SUBSET = 2000,        # quick test: random 2000 train videos. Set None for the full 7465
    EVAL_SUBSET  = 500,         # quick test: 500 val and 500 test videos. Set None for all
    OPTIM      = "sgd",         # paper: SGD (momentum .9, wd 1e-4). Repo example used "adam", lr 5e-4
    LR         = 1e-3,          # paper swept 1e-6..5e-2 (best value not reported) -> tune this
    WEIGHT_DECAY = 1e-4,
    PLATEAU_FACTOR = 0.5, PLATEAU_PATIENCE = 5,   # ReduceLROnPlateau on val loss (paper sweep: 3-10, 0.3-0.7)
    AUGMENT    = True,          # paper: random resized crop .95-1, brightness/contrast .8-1.2, rotation +-5 deg
    PAPER_HEAD = True,          # BN+ReLU after conv6/conv7 as described in the paper (False = exactly the released code)
    NUM_WORKERS= 4,
    AMP        = True,          # fp16 mixed precision
    SEED       = 1,
    MAX_HOURS  = 11.0,          # stop cleanly before Kaggle's 12 h limit
    RESUME     = True,          # continue from OUT_DIR/last.pt if it exists
    SYNTHETIC  = False,         # True = tiny fake dataset, only to check the pipeline runs
)

# ============================== MODEL ===============================
# X3D-M backbone (shared across views) + mid-fusion cross-view convolutions.
def conv3x3x3(i, o, stride=1):
    return nn.Conv3d(i, o, 3, stride=(1, stride, stride), padding=1, bias=False, groups=i)

def conv1x1x1(i, o, stride=1):
    return nn.Conv3d(i, o, 1, stride=(1, stride, stride), bias=False)

class Bottleneck(nn.Module):
    def __init__(self, in_planes, planes, stride=1, downsample=None, index=0):
        super().__init__()
        self.index = index
        self.conv1, self.bn1 = conv1x1x1(in_planes, planes[0]), nn.BatchNorm3d(planes[0])
        self.conv2, self.bn2 = conv3x3x3(planes[0], planes[0], stride), nn.BatchNorm3d(planes[0])
        self.conv3, self.bn3 = conv1x1x1(planes[0], planes[1]), nn.BatchNorm3d(planes[1])
        self.swish, self.relu = nn.SiLU(), nn.ReLU(inplace=True)
        if index % 2 == 0:  # squeeze-and-excitation on every 2nd block
            w = self._round_width(planes[0])
            self.pool = nn.AdaptiveAvgPool3d(1)
            self.fc1, self.fc2 = nn.Conv3d(planes[0], w, 1), nn.Conv3d(w, planes[0], 1)
        self.downsample = downsample

    @staticmethod
    def _round_width(width, multiplier=0.0625, min_width=8, divisor=8):
        width *= multiplier
        out = max(min_width, int(width + divisor / 2) // divisor * divisor)
        if out < 0.9 * width:
            out += divisor
        return int(out)

    def forward(self, x):
        res = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        if self.index % 2 == 0:
            out = out * torch.sigmoid(self.fc2(self.relu(self.fc1(self.pool(out)))))
        out = self.bn3(self.conv3(self.swish(out)))
        if self.downsample is not None:
            res = self.downsample(x)
        return self.relu(out + res)

class X3DMulti(nn.Module):
    BLOCKS = [3, 5, 11, 7]
    PLANES = [(54, 24), (108, 48), (216, 96), (432, 192)]

    def __init__(self, num_views=3, num_frames=16, dropout=0.5, paper_head=True):
        super().__init__()
        self.T, self.V = num_frames, num_views
        self.in_planes, self._idx = self.PLANES[0][1], 0
        self.conv1_s = nn.Conv3d(3, self.in_planes, (1, 3, 3), (1, 2, 2), (0, 1, 1), bias=False)
        self.conv1_t = nn.Conv3d(self.in_planes, self.in_planes, (5, 1, 1), padding=(2, 0, 0),
                                 bias=False, groups=self.in_planes)
        self.bn1, self.relu = nn.BatchNorm3d(self.in_planes), nn.ReLU(inplace=True)
        self.layers = nn.Sequential(*[self._make_layer(self.PLANES[i], self.BLOCKS[i]) for i in range(4)])
        self.conv5 = nn.Conv3d(self.PLANES[3][1], self.PLANES[3][0], 1, bias=False)   # 192 -> 432
        self.bn5 = nn.BatchNorm3d(self.PLANES[3][0])
        # ---- cross-view fusion ----
        self.conv6 = nn.Conv2d(432, 64, (3, 1), padding=(1, 0), bias=False)           # conv over the view axis
        self.conv7 = nn.Conv3d(64 * num_frames, 512 * num_frames, 3, padding=1, bias=False)  # conv over view,h,w
        self.bn6 = nn.BatchNorm2d(64) if paper_head else nn.Identity()
        self.bn7 = nn.BatchNorm3d(512 * num_frames) if paper_head else nn.Identity()
        self.pool, self.drop = nn.AdaptiveAvgPool3d(1), nn.Dropout(dropout)
        self.fc = nn.Linear(512 * num_views, 1)                                       # 1 logit (binary)
        for m in self.modules():
            if isinstance(m, nn.Conv3d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")

    def _make_layer(self, planes, blocks):
        ds = nn.Sequential(conv1x1x1(self.in_planes, planes[1], 2), nn.BatchNorm3d(planes[1]))
        layers = [Bottleneck(self.in_planes, planes, 2, ds, self._idx)]
        self.in_planes, self._idx = planes[1], self._idx + 1
        for _ in range(1, blocks):
            layers.append(Bottleneck(self.in_planes, planes, 1, None, self._idx))
            self._idx += 1
        self._idx = 0
        return nn.Sequential(*layers)

    def encode(self, z):  # one view: (B,3,T,H,W) -> (B,432,T,h,w)
        z = self.relu(self.bn1(self.conv1_t(self.conv1_s(z))))
        z = self.layers(z)
        return self.relu(self.bn5(self.conv5(z)))

    def forward(self, x):  # x: (B, V, 3, T, H, W)
        z = torch.stack([self.encode(x[:, v]) for v in range(x.shape[1])], dim=2)  # B,C,V,T,h,w
        B, C, V, T, h, w = z.shape
        f = self.conv6(z.flatten(3))                                   # B,64,V,T*h*w
        f = self.relu(self.bn6(f)).reshape(B, 64, V, T, h, w)
        f = f.permute(0, 1, 3, 2, 4, 5).flatten(1, 2)                  # B,64*T,V,h,w
        f = self.relu(self.bn7(self.conv7(f)))                         # B,512*T,V,h,w
        f = f.reshape(B, 512, T, V, h, w).permute(0, 1, 3, 2, 4, 5).flatten(1, 2)  # B,512*V,T,h,w
        f = self.drop(self.pool(f).flatten(1))
        return self.fc(f).squeeze(1)                                   # logits (B,)

# ============================== DATA ================================
def read_clip(path, T, period, res):
    """Return uint8 (T, H, W, 3): frames 0, period, 2*period, ... zero-padded if the video is short."""
    need = T * period
    if path.endswith(".npy"):
        frames = np.load(path)[:need]
        if frames.ndim == 3:
            frames = np.repeat(frames[..., None], 3, -1)
        frames = [cv2.resize(f, (res, res), interpolation=cv2.INTER_AREA) for f in frames]
    else:
        cap, frames = cv2.VideoCapture(path), []
        while len(frames) < need:
            ok, f = cap.read()
            if not ok:
                break
            f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
            if f.shape[0] != res or f.shape[1] != res:
                f = cv2.resize(f, (res, res), interpolation=cv2.INTER_AREA)
            frames.append(f)
        cap.release()
    if len(frames) == 0:
        raise ValueError(f"Could not read any frames from {path}")
    arr = np.stack(frames)
    if len(arr) < need:
        arr = np.concatenate([arr, np.zeros((need - len(arr), res, res, 3), np.uint8)])
    return arr[period * np.arange(T)]

def resolve(p, root):
    """Map a CSV path (e.g. /app/data/lvrv_train_avis/x.avi) to root/x.avi. root="" keeps the path unchanged."""
    p = str(p).replace("\\", "/")
    return os.path.join(root, os.path.basename(p)) if root else p

def filter_readable(df, cols, root, res, report_path):
    """Drop studies where ANY view video is missing/corrupt (checked with OpenCV, the same reader used in training)."""
    good, bad = [], []
    for _, row in df.iterrows():
        ok = True
        for c in cols:
            p = resolve(row[c], root)
            try:
                read_clip(p, 1, 1, res)          # reads only the first frame
            except Exception as e:
                bad.append(dict(path=p, error=str(e)[:80])); ok = False
        good.append(ok)
    print(f"Unreadable videos: {len(bad)} -> dropping {len(good) - sum(good)} of {len(good)} studies")
    if bad:
        pd.DataFrame(bad).to_csv(report_path, index=False)
        print(pd.DataFrame(bad).to_string(index=False))
    return df[np.array(good)].reset_index(drop=True)

class EchoMulti(Dataset):
    def __init__(self, df, view_cols, label_col, mean, std, cfg, augment):
        self.df, self.cols, self.label_col, self.cfg, self.augment = df.reset_index(drop=True), view_cols, label_col, cfg, augment
        self.mean, self.std = mean, std                      # (V,3) arrays, scale 0-1
        self.aug = v2.Compose([
            v2.RandomResizedCrop(cfg["RES"], scale=(0.95, 1.0), ratio=(1.0, 1.0), antialias=True),
            v2.ColorJitter(brightness=(0.8, 1.2), contrast=(0.8, 1.2)),
            v2.RandomRotation(5)])

    def __len__(self):
        return len(self.df)

    def _path(self, p):
        return resolve(p, self.cfg["VIDEO_ROOT"])

    def load_view(self, row, v, augment):
        c = self.cfg
        clip = torch.from_numpy(read_clip(self._path(row[self.cols[v]]), c["NUM_FRAMES"], c["PERIOD"], c["RES"]))
        clip = clip.permute(0, 3, 1, 2)                      # T,3,H,W uint8
        if augment:
            clip = self.aug(clip)
        clip = clip.float() / 255.0
        if self.mean is not None:
            clip = (clip - torch.tensor(self.mean[v]).view(1, 3, 1, 1)) / torch.tensor(self.std[v]).view(1, 3, 1, 1)
        return clip.permute(1, 0, 2, 3)                      # 3,T,H,W

    def __getitem__(self, i):
        row = self.df.iloc[i]
        x = torch.stack([self.load_view(row, v, self.augment) for v in range(len(self.cols))])  # V,3,T,H,W
        return x, torch.tensor(float(row[self.label_col]))

def compute_mean_std(df, cols, label_col, cfg, n=64):
    ds = EchoMulti(df.sample(min(n, len(df)), random_state=0), cols, label_col, None, None, cfg, augment=False)
    s1, s2, cnt = np.zeros((len(cols), 3)), np.zeros((len(cols), 3)), 0
    for i in range(len(ds)):
        x = ds[i][0].double().numpy()                        # V,3,T,H,W
        s1 += x.sum((2, 3, 4)); s2 += (x ** 2).sum((2, 3, 4)); cnt += x.shape[2] * x.shape[3] * x.shape[4]
    mean = s1 / cnt
    std = np.sqrt(np.maximum(s2 / cnt - mean ** 2, 1e-8))
    return mean.astype(np.float32), std.astype(np.float32)

def make_synthetic(root, n=24, res=64, frames=40, views=3):
    """Tiny fake dataset: label = brighter videos. Only for checking that the code runs."""
    os.makedirs(root, exist_ok=True)
    rows, rng = [], np.random.RandomState(0)
    for i in range(n):
        y, row = i % 2, {}
        for v in range(views):
            p = f"{root}/s{i}_v{v}.avi"
            w = cv2.VideoWriter(p, cv2.VideoWriter_fourcc(*"MJPG"), 30, (res, res))
            for _ in range(frames):
                w.write(np.clip(rng.randint(0, 120, (res, res, 3)) + 80 * y, 0, 255).astype(np.uint8))
            w.release()
            row[f"filepath_{v}"] = p
        row.update(gt=y, patient_id=i, split="train" if i < 16 else "val" if i < 20 else "test")
        rows.append(row)
    pd.DataFrame(rows).to_csv(f"{root}/synthetic.csv", index=False)
    return f"{root}/synthetic.csv"

# ============================== METRICS =============================
def binary_metrics(y, p, thr):
    pred = (p >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    d = lambda a, b: a / b if b else float("nan")
    sens, spec, ppv, npv = d(tp, tp + fn), d(tn, tn + fp), d(tp, tp + fp), d(tn, tn + fn)
    return dict(sens=sens, spec=spec, ppv=ppv, npv=npv, f1=d(2 * tp, 2 * tp + fp + fn))

def gmean_threshold(y, p):
    fpr, tpr, thr = roc_curve(y, p)
    return float(thr[np.argmax(np.sqrt(tpr * (1 - fpr)))])   # paper: threshold maximizing sqrt(sens*spec)

def bootstrap_auc_ci(y, p, n=1000, seed=0):
    rng, aucs = np.random.RandomState(seed), []
    for _ in range(n):
        idx = rng.randint(0, len(y), len(y))
        if len(np.unique(y[idx])) == 2:
            aucs.append(roc_auc_score(y[idx], p[idx]))
    return np.percentile(aucs, [5, 95])

# ============================== TRAIN ===============================
def run_epoch(model, loader, device, optim=None, scaler=None, accum=1, amp=True):
    train = optim is not None
    t_ep = time.time()
    model.train(train)
    crit, tot, n, ys, ps = nn.BCEWithLogitsLoss(), 0.0, 0, [], []
    if train:
        optim.zero_grad(set_to_none=True)
    with torch.set_grad_enabled(train):
        for i, (x, y) in enumerate(loader):
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.float16, enabled=amp and device.type == "cuda"):
                logit = model(x)
            loss = crit(logit.float(), y)
            if train:
                scaler.scale(loss / accum).backward()
                if (i + 1) % accum == 0 or (i + 1) == len(loader):
                    scaler.step(optim); scaler.update(); optim.zero_grad(set_to_none=True)
            tot += loss.item() * len(y); n += len(y)
            if train and i % 50 == 0:
                print(f"   batch {i}/{len(loader)} | loss {tot / n:.4f} | {time.time() - t_ep:.0f}s", flush=True)
            ys.append(y.cpu().numpy()); ps.append(torch.sigmoid(logit.float()).detach().cpu().numpy())
    y, p = np.concatenate(ys), np.concatenate(ps)
    auc = roc_auc_score(y, p) if len(np.unique(y)) == 2 else float("nan")
    return tot / n, auc, y, p

def main(cfg=CFG):
    t_start = time.time()
    random.seed(cfg["SEED"]); np.random.seed(cfg["SEED"]); torch.manual_seed(cfg["SEED"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    os.makedirs(cfg["OUT_DIR"], exist_ok=True)

    csv_path = make_synthetic("/kaggle/working/synth" if os.path.isdir("/kaggle/working") else "./synth",
                              res=cfg["RES"]) if cfg["SYNTHETIC"] else cfg["CSV_PATH"]
    df = pd.read_csv(csv_path)
    cols = sorted([c for c in df.columns if c.startswith("filepath_")], key=lambda c: int(c.split("_")[1]))
    assert cols, "CSV needs columns filepath_0, filepath_1, ..."
    lab = cfg["LABEL_COL"]
    assert set(df[lab].unique()) <= {0, 1}, "This script is for binary labels (0/1)."
    n_unique = pd.concat([df[c] for c in cols]).nunique()
    print(f"CSV rows: {len(df)} | unique video files referenced: {n_unique} (expected about {len(df) * len(cols)})")
    if n_unique < 0.5 * len(df) * len(cols):
        print("WARNING: many rows share the same videos -> labels cannot be learned. Check/fix the CSV.")
    if cfg["CHECK_VIDEOS"]:
        df = filter_readable(df, cols, cfg["VIDEO_ROOT"], cfg["RES"], os.path.join(cfg["OUT_DIR"], "bad_videos.csv"))
    else:   # still make sure the folder path is right by opening a few videos
        for c in cols:
            read_clip(resolve(df[c].iloc[0], cfg["VIDEO_ROOT"]), 1, 1, cfg["RES"])
    assert len(df) > 0, "No readable videos - check VIDEO_ROOT path"

    if "split" not in df.columns:   # patient-wise 70/15/15 like the paper
        key = df["patient_id"] if "patient_id" in df.columns else pd.Series(np.arange(len(df)))
        ids = key.unique(); np.random.RandomState(cfg["SEED"]).shuffle(ids)
        a, b = int(.70 * len(ids)), int(.85 * len(ids))
        sp = {k: "train" for k in ids[:a]} | {k: "val" for k in ids[a:b]} | {k: "test" for k in ids[b:]}
        df["split"] = key.map(sp)
        print("No 'split' column found -> created patient-wise split.")
    df["split"] = df["split"].str.lower()
    parts = {s: df[df.split == s] for s in ["train", "val", "test"]}
    if cfg["TRAIN_SUBSET"]:     # quick test runs: use only a random subset
        parts["train"] = parts["train"].sample(min(cfg["TRAIN_SUBSET"], len(parts["train"])), random_state=0)
    if cfg["EVAL_SUBSET"]:
        for s in ["val", "test"]:
            parts[s] = parts[s].sample(min(cfg["EVAL_SUBSET"], len(parts[s])), random_state=0)
    for s, d in parts.items():
        print(f"{s:5s}: {len(d):6d} studies | prevalence {d[lab].mean():.3f}")

    mean, std = compute_mean_std(parts["train"], cols, lab, cfg)
    print("per-view mean:", mean.round(3).tolist(), "std:", std.round(3).tolist())

    mk = lambda s, aug, shuf: DataLoader(
        EchoMulti(parts[s], cols, lab, mean, std, cfg, aug), batch_size=cfg["BATCH_SIZE"], shuffle=shuf,
        drop_last=shuf, num_workers=cfg["NUM_WORKERS"], pin_memory=device.type == "cuda",
        persistent_workers=cfg["NUM_WORKERS"] > 0)
    loaders = dict(train=mk("train", cfg["AUGMENT"], True), val=mk("val", False, False), test=mk("test", False, False))

    model = X3DMulti(len(cols), cfg["NUM_FRAMES"], paper_head=cfg["PAPER_HEAD"]).to(device)
    print(f"Parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.1f} M (paper: ~230 M for 3 views, T=16)")
    net = nn.DataParallel(model) if torch.cuda.device_count() > 1 else model
    core = lambda: net.module if isinstance(net, nn.DataParallel) else net

    if cfg["OPTIM"] == "sgd":
        optim = torch.optim.SGD(net.parameters(), lr=cfg["LR"], momentum=0.9, weight_decay=cfg["WEIGHT_DECAY"])
    else:
        optim = torch.optim.Adam(net.parameters(), lr=cfg["LR"], weight_decay=cfg["WEIGHT_DECAY"])
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(optim, "min", factor=cfg["PLATEAU_FACTOR"],
                                                       patience=cfg["PLATEAU_PATIENCE"])
    scaler = torch.amp.GradScaler("cuda", enabled=cfg["AMP"] and device.type == "cuda")

    start, best_auc, hist = 0, 0.0, []
    last = os.path.join(cfg["OUT_DIR"], "last.pt")
    if cfg["RESUME"] and os.path.exists(last):
        ck = torch.load(last, map_location=device, weights_only=False)
        core().load_state_dict(ck["model"]); optim.load_state_dict(ck["optim"]); sched.load_state_dict(ck["sched"])
        start, best_auc, hist = ck["epoch"] + 1, ck["best_auc"], ck["hist"]
        print(f"Resumed from epoch {start}")

    for ep in range(start, cfg["EPOCHS"]):
        t0 = time.time()
        tl, ta, *_ = run_epoch(net, loaders["train"], device, optim, scaler, cfg["ACCUM_STEPS"], cfg["AMP"])
        vl, va, *_ = run_epoch(net, loaders["val"], device, amp=cfg["AMP"])
        sched.step(vl)
        hist.append(dict(epoch=ep, train_loss=tl, train_auc=ta, val_loss=vl, val_auc=va, lr=optim.param_groups[0]["lr"]))
        print(f"ep {ep:02d} | train loss {tl:.4f} auc {ta:.3f} | val loss {vl:.4f} auc {va:.3f} | "
              f"lr {optim.param_groups[0]['lr']:.2e} | {time.time() - t0:.0f}s")
        if va > best_auc:                                   # paper: keep the checkpoint with highest dev AUC
            best_auc = va
            torch.save(dict(model=core().state_dict(), mean=mean, std=std, cols=cols, cfg=cfg, epoch=ep, val_auc=va),
                       os.path.join(cfg["OUT_DIR"], "best.pt"))
        torch.save(dict(model=core().state_dict(), optim=optim.state_dict(), sched=sched.state_dict(),
                        epoch=ep, best_auc=best_auc, hist=hist), last)
        pd.DataFrame(hist).to_csv(os.path.join(cfg["OUT_DIR"], "history.csv"), index=False)
        if cfg["SAVE_EVERY"] and (ep + 1) % cfg["SAVE_EVERY"] == 0:      # snapshot every N epochs
            tag = f"epoch_{ep + 1:03d}"
            snap = {k: (v.half() if v.is_floating_point() else v) for k, v in core().state_dict().items()}
            torch.save(snap, os.path.join(cfg["OUT_DIR"], f"model_{tag}.pt"))   # fp16 weights (half the size)
            json.dump(dict(hist[-1], best_val_auc=best_auc), open(os.path.join(cfg["OUT_DIR"], f"results_{tag}.json"), "w"),
                      indent=2, default=float)
            pd.DataFrame(hist).to_csv(os.path.join(cfg["OUT_DIR"], f"history_{tag}.csv"), index=False)
            try:
                import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
                h = pd.DataFrame(hist); fig, ax = plt.subplots(1, 2, figsize=(10, 3.5))
                ax[0].plot(h.epoch, h.train_loss, label="train"); ax[0].plot(h.epoch, h.val_loss, label="val")
                ax[0].set_title("Loss"); ax[0].legend()
                ax[1].plot(h.epoch, h.train_auc, label="train"); ax[1].plot(h.epoch, h.val_auc, label="val")
                ax[1].set_title("AUC"); ax[1].legend(); fig.tight_layout()
                fig.savefig(os.path.join(cfg["OUT_DIR"], f"curves_{tag}.png"), dpi=120); plt.close(fig)
            except Exception as e:
                print("plot skipped:", e)
            print(f"   saved snapshot {tag} -> {cfg['OUT_DIR']}", flush=True)
        if (time.time() - t_start) / 3600 > cfg["MAX_HOURS"]:
            print("Time budget reached - stopping. Re-run the cell to resume."); break

    # ---------------- final evaluation with the best checkpoint ----------------
    ck = torch.load(os.path.join(cfg["OUT_DIR"], "best.pt"), map_location=device, weights_only=False)
    core().load_state_dict(ck["model"])
    _, vauc, vy, vp = run_epoch(net, loaders["val"], device, amp=cfg["AMP"])
    thr = gmean_threshold(vy, vp)                           # threshold chosen on validation set only
    _, tauc, ty, tp = run_epoch(net, loaders["test"], device, amp=cfg["AMP"])
    lo, hi = bootstrap_auc_ci(ty, tp)
    res = dict(best_epoch=ck["epoch"], val_auc=vauc, test_auc=tauc, test_auc_ci90=[lo, hi], threshold=thr,
               **binary_metrics(ty, tp, thr))
    json.dump(res, open(os.path.join(cfg["OUT_DIR"], "test_results.json"), "w"), indent=2, default=float)
    pd.DataFrame(dict(y=ty, prob=tp)).to_csv(os.path.join(cfg["OUT_DIR"], "test_predictions.csv"), index=False)
    print(json.dumps(res, indent=2, default=float))

if __name__ == "__main__":
    main()
