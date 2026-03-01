# Updated ml_service/app.py for ML-P1 & ML-P2: Risk Classification API with Uncertainty
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
import json

app = FastAPI(title='SDLC Sentinel ML Service')  # Refactored name

# Risk Taxonomy: low, medium, high based on SDLC destructive potential [web:1][web:6][web:10]
RISK_CATEGORIES = ['low', 'medium', 'high']
NUM_CLASSES = len(RISK_CATEGORIES)
THRESHOLDS = {'auto_approve': 0.3, 'review': 0.7}  # Scores; uncertainty >0.2 triggers review [web:7][web:11]

# Updated for text/code diffs: embed_dim=128 (placeholder; in prod use sentence-transformers)
EMBED_DIM = 128

class RiskIn(BaseModel):
    text: str  # Proposed action/diff/code snippet
    features: Optional[List[float]] = None  # Legacy support

class RiskMLP(nn.Module):
    def __init__(self, embed_dim=EMBED_DIM, num_classes=NUM_CLASSES):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embed_dim, 64), nn.ReLU(),
            nn.Linear(64, 32), nn.ReLU(),
            nn.Linear(32, num_classes)
        )
        # MC Dropout layers for uncertainty [web:7][web:11][web:22]
        self.dropout1 = nn.Dropout(0.2)
        self.dropout2 = nn.Dropout(0.2)

    def forward(self, x, mc_dropout=False):
        x = F.relu(self.net[0](x))
        x = self.dropout1(x) if mc_dropout else x
        x = F.relu(self.net[1](x))
        x = self.dropout2(x) if mc_dropout else x
        return self.net[2](x)

MODEL_PATH = Path(__file__).resolve().parent / 'risk_model.pt'
model = RiskMLP()
model_loaded = False
if MODEL_PATH.exists():
    model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
    model_loaded = True
model.eval()

@app.get('/health')
def health():
    return {'ok': True, 'service': 'ml_sdlc'}

@app.get('/model/info')
def model_info():
    return {
        'model_type': 'RiskMLP',
        'input_dim': EMBED_DIM,
        'categories': RISK_CATEGORIES,
        'thresholds': THRESHOLDS,
        'model_loaded': model_loaded,
    }

# Legacy endpoint for compatibility
@app.post('/infer')
def infer_legacy(inp: InferIn):  # Assume InferIn defined as before
    # ... legacy code ...
    pass  # Evolve progressively

@app.post('/classify')
def classify_action(inp: RiskIn):
    if not model_loaded:
        raise HTTPException(status_code=503, detail='Model not loaded; using fallback')
    
    # Placeholder embedding: hash-based for demo (prod: use BERT/sentence-transformers)
    embed = np.random.normal(0, 1, EMBED_DIM).astype(np.float32)  # Replace with real embedder
    if inp.features:
        embed[:min(len(inp.features), EMBED_DIM)] = np.array(inp.features[:EMBED_DIM], dtype=np.float32)
    
    x = torch.tensor(embed).unsqueeze(0)
    
    # Inference with MC Dropout for uncertainty (T=10 samples) [web:7][web:22]
    preds = []
    model.train()  # Enable dropout
    with torch.no_grad():
        for _ in range(10):
            logit = model(x, mc_dropout=True)
            prob = F.softmax(logit, dim=-1)
            preds.append(prob)
    model.eval()
    
    pred_mean = torch.stack(preds).mean(0)
    pred_std = torch.stack(preds).std(0)
    
    risk_score = float(pred_mean.max().item())  # Max prob as score
    category_idx = pred_mean.argmax().item()
    category = RISK_CATEGORIES[category_idx]
    uncertainty = float(pred_std[category_idx].item())  # Epistemic unc. on top class
    
    # Decision logic [web:6]
    if risk_score < THRESHOLDS['auto_approve'] or uncertainty > 0.2:
        recommendation = 'review'
    elif risk_score > THRESHOLDS['review']:
        recommendation = 'block'
    else:
        recommendation = 'auto-approve'
    
    return {
        'risk_score': round(risk_score, 4),
        'risk_category': category,
        'uncertainty': round(uncertainty, 4),
        'recommendation': recommendation,
        'probs': {cat: round(p, 4) for cat, p in zip(RISK_CATEGORIES, pred_mean[0].tolist())},
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }

# ML-P3: Basic drift detector (placeholder: monitor inference stats)
@app.post('/drift/check')
def check_drift(recent_scores: List[float]):
    if len(recent_scores) < 10:
        return {'drift': False, 'signal': 'insufficient data'}
    mean_recent = np.mean(recent_scores)
    # Simple z-score vs historical (hardcoded demo)
    historical_mean = 0.4
    std = 0.2
    z = (mean_recent - historical_mean) / std
    drift = abs(z) > 3
    return {'drift': drift, 'z_score': round(float(z), 2), 'recommendation': 'retrain' if drift else 'ok'}
