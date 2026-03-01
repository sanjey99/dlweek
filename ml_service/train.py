from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim

OUT = Path(__file__).resolve().parent / "risk_model.pt"
EMBED_DIM = 128
NUM_CLASSES = 3  # low=0, medium=1, high=2


class RiskMLP(nn.Module):
    def __init__(self, embed_dim: int = EMBED_DIM, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.fc1 = nn.Linear(embed_dim, 64)
        self.fc2 = nn.Linear(64, 32)
        self.fc3 = nn.Linear(32, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        return self.fc3(x)


def make_sdlc_data(n: int = 3000):
    X = np.random.normal(0, 1, (n, EMBED_DIM)).astype(np.float32)
    linear = 0.8 * X[:, 0] + 0.6 * X[:, 1] - 0.4 * X[:, 2] + np.random.normal(0, 0.5, n)
    y = np.zeros(n, dtype=np.int64)
    y[linear > 1.5] = 2
    y[(linear > 0.5) & (linear <= 1.5)] = 1
    y[linear <= 0.5] = 0
    return X, y


def main():
    torch.manual_seed(42)
    np.random.seed(42)

    X, y = make_sdlc_data()
    x = torch.tensor(X)
    t = torch.tensor(y)

    m = RiskMLP()
    loss_fn = nn.CrossEntropyLoss()
    opt = optim.Adam(m.parameters(), lr=0.001)

    for ep in range(200):
        pred = m(x)
        loss = loss_fn(pred, t)
        opt.zero_grad()
        loss.backward()
        opt.step()
        if ep % 40 == 0:
            acc = (pred.argmax(-1) == t).float().mean().item()
            print(f"ep={ep} loss={loss.item():.4f} acc={acc:.4f}")

    torch.save(m.state_dict(), OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
