import { useState, useRef } from 'react';
import { Upload, Play, FileJson, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Theme } from '../../types';
import { uploadActions } from '../../services/api';
import { COLORS } from '../../utils/theme';

interface UploadPanelProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
  uploadProgress: { processed: number; total: number } | null;
}

export function UploadPanel({ theme, isDark, isMobile, uploadProgress }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<{ actions: Record<string, unknown>[] } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'uploading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [delay, setDelay] = useState(2000);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStatus('loading');
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json.actions || !Array.isArray(json.actions)) {
          throw new Error('JSON must contain an "actions" array');
        }
        setFileData(json);
        setStatus('idle');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Invalid JSON');
        setStatus('error');
        setFileData(null);
      }
    };
    reader.readAsText(f);
  };

  const handleUpload = async () => {
    if (!fileData) return;
    setStatus('uploading');
    setErrorMsg('');
    try {
      await uploadActions(fileData.actions, delay);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  };

  const progressPct = uploadProgress
    ? Math.round((uploadProgress.processed / uploadProgress.total) * 100)
    : 0;

  const isUploading = status === 'uploading';

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: isMobile ? 14 : 18,
        marginTop: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Upload size={15} color={COLORS.blue} />
        <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>
          Upload Agent Actions
        </span>
      </div>

      {/* File picker */}
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceElevated,
            color: theme.textPrimary,
            fontSize: 12, fontWeight: 500, cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.5 : 1,
          }}
        >
          <FileJson size={13} />
          {file ? file.name : 'Select JSON file'}
        </button>

        {fileData && (
          <>
            <span style={{ color: theme.textSecondary, fontSize: 11 }}>
              {fileData.actions.length} actions
            </span>

            {/* Delay selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: theme.textTertiary, fontSize: 11 }}>Delay:</span>
              <select
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
                disabled={isUploading}
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 11,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceElevated,
                  color: theme.textPrimary,
                }}
              >
                <option value={500}>0.5s</option>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={3000}>3s</option>
                <option value={5000}>5s</option>
              </select>
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 6, border: 'none',
                background: isUploading ? COLORS.blue + '80' : COLORS.blue,
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              {isUploading ? <Loader2 size={13} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
              {isUploading ? 'Processing...' : 'Start Simulation'}
            </button>
          </>
        )}
      </div>

      {/* Progress bar */}
      {uploadProgress && isUploading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: theme.textSecondary, fontSize: 11 }}>
              Processing action {uploadProgress.processed} of {uploadProgress.total}
            </span>
            <span style={{ color: COLORS.blue, fontSize: 11, fontWeight: 600 }}>{progressPct}%</span>
          </div>
          <div
            style={{
              height: 4, borderRadius: 2,
              background: isDark ? '#1a1a2e' : '#e5e7eb',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%', borderRadius: 2,
                background: COLORS.blue,
                width: `${progressPct}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Status messages */}
      {status === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <CheckCircle2 size={13} color={COLORS.green} />
          <span style={{ color: COLORS.green, fontSize: 12 }}>
            All actions processed successfully
          </span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <AlertCircle size={13} color={COLORS.red} />
          <span style={{ color: COLORS.red, fontSize: 12 }}>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
