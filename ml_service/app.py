from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import torch
import torch.nn as nn
from pathlib import Path
from datetime import datetime, timezone

app = FastAPI(title='FinSentinel ML Service')

THRESHOLD = 0.65
INPUT_DIM = 8

class InferIn(BaseModel):
    features: list[float]

class TinyMLP(nn.Module):
    def __init__(self, dim=INPUT_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, 16), nn.ReLU(),
            nn.Linear(16, 8), nn.ReLU(),
            nn.Linear(8, 1), nn.Sigmoid()
        )

    def forward(self, x):
        return self.net(x)

MODEL_PATH = Path(__file__).resolve().parent / 'model.pt'
model = TinyMLP(dim=INPUT_DIM)
model_loaded = False
if MODEL_PATH.exists():
    model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
    model_loaded = True
model.eval()

@app.get('/health')
def health():
    return {'ok': True, 'service': 'ml'}

@app.get('/model/info')
def model_info():
    return {
        'model_type': 'TinyMLP',
        'input_dim': INPUT_DIM,
        'threshold': THRESHOLD,
        'model_loaded': model_loaded,
    }

@app.get('/simulate')
def simulate():
    sample = np.array([0.95, 0.72, -0.18, 0.41, 0.07, 1.01, 0.15, 0.32], dtype=np.float32)
    x = torch.tensor(sample).unsqueeze(0)
    with torch.no_grad():
        score = float(model(x).item())
    return {
        'features': sample.tolist(),
        'risk_score': round(score, 4),
        'label': 'anomaly' if score > THRESHOLD else 'normal'
    }

def decision_reason(arr: np.ndarray) -> str:
    pairs = list(enumerate(np.abs(arr), start=1))
    pairs.sort(key=lambda x: x[1], reverse=True)
    top = pairs[:2]
    return f"Top drivers: f{top[0][0]}={arr[top[0][0]-1]:.3f}, f{top[1][0]}={arr[top[1][0]-1]:.3f}"

@app.post('/infer')
def infer(inp: InferIn):
    arr = np.array(inp.features[:INPUT_DIM], dtype=np.float32)
    if arr.shape[0] < INPUT_DIM:
        arr = np.pad(arr, (0, INPUT_DIM-arr.shape[0]))
    x = torch.tensor(arr).unsqueeze(0)
    with torch.no_grad():
        score = float(model(x).item())
    label = 'anomaly' if score > THRESHOLD else 'normal'
    confidence = round(max(score, 1-score), 4)
    recommendation = 'reduce risk / hedge' if label == 'anomaly' else 'hold / monitor'
    return {
        'risk_score': round(score, 4),
        'label': label,
        'confidence': confidence,
        'recommendation': recommendation,
        'decision_reason': decision_reason(arr),
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
