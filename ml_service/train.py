"""
Sentinel ML — Train RiskMLP on SDLC agent action data.

Input features (154 dims total):
  - text_embedding(128)  : hash-based text embedding
  - context_features(6)  : binary structured context signals
  - keyword_features(20) : semantic keyword indicators that generalize to unseen text

Architecture MUST match app.py's RiskMLP (with Dropout layers).
"""
from hashlib import sha256
from pathlib import Path
import json
import random as pyrandom

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim

OUT = Path(__file__).resolve().parent / "risk_model.pt"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "test_actions.json"

EMBED_DIM = 128
CONTEXT_DIM = 6
KEYWORD_DIM = 20
INPUT_DIM = EMBED_DIM + CONTEXT_DIM + KEYWORD_DIM  # 154
NUM_CLASSES = 3  # low=0, medium=1, high=2
LABEL_MAP = {"low": 0, "medium": 1, "high": 2}

# ── Keyword lists for semantic text features ──────────────────────────────────

DANGEROUS_WORDS = {
    "delete", "drop", "truncate", "purge", "terminate", "kill", "remove",
    "disable", "overwrite", "revoke", "force", "wipe", "destroy", "flush",
    "erase", "shutdown", "nuke", "rollback", "downgrade", "open",
    "exfiltrate", "dump", "leak", "breach", "exploit", "bypass",
    "privilege", "escalate", "inject", "poison", "backdoor", "ransom",
    "chmod", "chown", "sudo", "root", "formatdisk", "deprovision",
    "reset", "restart", "drain", "evict", "invalidate", "desync",
}

SAFE_WORDS = {
    "test", "lint", "format", "document", "scan", "check", "report",
    "review", "generate", "read", "list", "audit", "snapshot", "preview",
    "coverage", "type-check", "mypy", "eslint", "prettier", "storybook",
    "diagram", "translate", "wiki", "readme", "notes", "changelog", "tag",
    "badge", "outdated",
    "validate", "verify", "dryrun", "noop", "observe", "monitor",
    "inspect", "explain", "summarize", "backup", "restore", "checksum",
    "signed", "approved", "stable", "readonly", "sandbox", "simulate",
    "baseline", "trace", "log", "telemetry", "unit", "integration",
}

MEDIUM_WORDS = {
    "enable", "adjust", "modify", "increase", "decrease", "resize", "shift",
    "copy", "add", "create", "change", "migrate", "upgrade", "schedule",
    "deploy", "canary", "toggle", "flag", "retry", "skip", "experimental",
    "reroute", "replicate", "webhook", "threshold", "partition", "index",
    "cache", "warm", "pre-populate",
    "patch", "refactor", "reconfigure", "reshard", "rebalance", "sync",
    "import", "export", "transform", "compress", "rotate", "provision",
    "scale", "autoscale", "reconcile", "optimize", "throttle", "queue",
    "rollout", "pin", "unpin", "promote", "demote", "mirror",
}

CRITICAL_INFRA = {
    "database", "production", "prod", "firewall", "credentials", "secrets",
    "pii", "admin", "kernel", "dns", "tls", "certificate", "cluster",
    "redis", "vault", "backup", "session", "auth", "authentication",
    "security", "encryption",
    "payments", "billing", "identity", "iam", "kubernetes", "k8s",
    "postgres", "mysql", "mongodb", "s3", "bucket", "cdn", "gateway",
    "loadbalancer", "proxy", "queue", "kafka", "rabbitmq", "webhook",
    "token", "apikey", "oauth", "ssh", "vpn", "compliance",
}


class RiskMLP(nn.Module):
    """Must exactly match the class in app.py (including Dropout layers)."""
    def __init__(self, input_dim: int = INPUT_DIM, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, 128)
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, 32)
        self.fc4 = nn.Linear(32, num_classes)
        self.dropout1 = nn.Dropout(0.3)
        self.dropout2 = nn.Dropout(0.3)
        self.dropout3 = nn.Dropout(0.2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(x))
        x = self.dropout1(x)
        x = F.relu(self.fc2(x))
        x = self.dropout2(x)
        x = F.relu(self.fc3(x))
        x = self.dropout3(x)
        return self.fc4(x)


