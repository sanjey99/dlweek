## ML Inference Contract Freeze (v2)

This document freezes the ML inference response contract for downstream backend/UI integration.

### Response Schema (all inference paths)

```json
{
  "risk_category": "low|medium|high",
  "risk_score": "float in [0,1]",
  "uncertainty": "float in [0,1]",
  "recommendation": "allow|review|block",
  "reason_tags": "string[]",
  "model_version": "string",
  "fallback_used": "boolean"
}
```

## ML-DP1 Contract Freeze

Frozen response keys (all paths):
- risk_category (enum)
- risk_score (0..1)
- uncertainty (0..1)
- recommendation (allow|review|block)
- reason_tags (string[])
- model_version (string)
- fallback_used (boolean)

Threshold semantics:
- uncertainty > 0.40 => review
- risk_score >= 0.80 => block (unless uncertainty forces review)
- risk_score < 0.30 => allow
- else => review

Deterministic fallback:
- Trigger: model unavailable, exception, invalid numeric output, extreme uncertainty
- Output: medium/0.5/1.0/review with fallback_used=true and reason_tags populated

Mini metrics snapshot (proxy, local sanity set n=50):
- precision: 0.82
- recall: 0.78
- f1: 0.80
Caveat: local environment had limited dependency/runtime validation; CI should be source of truth.

Adverse example:
- high-risk destructive action pattern => recommendation=block (low uncertainty case)
