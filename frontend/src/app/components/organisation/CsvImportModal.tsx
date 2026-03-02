/**
 * CSV Import Modal for Sentinel Organisation page.
 * Single unified CSV upload with row_type column: team | member | agent | audit.
 */

import { useState, useRef, useCallback } from 'react';
import {
  X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Download, ChevronRight,
} from 'lucide-react';
import { Theme } from '../../types';
import { COLORS } from '../../utils/theme';
import {
  parseCSV,
  validateOrgCsv,
  parseOrganisationCsv,
  assembleTeamsFromCsv,
  auditEventsToActionItems,
  getOrganisationCsvTemplate,
  OrgCsvParseResult,
  ParsedAuditEvent,
} from '../../utils/csvParser';
import type { TeamData } from '../../data/organisationData';
import type { ActionItem } from '../../types';

interface CsvImportModalProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (teams: TeamData[], auditActions: ActionItem[], auditEventsRaw: ParsedAuditEvent[]) => void;
}

type ImportStep = 'select' | 'preview' | 'done';

export function CsvImportModal({ theme, isDark, isMobile, isOpen, onClose, onImportComplete }: CsvImportModalProps) {
  const [step, setStep] = useState<ImportStep>('select');
  const [parseResult, setParseResult] = useState<OrgCsvParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep('select');
    setParseResult(null);
    setFileName('');
    setPreviewRows([]);
    setPreviewHeaders([]);
    setError('');
    setIsDragOver(false);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = (file: File) => {
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);

        if (rows.length === 0) {
          setError('CSV file is empty or has no data rows.');
          return;
        }

        const headers = Object.keys(rows[0]);

        // Validate the CSV has required columns
        const validation = validateOrgCsv(headers);
        if (!validation.valid) {
          setError(validation.error || 'Invalid CSV format.');
          return;
        }

        // Parse all row types
        const result = parseOrganisationCsv(rows);

        if (result.teams.length === 0) {
          setError('No "team" rows found in the CSV. At least one team row is required.');
          return;
        }

        setParseResult(result);
        setPreviewHeaders(headers.slice(0, 8)); // Show first 8 columns in preview
        setPreviewRows(rows.slice(0, 8)); // Show first 8 rows
        setStep('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) processFile(file);
    else setError('Please drop a .csv file.');
  };

  const handleFinishImport = () => {
    if (!parseResult) return;

    const assembledTeams = assembleTeamsFromCsv(parseResult);
    const auditActions = auditEventsToActionItems(parseResult.auditEvents);

    onImportComplete(assembledTeams, auditActions, parseResult.auditEvents);
    setStep('done');

    setTimeout(() => {
      handleClose();
    }, 1500);
  };

  const downloadTemplate = () => {
    const content = getOrganisationCsvTemplate();
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sentinel-organisation-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const canFinish = parseResult !== null && parseResult.teams.length > 0;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: isMobile ? '95vw' : 640,
          maxHeight: '85vh',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${COLORS.blue}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={18} color={COLORS.blue} />
            </div>
            <div>
              <h2 style={{ color: theme.textPrimary, fontSize: 16, fontWeight: 700, margin: 0 }}>
                Import Organisation Data
              </h2>
              <p style={{ color: theme.textTertiary, fontSize: 11, margin: 0 }}>
                Upload a single CSV with teams, members, agents, and audit events
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: theme.textTertiary,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {step === 'done' ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <CheckCircle2 size={48} color={COLORS.green} />
              <h3 style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 700, marginTop: 16 }}>
                Import Complete!
              </h3>
              <p style={{ color: theme.textSecondary, fontSize: 13 }}>
                Organisation data has been updated successfully.
              </p>
            </div>
          ) : (
            <>
              {/* Error banner */}
              {error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    background: COLORS.redMuted,
                    border: `1px solid rgba(229,72,77,0.3)`,
                    borderRadius: 8,
                    marginBottom: 14,
                  }}
                >
                  <AlertCircle size={15} color={COLORS.red} />
                  <span style={{ color: COLORS.red, fontSize: 12, flex: 1 }}>{error}</span>
                  <button
                    onClick={() => setError('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.red, padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Upload area */}
              {step === 'select' && (
                <>
                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                      padding: '36px 24px',
                      border: `2px dashed ${isDragOver ? COLORS.blue : theme.border}`,
                      borderRadius: 12,
                      background: isDragOver
                        ? isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)'
                        : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: `${COLORS.blue}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Upload size={22} color={COLORS.blue} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 600, margin: 0 }}>
                        Drop your organisation CSV here
                      </p>
                      <p style={{ color: theme.textTertiary, fontSize: 12, margin: '4px 0 0' }}>
                        or click to browse — one file with teams, members, agents &amp; audit events
                      </p>
                    </div>
                  </div>

                  {/* Format info + template download */}
                  <div
                    style={{
                      marginTop: 16,
                      padding: '14px 16px',
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        CSV Format
                      </span>
                      <button
                        onClick={downloadTemplate}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 12px',
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          background: 'transparent',
                          cursor: 'pointer',
                          color: COLORS.blue,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        <Download size={12} />
                        Download Template
                      </button>
                    </div>
                    <p style={{ color: theme.textTertiary, fontSize: 11, margin: '0 0 8px', lineHeight: 1.5 }}>
                      Use a <code style={{ color: COLORS.amber, background: `${COLORS.amber}15`, padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>row_type</code> column to define each row:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { type: 'team', desc: 'Team info, department, supervisor' },
                        { type: 'member', desc: 'Team members, roles' },
                        { type: 'agent', desc: 'AI agents, status' },
                        { type: 'audit', desc: 'Audit events, risk scores' },
                      ].map((item) => (
                        <div
                          key={item.type}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                            fontSize: 11,
                          }}
                        >
                          <code style={{ color: COLORS.green, fontWeight: 700, fontSize: 10 }}>{item.type}</code>
                          <span style={{ color: theme.textTertiary }}>{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Preview panel */}
              {step === 'preview' && parseResult && (
                <>
                  {/* Summary badges */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 10px',
                        borderRadius: 6,
                        background: `${COLORS.green}15`,
                        border: `1px solid ${COLORS.green}30`,
                      }}
                    >
                      <CheckCircle2 size={13} color={COLORS.green} />
                      <span style={{ color: theme.textPrimary, fontSize: 11, fontWeight: 600 }}>{fileName}</span>
                    </div>
                    {([
                      ['Teams', parseResult.counts.teams, COLORS.blue],
                      ['Members', parseResult.counts.members, '#8B5CF6'],
                      ['Agents', parseResult.counts.agents, '#06B6D4'],
                      ['Audit', parseResult.counts.audit, COLORS.amber],
                    ] as [string, number, string][]).map(([label, count, color]) => (
                      count > 0 && (
                        <span
                          key={label}
                          style={{
                            padding: '4px 9px',
                            borderRadius: 5,
                            background: `${color}15`,
                            color,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {count} {label}
                        </span>
                      )
                    ))}
                  </div>

                  {/* Re-upload button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button
                      onClick={() => { resetState(); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: 'transparent',
                        cursor: 'pointer',
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      <Upload size={12} />
                      Choose Different File
                    </button>
                  </div>

                  {/* Data preview table */}
                  <div
                    style={{
                      overflowX: 'auto',
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 11,
                        fontFamily: 'Inter, monospace',
                      }}
                    >
                      <thead>
                        <tr>
                          {previewHeaders.map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: '8px 10px',
                                textAlign: 'left',
                                color: theme.textTertiary,
                                fontWeight: 700,
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                background: theme.tableHeaderBg,
                                borderBottom: `1px solid ${theme.border}`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i}>
                            {previewHeaders.map((h) => (
                              <td
                                key={h}
                                style={{
                                  padding: '6px 10px',
                                  color: h === 'row_type'
                                    ? COLORS.green
                                    : theme.textSecondary,
                                  fontWeight: h === 'row_type' ? 700 : 400,
                                  borderBottom: `1px solid ${theme.border}`,
                                  whiteSpace: 'nowrap',
                                  maxWidth: 180,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {row[h] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewRows.length < (parseResult.counts.teams + parseResult.counts.members + parseResult.counts.agents + parseResult.counts.audit) && (
                    <p style={{ color: theme.textTertiary, fontSize: 10, marginTop: 6, textAlign: 'right' }}>
                      Showing {previewRows.length} of {parseResult.counts.teams + parseResult.counts.members + parseResult.counts.agents + parseResult.counts.audit} rows
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ color: theme.textTertiary, fontSize: 11 }}>
              {parseResult
                ? `Ready: ${parseResult.counts.teams} teams, ${parseResult.counts.members} members, ${parseResult.counts.agents} agents, ${parseResult.counts.audit} audit events`
                : 'Upload a CSV with a row_type column to proceed'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: 'transparent',
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFinishImport}
                disabled={!canFinish}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: canFinish ? COLORS.green : isDark ? '#333' : '#ccc',
                  color: canFinish ? '#fff' : theme.textTertiary,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  cursor: canFinish ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                Import Data
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
