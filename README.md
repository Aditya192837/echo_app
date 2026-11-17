# Echo LV-function demo

```
echo_app/
  MASTER_PROMPT.md             paste this into Antigravity
  README.md
  backend/
    app.py                     FastAPI server (loads best.pt, /api/predict, /api/metrics)
    omniread_kaggle_train.py   model + video-reading code from training (imported by app.py)
    requirements.txt
  frontend/                    EMPTY - Antigravity builds this
  model/                       files downloaded from Kaggle (run1 folder)
    best.pt                    REQUIRED, ONE FILE (about 0.9 GB). Do not unzip it.
    test_results.json          test metrics + decision threshold
    history.csv                training curve data
    curves_epoch_050.png       training curves image
  samples/                     optional: a few .avi videos to test with
```

Turn on View > Show > File name extensions in Windows Explorer so you can see that the names really end in .json / .csv / .pt.
