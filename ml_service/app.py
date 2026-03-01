from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SDLC Sentinel ML Service")

RISK_CATEGORIES = ["low", "medium", "high"]
NUM_CLASSES = len(RISK_CATEGORIES)
THRESHOLDS = {"auto_approve": 0.3, "review": 0.7}
EMBED_DIM = 128
LEGACY_INPUT_DIM = 8


class InferIn(BaseModel):
    features: List[float]


class RiskIn(BaseModel):
    text: str
    features: Optional[List[float]] = None


class RiskMLP(nn.Module):
    def __init__(self, embed_dim: int = EMBED_DIM, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.fc1 = nn.Linear(embed_dim, 64)
        self.fc2 = nn.Linear(64, 32)
        self.fc3 = nn.Linear(32, num_classes)
        self.dropout1 = nn.Dropout(0.2)
        self.dropout2 = nn.Dropout(0.2)

    def forward(self, x: torch.Tensor, mc_dropout: bool = False) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        if mc_dropout:
            x = self.dropout1(x)
        x = F.relu(self.fc2(x))
        if mc_dropout:
            x = self.dropout2(x)
        return self.fc3(x)


MODEL_PATH = Path(__file__).resolve().parent / "risk_model.pt"
model = RiskMLP()
model_loaded = False
if MODEL_PATH.exists():
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
    model_loaded = True
model.eval()


def _legacy_pad(features: List[float], dim: int = LEGACY_INPUT_DIM) -> np.ndarray:
    arr = np.array(features[:dim], dtype=np.float32)
    if arr.shape[0] < dim:
        arr = np.pad(arr, (0, dim - arr.shape[0]))
    return arr


def _text_embedding(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    """Deterministic hash-based embedding for stable API behavior in demo mode."""
    v = np.zeros(dim, dtype=np.float32)
    if not text:
        return v

    tokens = text.lower().split()
    for tok in tokens:
        digest = sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 0.5 + (digest[5] / 255.0)
        v[idx] += sign * weight

    norm = float(np.linalg.norm(v))
    if norm > 0:
        v = v / norm
    return v.astype(np.float32)


def _build_embed(inp: RiskIn) -> np.ndarray:
    embed = _text_embedding(inp.text, EMBED_DIM)
    if inp.features:
        f = np.array(inp.features[:EMBED_DIM], dtype=np.float32)
        n = min(f.shape[0], EMBED_DIM)
        embed[:n] = f[:n]
    return embed


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health():
    return {"ok": True, "service": "ml_sdlc"}


@app.get("/model/info")
def model_info():
    return {
        "model_type": "RiskMLP",
        "input_dim": EMBED_DIM,
        "categories": RISK_CATEGORIES,
        "thresholds": THRESHOLDS,
        "model_loaded": model_loaded,
    }


@app.post("/infer")
def infer_legacy(inp: InferIn):
    """Backward-compatible legacy endpoint (numeric features only)."""
    arr = _legacy_pad(inp.features)
    # deterministic baseline score for migration compatibility
    score_raw = 0.8 * arr[0] + 0.6 * arr[1] - 0.4 * arr[2] + 0.7 * arr[5]
    score = 1 / (1 + np.exp(-score_raw))
    score = float(np.clip(score, 0.0, 1.0))

    label = "anomaly" if score >= 0.65 else "normal"
    confidence = round(float(max(score, 1.0 - score)), 4)

    return {
        "risk_score": round(score, 4),
        "label": label,
        "confidence": confidence,
        "timestamp": _now(),
    }


@app.post("/classify")
def classify_action(inp: RiskIn):
    x = torch.tensor(_build_embed(inp)).unsqueeze(0)

    if model_loaded:
        preds = []
        model.train()
        with torch.no_grad():
            for _ in range(10):
                logits = model(x, mc_dropout=True)
                preds.append(F.softmax(logits, dim=-1))
        model.eval()

        stacked = torch.stack(preds)
        pred_mean = stacked.mean(0)
        pred_std = stacked.std(0)
    else:
        # deterministic fallback if model is not yet trained/loaded
        base = x[0, :3]
        logits = torch.tensor([[float(-base[0]), float(base[1]), float(base[2])]])
        pred_mean = F.softmax(logits, dim=-1)
        pred_std = torch.zeros_like(pred_mean)

    probs = pred_mean[0]
    category_idx = int(torch.argmax(probs).item())
    risk_score = float(probs[category_idx].item())
    uncertainty = float(pred_std[0, category_idx].item())
    confidence = float(max(0.0, min(1.0, 1.0 - uncertainty)))
    category = RISK_CATEGORIES[category_idx]

    if risk_score < THRESHOLDS["auto_approve"] or uncertainty > 0.2:
        recommendation = "review"
    elif risk_score > THRESHOLDS["review"]:
        recommendation = "block"
    else:
        recommendation = "auto-approve"

    return {
        "risk_score": round(risk_score, 4),
        "risk_category": category,
        "confidence": round(confidence, 4),
        "uncertainty": round(uncertainty, 4),
        "recommendation": recommendation,
        "probs": {cat: round(float(p), 4) for cat, p in zip(RISK_CATEGORIES, probs.tolist())},
        "model_loaded": model_loaded,
        "timestamp": _now(),
    }


@app.post("/drift/check")
def check_drift(recent_scores: List[float]):
    if len(recent_scores) < 10:
        return {"drift": False, "signal": "insufficient data"}
    mean_recent = float(np.mean(recent_scores))
    historical_mean = 0.4
    std = 0.2
    z = (mean_recent - historical_mean) / std
    drift = abs(z) > 3
    return {
        "drift": drift,
        "z_score": round(float(z), 2),
        "recommendation": "retrain" if drift else "ok",
    }
