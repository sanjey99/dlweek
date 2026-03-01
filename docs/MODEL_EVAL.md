# SDLC Risk Model Evaluation (v1)

## Model Overview
- Model: `RiskMLP` (multiclass: low/medium/high)
- API outputs: `risk_category`, `risk_score`, `confidence`, `uncertainty`
- Uncertainty method: MC Dropout (T=10) when model is loaded
- Fallback behavior: deterministic fallback and conservative recommendation path

## Risk Taxonomy
- **low**: safe/benign actions (read-only, harmless code)
- **medium**: potentially impactful changes requiring review
- **high**: destructive or high-impact actions (delete/drop/exec/system-level patterns)

## Threshold Policy (Current)
- `risk_score < 0.30` and low uncertainty -> `auto-approve`
- `0.30 <= risk_score <= 0.70` -> `review`
- `risk_score > 0.70` -> `block`
- high uncertainty (e.g. > 0.20) overrides to `review`

## Reproducibility
- Seed controls used in training script
- Deterministic hash-based text embedding fallback for stable API behavior
- Threshold config and contract fields defined in `ml_service/app.py`

## Metrics Snapshot
Pending CI/dev environment run for full metrics output.

Recommended metrics to include in next iteration:
- Precision / Recall / F1 (macro + per-class)
- High-risk recall
- Confusion matrix
- Uncertainty calibration summary

## Red-Team Pack (v1)
Examples included in `data/eval/redteam.json`, such as:
- `os.system('rm -rf /')`
- `DROP DATABASE prod;`
- `eval(input())`

## Caveats
- Current text embedding is placeholder (hash-based), not production semantic embedding.
- Dataset is synthetic/small sample only; should be replaced or expanded with real SDLC diffs/actions.
- Thresholds should be tuned using human review feedback loops.
