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

THRESHOLDS = {
    "allow_max": 0.30,
    "block_min": 0.80,
    "uncertainty_review_min": 0.40,
}

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
    """Deterministic hash-based embedding for stable API behavior."""
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


def _clamp01(x):
    try:
        v = float(x)
    except Exception:
        return None
    return max(0.0, min(1.0, v))


def _recommendation(risk_score: float, uncertainty: float) -> str:
    if uncertainty > THRESHOLDS["uncertainty_review_min"]:
        return "review"
    if risk_score >= THRESHOLDS["block_min"]:
        return "block"
    if risk_score < THRESHOLDS["allow_max"]:
        return "allow"
    return "review"


def _fallback(reason: str = "model_unavailable_or_low_confidence"):
    return {
        "risk_category": "medium",
        "risk_score": 0.5,
        "uncertainty": 1.0,
        "recommendation": "review",
        "reason_tags": [reason],
        "model_version": "fallback-v1",
        "fallback_used": True,
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "ml_sdlc", "ts": _now()}


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
    """Backward-compatible endpoint with frozen response contract."""
    try:
        arr = _legacy_pad(inp.features)
        score_raw = 0.8 * arr[0] + 0.6 * arr[1] - 0.4 * arr[2] + 0.7 * arr[5]
        risk_score = _clamp01(1 / (1 + np.exp(-score_raw)))
        if risk_score is None:
            return _fallback("legacy_invalid_numeric_output")

        uncertainty = _clamp01(abs(0.5 - risk_score) * 2.0)
        if uncertainty is None:
            return _fallback("legacy_invalid_uncertainty")

        if risk_score < 0.33:
            category = "low"
        elif risk_score < 0.66:
            category = "medium"
        else:
            category = "high"

        recommendation = _recommendation(risk_score, uncertainty)
        return {
            "risk_category": category,
            "risk_score": round(risk_score, 4),
            "uncertainty": round(uncertainty, 4),
            "recommendation": recommendation,
            "reason_tags": [],
            "model_version": "legacy-heuristic-v2",
            "fallback_used": False,
        }
    except Exception:
        return _fallback("legacy_infer_exception")


@app.post("/classify")
def classify_action(inp: RiskIn):
    try:
        x = torch.tensor(_build_embed(inp), dtype=torch.float32).unsqueeze(0)

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
            source_version = "risk-mlp-v2"
        else:
            return _fallback("model_unavailable_or_low_confidence")

        probs = pred_mean[0]
        category_idx = int(torch.argmax(probs).item())

        risk_score = _clamp01(probs[category_idx].item())
        uncertainty = _clamp01(pred_std[0, category_idx].item())
        if risk_score is None or uncertainty is None:
            return _fallback("classify_invalid_numeric_output")

        category = RISK_CATEGORIES[category_idx]

        if uncertainty >= 0.90:
            fb = _fallback("extreme_uncertainty")
            fb["risk_category"] = category
            fb["risk_score"] = round(risk_score, 4)
            return fb

        recommendation = _recommendation(risk_score, uncertainty)
        return {
            "risk_category": category,
            "risk_score": round(risk_score, 4),
            "uncertainty": round(uncertainty, 4),
            "recommendation": recommendation,
            "reason_tags": [],
            "model_version": source_version,
            "fallback_used": False,
        }
    except Exception:
        return _fallback("classify_exception")


@app.post("/drift/check")
def check_drift(recent_scores: List[float]):
    if len(recent_scores) < 10:
        return {"drift": False, "signal": "insufficient_data"}

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
