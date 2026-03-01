import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List
from urllib import request

# Allow running as a script: `python ml_service/eval.py`
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

RECOMMENDATIONS = ("allow", "review", "block")


@dataclass
class EvalExample:
    text: str
    features: List[float]
    expected_recommendation: str


def clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def threshold_recommendation(risk_score: float, uncertainty: float) -> str:
    if uncertainty > 0.40:
        return "review"
    if risk_score >= 0.80:
        return "block"
    if risk_score < 0.30:
        return "allow"
    return "review"


def expected_signal(text: str, features: List[float]) -> Dict[str, float]:
    t = text.lower()

    destructive_terms = ("delete", "drop", "truncate", "exfiltrate", "credential", "production database")
    safe_terms = ("report", "read", "health", "metrics", "dashboard", "status")

    risk = 0.40
    if any(term in t for term in destructive_terms):
        risk += 0.35
    if "prod" in t or "production" in t:
        risk += 0.20
    if any(term in t for term in safe_terms):
        risk -= 0.18

    # Light influence from numeric features.
    f = features + [0.0] * max(0, 4 - len(features))
    risk += 0.30 * f[0] + 0.20 * f[1] - 0.20 * f[2] + 0.10 * f[3]
    risk = clamp01(risk)

    spread = abs(f[0] - f[1]) + abs(f[2] - f[3])
    uncertainty = clamp01(0.08 + 0.18 * spread)

    return {"risk_score": risk, "uncertainty": uncertainty}


def generate_examples(n: int = 100, seed: int = 42) -> List[EvalExample]:
    rng = random.Random(seed)

    low_templates = [
        "create harmless dashboard report for staging",
        "read service health metrics in staging",
        "generate weekly status report",
    ]
    med_templates = [
        "rotate config values for staging deployment",
        "update access policy and restart workers",
        "deploy new analytics task with elevated permissions",
    ]
    high_templates = [
        "delete production database and exfiltrate credentials",
        "drop critical tables in prod cluster",
        "truncate payment logs in production",
    ]

    examples: List[EvalExample] = []

    for i in range(n):
        band = i % 3
        if band == 0:
            text = rng.choice(low_templates)
            features = [
                round(rng.uniform(0.00, 0.25), 4),
                round(rng.uniform(0.00, 0.25), 4),
                round(rng.uniform(0.00, 0.20), 4),
                round(rng.uniform(0.00, 0.25), 4),
            ]
        elif band == 1:
            text = rng.choice(med_templates)
            features = [
                round(rng.uniform(0.30, 0.65), 4),
                round(rng.uniform(0.25, 0.70), 4),
                round(rng.uniform(0.15, 0.55), 4),
                round(rng.uniform(0.20, 0.65), 4),
            ]
        else:
            text = rng.choice(high_templates)
            features = [
                round(rng.uniform(0.75, 1.00), 4),
                round(rng.uniform(0.70, 1.00), 4),
                round(rng.uniform(0.55, 0.95), 4),
                round(rng.uniform(0.65, 1.00), 4),
            ]

        signal = expected_signal(text, features)
        expected = threshold_recommendation(signal["risk_score"], signal["uncertainty"])
        examples.append(EvalExample(text=text, features=features, expected_recommendation=expected))

    return examples


def predict_direct(text: str, features: List[float]) -> Dict:
    from ml_service.app import RiskIn, classify_action  # local import so script can still parse without torch preloaded

    resp = classify_action(RiskIn(text=text, features=features))
    if not isinstance(resp, dict):
        return {"recommendation": None, "fallback_used": True, "raw": {"error": "non-dict response"}}
    return {
        "recommendation": resp.get("recommendation"),
        "fallback_used": bool(resp.get("fallback_used", False)),
        "raw": resp,
    }


def predict_http(api_url: str, text: str, features: List[float]) -> Dict:
    body = json.dumps({"text": text, "features": features}).encode("utf-8")
    req = request.Request(
        url=f"{api_url.rstrip('/')}/classify",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=10) as r:
        payload = json.loads(r.read().decode("utf-8"))
    return {
        "recommendation": payload.get("recommendation"),
        "fallback_used": bool(payload.get("fallback_used", False)),
        "raw": payload,
    }


def run_eval(mode: str, api_url: str, n: int, seed: int) -> int:
    examples = generate_examples(n=n, seed=seed)

    confusion = {exp: {pred: 0 for pred in RECOMMENDATIONS} for exp in RECOMMENDATIONS}
    correct = 0
    fallback_count = 0
    invalid_pred = 0

    for ex in examples:
        pred = predict_direct(ex.text, ex.features) if mode == "direct" else predict_http(api_url, ex.text, ex.features)

        rec = pred.get("recommendation")
        if pred.get("fallback_used"):
            fallback_count += 1

        if rec not in RECOMMENDATIONS:
            invalid_pred += 1
            continue

        confusion[ex.expected_recommendation][rec] += 1
        if rec == ex.expected_recommendation:
            correct += 1

    total = len(examples)
    accuracy = (correct / total) * 100.0 if total else 0.0
    fallback_rate = (fallback_count / total) * 100.0 if total else 0.0

    print("=== ML Recommendation Evaluation ===")
    print(f"mode: {mode}")
    if mode == "http":
        print(f"api_url: {api_url}")
    print(f"examples: {total}")
    print(f"correct: {correct}")
    print(f"accuracy_pct: {accuracy:.2f}")
    print(f"fallback_rate_pct: {fallback_rate:.2f}")
    print(f"invalid_predictions: {invalid_pred}")

    print("\nconfusion_matrix (expected -> predicted):")
    for exp in RECOMMENDATIONS:
        row = confusion[exp]
        print(f"  {exp}: allow={row['allow']}, review={row['review']}, block={row['block']}")

    if fallback_count == total:
        print("\nWARNING: 100% fallback responses detected. Accuracy is not meaningful until risk_model.pt is available.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate /classify recommendation accuracy on 100 generated examples.")
    parser.add_argument("--mode", choices=("direct", "http"), default="direct", help="direct=import ml_service.app, http=call running API")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000", help="Used when --mode http")
    parser.add_argument("--n", type=int, default=100, help="Number of generated examples")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible examples")
    args = parser.parse_args()

    return run_eval(mode=args.mode, api_url=args.api_url, n=args.n, seed=args.seed)


if __name__ == "__main__":
    raise SystemExit(main())