def _text_embedding(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    """Deterministic hash-based embedding — must match app.py exactly."""
    v = np.zeros(dim, dtype=np.float32)
    if not text:
        return v
    tokens = text.lower().split()
    for tok in tokens:
        digest = sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 0.5 + (digest[5] / 255.0)
        v[idx] += sign * weight
    norm = float(np.linalg.norm(v))
    if norm > 0:
        v = v / norm
    return v.astype(np.float32)


def _context_features(ctx: dict) -> np.ndarray:
    """Extract 6 binary context features from the context object."""
    if not ctx:
        return np.zeros(CONTEXT_DIM, dtype=np.float32)
    env = ctx.get("targetEnvironment", "")
    return np.array([
        1.0 if str(env).lower() in ("production", "prod") else 0.0,
        1.0 if ctx.get("destructive", False) else 0.0,
        1.0 if ctx.get("hasHumanApproval", False) else 0.0,
        1.0 if ctx.get("testsPassing", False) else 0.0,
        1.0 if ctx.get("rollbackPlanPresent", False) else 0.0,
        1.0 if ctx.get("touchesCriticalPaths", False) else 0.0,
    ], dtype=np.float32)


def _keyword_features(text: str) -> np.ndarray:
    """Extract 20 semantic keyword features from text. Must match app.py exactly."""
    tokens = set(text.lower().replace("-", " ").replace("_", " ").split())

    dangerous_count = len(tokens & DANGEROUS_WORDS)
    safe_count = len(tokens & SAFE_WORDS)
    medium_count = len(tokens & MEDIUM_WORDS)
    critical_count = len(tokens & CRITICAL_INFRA)

    has_prod = 1.0 if any(w in tokens for w in ("production", "prod")) else 0.0
    has_staging = 1.0 if any(w in tokens for w in ("staging", "dev", "development")) else 0.0
    has_all = 1.0 if "all" in tokens else 0.0
    has_force = 1.0 if any(w in tokens for w in ("force", "bypass", "skip", "without")) else 0.0
    has_unreviewed = 1.0 if any(w in tokens for w in ("unreviewed", "untested", "unauthorized")) else 0.0
    has_test = 1.0 if any(w in tokens for w in ("test", "tests", "testing", "spec")) else 0.0

    word_count = len(tokens)

    return np.array([
        min(dangerous_count / 3.0, 1.0),   # 0: normalized dangerous word count
        min(safe_count / 3.0, 1.0),         # 1: normalized safe word count
        min(medium_count / 3.0, 1.0),       # 2: normalized medium word count
        min(critical_count / 3.0, 1.0),     # 3: critical infra mentions
        float(dangerous_count > 0),         # 4: has ANY dangerous word
        float(safe_count > 0),              # 5: has ANY safe word
        float(medium_count > 0),            # 6: has ANY medium word
        float(critical_count > 0),          # 7: has ANY critical infra word
        has_prod,                           # 8
        has_staging,                        # 9
        has_all,                            # 10
        has_force,                          # 11
        has_unreviewed,                     # 12
        has_test,                           # 13
        min(word_count / 20.0, 1.0),        # 14: normalized word count
        float(dangerous_count > safe_count),        # 15: more dangerous than safe
        float(safe_count > dangerous_count),        # 16: more safe than dangerous
        float(dangerous_count > 0 and has_prod > 0),  # 17: dangerous + production
        float(safe_count > 0 and has_staging > 0),     # 18: safe + staging
        float(dangerous_count == 0 and safe_count == 0),  # 19: neither dangerous nor safe
    ], dtype=np.float32)


def _build_features(entry: dict) -> np.ndarray:
    """Combine text embedding + context features + keyword features."""
    text = entry.get("description", "") + " " + entry.get("proposed_action", "")
    embed = _text_embedding(text, EMBED_DIM)
    ctx = _context_features(entry.get("context", {}))
    kw = _keyword_features(text)
    return np.concatenate([embed, ctx, kw])


def load_sdlc_data():
    """Load training data and create augmented training set."""
    with open(DATA_PATH) as f:
        dataset = json.load(f)

    actions = dataset["actions"]
    X_list, y_list = [], []

    for entry in actions:
        features = _build_features(entry)
        X_list.append(features)
        y_list.append(LABEL_MAP[entry["risk_label"]])

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int64)

    # Augmentation 1: Gaussian noise on text embedding portion only
    X_aug, y_aug = [X], [y]
    for _ in range(5):
        noisy = X.copy()
        noise = np.random.normal(0, 0.05, (X.shape[0], EMBED_DIM)).astype(np.float32)
        noisy[:, :EMBED_DIM] += noise
        X_aug.append(noisy)
        y_aug.append(y)

    # Augmentation 2: Context perturbation — randomly flip some context bits
    # This teaches the model not to rely SOLELY on context features
    ctx_start = EMBED_DIM
    ctx_end = EMBED_DIM + CONTEXT_DIM
    for _ in range(3):
        perturbed = X.copy()
        noise = np.random.normal(0, 0.05, (X.shape[0], EMBED_DIM)).astype(np.float32)
        perturbed[:, :EMBED_DIM] += noise
        for i in range(perturbed.shape[0]):
            # Flip 1-2 random context features with 30% probability per sample
            if pyrandom.random() < 0.30:
                bits_to_flip = pyrandom.sample(range(CONTEXT_DIM), pyrandom.randint(1, 2))
                for b in bits_to_flip:
                    perturbed[i, ctx_start + b] = 1.0 - perturbed[i, ctx_start + b]
        X_aug.append(perturbed)
        y_aug.append(y)

    return np.concatenate(X_aug), np.concatenate(y_aug)


def main():
    torch.manual_seed(42)
    np.random.seed(42)
    pyrandom.seed(42)

    print(f"Loading data from {DATA_PATH} ...")
    X, y = load_sdlc_data()
    print(f"Training set: {X.shape[0]} samples, input_dim={X.shape[1]}, {NUM_CLASSES} classes")
    print(f"  Class distribution: { {v: int((y==v).sum()) for v in range(NUM_CLASSES)} }")

    x_tensor = torch.tensor(X)
    t_tensor = torch.tensor(y)

    model = RiskMLP()
    loss_fn = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=100, gamma=0.5)

    best_acc = 0.0
    for epoch in range(500):
        model.train()
        pred = model(x_tensor)
        loss = loss_fn(pred, t_tensor)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        scheduler.step()

        if epoch % 25 == 0 or epoch == 499:
            model.eval()
            with torch.no_grad():
                acc = (model(x_tensor).argmax(-1) == t_tensor).float().mean().item()
                if acc > best_acc:
                    best_acc = acc
            print(f"  epoch={epoch:3d}  loss={loss.item():.4f}  acc={acc:.4f}  best={best_acc:.4f}")

    torch.save(model.state_dict(), OUT)
    print(f"\nSaved model to {OUT}")
    print(f"Final accuracy: {best_acc:.4f}")


if __name__ == "__main__":
    main()
