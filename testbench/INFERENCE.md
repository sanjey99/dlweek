# INFERENCE Contract Validation (ML-DP1)

Required keys:
- risk_category
- risk_score
- uncertainty
- recommendation
- reason_tags
- model_version
- fallback_used

Checks:
1) Keys present for success + fallback
2) risk_score, uncertainty in [0,1]
3) recommendation in {allow, review, block}
4) reason_tags is string[]
5) model unavailable -> deterministic fallback_used=true
6) high uncertainty path avoids auto-allow for medium/high risk
7) adverse high-risk sample returns block/review per thresholds
