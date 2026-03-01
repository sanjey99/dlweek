# Role 3 — ML/Risk Engine Lead + Agent

## Mission
Deliver the deep-learning risk intelligence layer that powers governance decisions (risk score, category, uncertainty, anomaly/drift signals).

## Scope
- Risk classification model/inference endpoints
- Intent/destructive-action detection
- Uncertainty estimation
- Optional drift/anomaly detector for post-deploy signals

## Human Responsibilities
1. Define target labels and risk taxonomy.
2. Decide model strategy (fast fine-tune + feasible eval).
3. Approve thresholds for block/review/auto-approve.

## Agent Responsibilities
1. Build/extend ML service endpoints.
2. Implement inference payload schemas.
3. Add eval scripts and metrics output.
4. Provide model cards + caveats.

## Priority Work Packets
### ML-P1: Risk Classification API
- Endpoint: classify proposed action/diff into risk categories + score.

### ML-P2: Uncertainty + Gate Signals
- Add uncertainty/confidence output.
- Trigger recommendations: auto-approve/review/block.

### ML-P3: Drift/Anomaly (v1)
- Basic telemetry anomaly detection (error spikes/latency drift).

### ML-P4: Evaluation Bundle
- Precision/recall/F1 on mini eval set.
- Red-team pack for risky prompts/actions.

## Required Outputs
- `ml_service/app.py` updates
- `ml_service/train.py` updates (if needed)
- `docs/MODEL_EVAL.md`
- `data/eval/` sample set

## Acceptance Checklist
- [ ] Inference API returns risk category + score + uncertainty
- [ ] Threshold behavior reproducible and documented
- [ ] Eval report generated
- [ ] Clear fallback when model unavailable

## Hand-off Format
- Packet ID (ML-Px)
- Commit hash
- Metrics snapshot
- API examples
