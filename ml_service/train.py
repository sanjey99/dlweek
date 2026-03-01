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
        self.dropout1 = nn.Dropout(0.2)
        self.dropout2 = nn.Dropout(0.2)

    def forward(self, x: torch.Tensor, mc_dropout: bool = False) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        if mc_dropout:
            x = self.dropout1(x)
        x = F.relu(self.fc2(x))
        if mc_dropout:
            x = self.dropout2(x)
        return self.fc3(x)


def make_sdlc_data(n: int = 3000):
    # Synthetic proxy dataset:
    # - 128-dim vectors
    # - first 4 dims carry most of the signal
    # - remaining dims are mostly noise
    X = np.random.normal(0, 0.08, (n, EMBED_DIM)).astype(np.float32)

    f0 = np.random.uniform(0.0, 1.0, n).astype(np.float32)
    f1 = np.random.uniform(0.0, 1.0, n).astype(np.float32)
    f2 = np.random.uniform(0.0, 1.0, n).astype(np.float32)
    f3 = np.random.uniform(0.0, 1.0, n).astype(np.float32)

    X[:, 0] = f0
    X[:, 1] = f1
    X[:, 2] = f2
    X[:, 3] = f3

    latent = 1.2 * f0 + 1.0 * f1 - 0.8 * f2 + 0.4 * f3 + np.random.normal(0, 0.12, n)
    risk = 1 / (1 + np.exp(-2.8 * (latent - 0.9)))

    y = np.zeros(n, dtype=np.int64)
    y[risk >= 0.70] = 2
    y[(risk >= 0.35) & (risk < 0.70)] = 1
    y[risk < 0.35] = 0
    return X, y


def split_indices(n: int, train_ratio: float = 0.70, val_ratio: float = 0.15, seed: int = 42):
    rng = np.random.default_rng(seed)
    idx = np.arange(n)
    rng.shuffle(idx)

    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)
    n_test = n - n_train - n_val

    train_idx = idx[:n_train]
    val_idx = idx[n_train:n_train + n_val]
    test_idx = idx[n_train + n_val:]
    assert len(test_idx) == n_test
    return train_idx, val_idx, test_idx


def evaluate(model: nn.Module, x: torch.Tensor, y: torch.Tensor, loss_fn: nn.Module):
    model.eval()
    with torch.no_grad():
        logits = model(x)
        loss = loss_fn(logits, y).item()
        acc = (logits.argmax(-1) == y).float().mean().item()
    return loss, acc


def class_counts(y: np.ndarray):
    return {
        "low": int((y == 0).sum()),
        "medium": int((y == 1).sum()),
        "high": int((y == 2).sum()),
    }


def main():
    torch.manual_seed(42)
    np.random.seed(42)

    X, y = make_sdlc_data()
    train_idx, val_idx, test_idx = split_indices(len(X), train_ratio=0.70, val_ratio=0.15, seed=42)

    x_train = torch.tensor(X[train_idx], dtype=torch.float32)
    y_train = torch.tensor(y[train_idx], dtype=torch.long)
    x_val = torch.tensor(X[val_idx], dtype=torch.float32)
    y_val = torch.tensor(y[val_idx], dtype=torch.long)
    x_test = torch.tensor(X[test_idx], dtype=torch.float32)
    y_test = torch.tensor(y[test_idx], dtype=torch.long)

    m = RiskMLP()
    loss_fn = nn.CrossEntropyLoss()
    opt = optim.Adam(m.parameters(), lr=0.001)
    best_val_acc = -1.0
    best_state = None
    epochs = 160

    print("=== Training Setup ===")
    print(f"Total samples: {len(X)}")
    print(f"Train/Val/Test: {len(train_idx)}/{len(val_idx)}/{len(test_idx)}")
    print(f"Train class counts: {class_counts(y[train_idx])}")
    print(f"Val class counts:   {class_counts(y[val_idx])}")
    print(f"Test class counts:  {class_counts(y[test_idx])}")

    for ep in range(epochs):
        m.train()
        pred = m(x_train)
        loss = loss_fn(pred, y_train)
        opt.zero_grad()
        loss.backward()
        opt.step()

        train_loss, train_acc = evaluate(m, x_train, y_train, loss_fn)
        val_loss, val_acc = evaluate(m, x_val, y_val, loss_fn)

        # Track best checkpoint by validation accuracy.
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.clone() for k, v in m.state_dict().items()}

        if ep % 20 == 0 or ep == epochs - 1:
            print(
                f"ep={ep:03d} "
                f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
                f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
            )

    if best_state is not None:
        m.load_state_dict(best_state)

    test_loss, test_acc = evaluate(m, x_test, y_test, loss_fn)
    print("\n=== Final Metrics (best by val_acc) ===")
    print(f"best_val_acc={best_val_acc:.4f}")
    print(f"test_loss={test_loss:.4f} test_acc={test_acc:.4f}")

    torch.save(m.state_dict(), OUT)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
