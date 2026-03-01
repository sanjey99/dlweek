## QA Validation Addendum (Release Gate v2)

### Contract fields validated
- `decision`
- `confidence`
- `timestamp`
- `review_required`
- `stale` / freshness-age

### Edge cases
- threshold boundary value
- stale timestamp
- missing field / wrong type
- out-of-order event timestamp

### Notes
- Record exact payloads used for INT-02, INT-04, INT-06, INT-07.
- Link evidence directories for reproducibility.