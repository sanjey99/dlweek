import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from pathlib import Path

OUT = Path(__file__).resolve().parent / "model.pt"

class TinyMLP(nn.Module):
    def __init__(self, dim=8):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, 16), nn.ReLU(),
            nn.Linear(16, 8), nn.ReLU(),
            nn.Linear(8, 1), nn.Sigmoid()
        )

    def forward(self, x):
        return self.net(x)


def make_data(n=3000, dim=8):
    X = np.random.normal(0, 1, (n, dim)).astype(np.float32)
    # synthetic anomaly rule
    y = ((0.8*X[:,0] + 0.6*X[:,1] - 0.4*X[:,2] + 0.7*X[:,5] + np.random.normal(0,0.8,n)) > 1.2).astype(np.float32)
    return X, y.reshape(-1,1)


def main():
    torch.manual_seed(42)
    X, y = make_data()
    x = torch.tensor(X)
    t = torch.tensor(y)

    m = TinyMLP(dim=8)
    loss_fn = nn.BCELoss()
    opt = optim.Adam(m.parameters(), lr=0.004)

    for ep in range(200):
        pred = m(x)
        loss = loss_fn(pred, t)
        opt.zero_grad(); loss.backward(); opt.step()
        if ep % 40 == 0:
            with torch.no_grad():
                acc = ((pred > 0.5).float() == t).float().mean().item()
            print(f"ep={ep} loss={loss.item():.4f} acc={acc:.4f}")

    torch.save(m.state_dict(), OUT)
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
