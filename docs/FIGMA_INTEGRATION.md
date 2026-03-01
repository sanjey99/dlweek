# Figma API Integration (Design Sync)

## 1) Add token securely
Create file on VPS:

```bash
mkdir -p /root/.openclaw/secrets
cat > /root/.openclaw/secrets/figma.env << 'EOF'
FIGMA_TOKEN=your_figma_personal_access_token
EOF
chmod 600 /root/.openclaw/secrets/figma.env
```

## 2) Configure target file
Edit:
- `config/figma_targets.json`

Set either:
- `fileKey`, OR
- `fileUrl`

## 3) Run sync
```bash
python3 scripts/figma_sync.py
```

Outputs:
- `design/figma/file.json`
- `design/figma/styles.json`
- `design/figma/nodes_flat.json`
- `design/figma/design_tokens_raw.json`

## 4) Use outputs in frontend
- Map colors/text styles into React design tokens
- Mirror target frames/components
- Keep a parity checklist between Figma and app UI

## Notes
- Do not store tokens in Git.
- This script reads token from environment or `/root/.openclaw/secrets/figma.env`.
