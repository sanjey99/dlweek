import csv, random
from pathlib import Path

out = Path(__file__).resolve().parent / 'synthetic_fin_events.csv'
rows = []
for i in range(2000):
    f = [round(random.uniform(-1.2,1.5),4) for _ in range(8)]
    risk = 1 if (0.8*f[0] + 0.6*f[1] - 0.4*f[2] + 0.7*f[5] + random.uniform(-0.8,0.8)) > 1.1 else 0
    rows.append([i, *f, risk])

with out.open('w', newline='') as fp:
    w = csv.writer(fp)
    w.writerow(['id','f1','f2','f3','f4','f5','f6','f7','f8','label'])
    w.writerows(rows)

print(f'generated {out} ({len(rows)} rows)')
