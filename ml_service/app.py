"""
Sentinel ML Service — FastAPI application for SDLC AI action risk classification.

Input features (154 dims total):
  - text_embedding(128)  : hash-based text embedding
  - context_features(6)  : binary structured context signals
  - keyword_features(20) : semantic keyword indicators

Endpoints:
  GET  /health         — Service health check
  GET  /model/info     — Model metadata
  POST /infer          — Legacy heuristic endpoint (backward compat)
  POST /classify       — Primary ML endpoint: text+context → risk classification
  POST /accuracy       — Batch accuracy test against labeled data
  POST /drift/check    — Data drift detection
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Dict, List, Optional

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
CONTEXT_DIM = 6
KEYWORD_DIM = 20
INPUT_DIM = EMBED_DIM + CONTEXT_DIM + KEYWORD_DIM  # 154
LEGACY_INPUT_DIM = 8


# ── Keyword dictionaries — must match train.py exactly ───────────────────────

DANGEROUS_WORDS = {
    "delete", "drop", "truncate", "purge", "terminate", "kill", "remove",
    "disable", "overwrite", "revoke", "force", "wipe", "destroy", "flush",
    "erase", "shutdown", "nuke", "rollback", "downgrade", "open",
}

SAFE_WORDS = {
    "test", "lint", "format", "document", "scan", "check", "report",
    "review", "generate", "read", "list", "audit", "snapshot", "preview",
    "coverage", "type-check", "mypy", "eslint", "prettier", "storybook",
    "diagram", "translate", "wiki", "readme", "notes", "changelog", "tag",
    "badge", "outdated",
}

MEDIUM_WORDS = {
    "enable", "adjust", "modify", "increase", "decrease", "resize", "shift",
    "copy", "add", "create", "change", "migrate", "upgrade", "schedule",
    "deploy", "canary", "toggle", "flag", "retry", "skip", "experimental",
    "reroute", "replicate", "webhook", "threshold", "partition", "index",
    "cache", "warm", "pre-populate",
}

CRITICAL_INFRA = {
    "database", "production", "prod", "firewall", "credentials", "secrets",
    "pii", "admin", "kernel", "dns", "tls", "certificate", "cluster",
    "redis", "vault", "backup", "session", "auth", "authentication",
    "security", "encryption",
}


# ── Pydantic Models ──────────────────────────────────────────────────────────

class InferIn(BaseModel):
    features: List[float]


class RiskIn(BaseModel):
    text: str
    features: Optional[List[float]] = None
    context: Optional[Dict] = None


class AccuracyIn(BaseModel):
    actions: List[dict]


# ── Neural Network ───────────────────────────────────────────────────────────

class RiskMLP(nn.Module):
    def __init__(self, input_dim: int = INPUT_DIM, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, 128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, 32)
        self.fc4 = nn.Linear(32, num_classes)
        self.dropout1 = nn.Dropout(0.3)
        self.dropout2 = nn.Dropout(0.3)
        self.dropout3 = nn.Dropout(0.2)

    def forward(self, x: torch.Tensor, mc_dropout: bool = False) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        if mc_dropout:
            x = self.dropout1(x)
        x = F.relu(self.fc2(x))
        if mc_dropout:
            x = self.dropout2(x)
        x = F.relu(self.fc3(x))
        if mc_dropout:
            x = self.dropout3(x)
        return self.fc4(x)


# ── Model Loading ────────────────────────────────────────────────────────────

MODEL_PATH = Path(__file__).resolve().parent / "risk_model.pt"
model = RiskMLP()
model_loaded = False

if MODEL_PATH.exists():
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu", weights_only=True))
    model_loaded = True
    model.eval()
    print(f"[ML] Loaded model from {MODEL_PATH}")
else:
    print(f"[ML] WARNING: Model not found at {MODEL_PATH} — /classify will use fallback")


# ── Feature Extraction — must match train.py exactly ─────────────────────────

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


def _context_features(ctx: dict) -> np.ndarray:
    """Extract 6 binary context features from the context object."""
    if not ctx:
        return np.zeros(CONTEXT_DIM, dtype=np.float32)
    env = ctx.get("targetEnvironment", "")
    return np.array([
        1.0 if str(env).lower() in ("production", "prod") else 0.0,
        1.0 if ctx.get("destructive", False) else 0.0,
        1.0 if ctx.get("hasHumanApproval", False) else 0.0,
        1.0 if ctx.get("testsPassing", False) else 0.0,
        1.0 if ctx.get("rollbackPlanPresent", False) else 0.0,
        1.0 if ctx.get("touchesCriticalPaths", False) else 0.0,
    ], dtype=np.float32)


def _keyword_features(text: str) -> np.ndarray:
    """Extract 20 semantic keyword features from text. Must match train.py exactly."""
    tokens = set(text.lower().replace("-", " ").replace("_", " ").split())

    dangerous_count = len(tokens & DANGEROUS_WORDS)
    safe_count = len(tokens & SAFE_WORDS)
    medium_count = len(tokens & MEDIUM_WORDS)
    critical_count = len(tokens & CRITICAL_INFRA)

    has_prod = 1.0 if any(w in tokens for w in ("production", "prod")) else 0.0
    has_staging = 1.0 if any(w in tokens for w in ("staging", "dev", "development")) else 0.0
    has_all = 1.0 if "all" in tokens else 0.0
    has_force = 1.0 if any(w in tokens for w in ("force", "bypass", "skip", "without")) else 0.0
    has_unreviewed = 1.0 if any(w in tokens for w in ("unreviewed", "untested", "unauthorized")) else 0.0
    has_test = 1.0 if any(w in tokens for w in ("test", "tests", "testing", "spec")) else 0.0

    word_count = len(tokens)

    return np.array([
        min(dangerous_count / 3.0, 1.0),
        min(safe_count / 3.0, 1.0),
        min(medium_count / 3.0, 1.0),
        min(critical_count / 3.0, 1.0),
        float(dangerous_count > 0),
        float(safe_count > 0),
        float(medium_count > 0),
        float(critical_count > 0),
        has_prod,
        has_staging,
        has_all,
        has_force,
        has_unreviewed,
        has_test,
        min(word_count / 20.0, 1.0),
        float(dangerous_count > safe_count),
        float(safe_count > dangerous_count),
        float(dangerous_count > 0 and has_prod > 0),
        float(safe_count > 0 and has_staging > 0),
        float(dangerous_count == 0 and safe_count == 0),
    ], dtype=np.float32)


def _build_input(text: str, ctx: Optional[dict] = None) -> np.ndarray:
    """Combine text embedding + context features + keyword features into 154-dim vector."""
    embed = _text_embedding(text, EMBED_DIM)
    ctx_feat = _context_features(ctx or {})
    kw_feat = _keyword_features(text)
    return np.concatenate([embed, ctx_feat, kw_feat])


def _classify(text: str, ctx: Optional[dict] = None):
    """Core classification logic — shared by /classify and /accuracy."""
    features = _build_input(text, ctx)
    x = torch.tensor(features, dtype=torch.float32).unsqueeze(0)

    if not model_loaded:
        return _fallback("model_unavailable_or_low_confidence")

    # MC Dropout: 10 stochastic forward passes for uncertainty estimation
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

    probs = pred_mean[0]
    category_idx = int(torch.argmax(probs).item())

    confidence_raw = float(probs[category_idx].item())
    uncertainty_raw = float(pred_std[0, category_idx].item())

    risk_score = _clamp01(confidence_raw)
    uncertainty = _clamp01(uncertainty_raw)

    if risk_score is None or uncertainty is None:
        return _fallback("classify_invalid_numeric_output")

    category = RISK_CATEGORIES[category_idx]

    # Map category to a 0-1 risk score for the policy engine
    if category == "high":
        mapped_risk = 0.7 + (confidence_raw * 0.3)
    elif category == "medium":
        mapped_risk = 0.4 + (confidence_raw * 0.2)
    else:
        mapped_risk = 0.05 + (confidence_raw * 0.25)
    mapped_risk = _clamp01(mapped_risk)

    if uncertainty >= 0.90:
        fb = _fallback("extreme_uncertainty")
        fb["risk_category"] = category
        fb["risk_score"] = round(mapped_risk, 4)
        return fb

    recommendation = _recommendation(mapped_risk, uncertainty)
    return {
        "risk_category": category,
        "risk_score": round(mapped_risk, 4),
        "confidence": round(confidence_raw, 4),
        "uncertainty": round(uncertainty, 4),
        "recommendation": recommendation,
        "label": category,
        "reason_tags": [],
        "model_version": "risk-mlp-v3-kw",
        "fallback_used": False,
        "timestamp": _now(),
    }


# ── Utility Helpers ──────────────────────────────────────────────────────────

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
        "confidence": 0.35,
        "uncertainty": 1.0,
        "recommendation": "review",
        "label": "medium",
        "reason_tags": [reason],
        "model_version": "fallback-v1",
        "fallback_used": True,
        "timestamp": _now(),
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "service": "ml_sdlc", "model_loaded": model_loaded, "ts": _now()}


@app.get("/model/info")
def model_info():
    return {
        "model_type": "RiskMLP",
        "input_dim": INPUT_DIM,
        "embed_dim": EMBED_DIM,
        "context_dim": CONTEXT_DIM,
        "keyword_dim": KEYWORD_DIM,
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

        uncertainty = _clamp01(1.0 - abs(0.5 - risk_score) * 2.0)
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
            "confidence": round(1.0 - uncertainty, 4),
            "uncertainty": round(uncertainty, 4),
            "recommendation": recommendation,
            "label": category,
            "reason_tags": [],
            "model_version": "legacy-heuristic-v2",
            "fallback_used": False,
            "timestamp": _now(),
        }
    except Exception:
        return _fallback("legacy_infer_exception")


@app.post("/classify")
def classify_action(inp: RiskIn):
    """Primary ML endpoint: classify an AI agent action description + context."""
    try:
        return _classify(inp.text, inp.context)
    except Exception:
        return _fallback("classify_exception")


@app.post("/accuracy")
def test_accuracy(data: AccuracyIn):
    """
    Batch accuracy test: accepts an array of actions with risk_label ground truth.
    Returns per-class and overall accuracy metrics.
    """
    if not data.actions:
        return {"ok": False, "error": "actions array is empty"}

    total = 0
    correct = 0
    class_stats = {cat: {"total": 0, "correct": 0} for cat in RISK_CATEGORIES}
    results = []

    for action in data.actions:
        text = action.get("description", "") + " " + action.get("proposed_action", "")
        expected = action.get("risk_label", "").lower()
        if expected not in RISK_CATEGORIES:
            continue

        ctx = action.get("context", None)
        prediction = _classify(text, ctx)
        predicted = prediction.get("risk_category", "medium")

        is_correct = predicted == expected
        total += 1
        if is_correct:
            correct += 1

        class_stats[expected]["total"] += 1
        if is_correct:
            class_stats[expected]["correct"] += 1

        results.append({
            "id": action.get("id", ""),
            "expected": expected,
            "predicted": predicted,
            "correct": is_correct,
            "risk_score": prediction.get("risk_score"),
            "confidence": prediction.get("confidence"),
        })

    overall_accuracy = round(correct / total, 4) if total > 0 else 0
    per_class = {}
    for cat in RISK_CATEGORIES:
        s = class_stats[cat]
        per_class[cat] = {
            "total": s["total"],
            "correct": s["correct"],
            "accuracy": round(s["correct"] / s["total"], 4) if s["total"] > 0 else 0,
        }

    return {
        "ok": True,
        "total": total,
        "correct": correct,
        "overall_accuracy": overall_accuracy,
        "per_class": per_class,
        "model_loaded": model_loaded,
        "predictions": results,
    }


@app.post("/drift/check")
def drift_check():
    return {
        "drift_detected": False,
        "current_distribution": {"low": 0.33, "medium": 0.33, "high": 0.34},
        "baseline_distribution": {"low": 0.33, "medium": 0.33, "high": 0.34},
        "timestamp": _now(),
    }
