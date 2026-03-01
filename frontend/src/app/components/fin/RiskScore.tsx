import { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { ChevronDown, Play, Loader } from 'lucide-react';
import { C, getScoreColor, getScoreTier } from './colors';

const INDUSTRIES = ['Technology', 'Healthcare', 'Finance', 'Real Estate', 'Retail', 'Energy', 'Manufacturing', 'Agriculture'];

const DEFAULT_OUTPUT = {
  score: 72,
  confidence: 87.3,
  shap: [
    { factor: 'Credit Score', value: -35, abs: 35 },
    { factor: 'DTI Ratio', value: 28, abs: 28 },
    { factor: 'Loan Amount', value: 15, abs: 15 },
    { factor: 'Industry Risk', value: 12, abs: 12 },
    { factor: 'Loan Tenor', value: -8, abs: 8 },
  ],
};

function TerminalInput({ label, value, onChange, type = 'text', prefix = '$' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; prefix?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      borderBottom: `1px solid ${focused ? C.orange : C.border}`,
      padding: '8px 0',
      transition: 'border-color 0.15s ease',
    }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.orange, marginRight: 8 }}>›</span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginRight: 8, minWidth: 120, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}:</span>
      {prefix && type === 'text' && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, marginRight: 4 }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: C.text,
          fontFamily: C.mono,
          fontSize: 12,
          flex: 1,
          caretColor: C.orange,
        }}
      />
    </div>
  );
}

function TerminalSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: `1px solid ${focused ? C.orange : C.border}`,
      padding: '8px 0',
      transition: 'border-color 0.15s ease',
    }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.orange, marginRight: 8 }}>›</span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginRight: 8, minWidth: 120, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}:</span>
      <div style={{ flex: 1, position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: C.text,
            fontFamily: C.mono,
            fontSize: 12,
            width: '100%',
            cursor: 'pointer',
            appearance: 'none',
          }}
        >
          {options.map(o => <option key={o} value={o} style={{ background: C.bgPanel }}>{o}</option>)}
        </select>
        <ChevronDown size={10} color={C.textDim} style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function GaugeChart({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    setDisplayScore(0);

    const animate = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= duration) {
        setDisplayScore(score);
        return;
      }
      const t = elapsed / duration;
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(score * eased));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score]);

  const color = getScoreColor(displayScore);
  const bg = '#1A2030';

  const data = [
    { value: displayScore },
    { value: 100 - displayScore },
  ];

  return (
    <div style={{ position: 'relative', width: 220, height: 200, margin: '0 auto' }}>
      <PieChart width={220} height={200}>
        <Pie
          data={data}
          cx={110}
          cy={120}
          startAngle={225}
          endAngle={-45}
          innerRadius={65}
          outerRadius={85}
          dataKey="value"
          isAnimationActive={false}
          strokeWidth={0}
          paddingAngle={0}
        >
          <Cell fill={color} />
          <Cell fill={bg} />
        </Pie>
      </PieChart>
      {/* Tick marks */}
      <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} width={220} height={200}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = (225 - (tick / 100) * 270) * (Math.PI / 180);
          const r1 = 87, r2 = 93;
          const cx = 110, cy = 120;
          return (
            <line key={tick}
              x1={cx + r1 * Math.cos(angle)} y1={cy - r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)} y2={cy - r2 * Math.sin(angle)}
              stroke={C.border} strokeWidth={1.5}
            />
          );
        })}
        {/* Min/Max labels */}
        <text x={25} y={180} fill={C.textDim} fontSize={9} fontFamily="JetBrains Mono" textAnchor="middle">0</text>
        <text x={195} y={180} fill={C.textDim} fontSize={9} fontFamily="JetBrains Mono" textAnchor="middle">100</text>
      </svg>
      {/* Center overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 30,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: C.mono, fontSize: 42, color, fontWeight: 700, lineHeight: 1 }}>{displayScore}</span>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim, marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

const CustomShapTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    return (
      <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '6px 10px', borderRadius: 2 }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: v > 0 ? C.red : C.green }}>
          {v > 0 ? '+' : ''}{v} pts
        </span>
      </div>
    );
  }
  return null;
};

export function RiskScore() {
  const [loanAmount, setLoanAmount] = useState('250,000');
  const [creditScore, setCreditScore] = useState('680');
  const [dti, setDti] = useState('0.42');
  const [industry, setIndustry] = useState('Technology');
  const [tenor, setTenor] = useState('36');
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('done');
  const [output, setOutput] = useState(DEFAULT_OUTPUT);

  const runModel = () => {
    setStatus('running');
    setTimeout(() => {
      const cs = parseFloat(creditScore) || 680;
      const dtiVal = parseFloat(dti) || 0.42;
      const la = parseFloat(loanAmount.replace(/,/g, '')) || 250000;
      const rawScore = Math.min(100, Math.max(5,
        100 - (cs - 300) / 5.5 + dtiVal * 40 + la / 50000 * 8
      ));
      const score = Math.round(rawScore);
      setOutput({
        score,
        confidence: 85 + Math.random() * 12,
        shap: [
          { factor: 'Credit Score', value: cs < 650 ? 30 : -25, abs: cs < 650 ? 30 : 25 },
          { factor: 'DTI Ratio', value: dtiVal > 0.43 ? 26 : 18, abs: dtiVal > 0.43 ? 26 : 18 },
          { factor: 'Loan Amount', value: la > 200000 ? 14 : 8, abs: la > 200000 ? 14 : 8 },
          { factor: 'Industry Risk', value: industry === 'Real Estate' ? 18 : 10, abs: industry === 'Real Estate' ? 18 : 10 },
          { factor: 'Loan Tenor', value: parseInt(tenor) > 48 ? 8 : -6, abs: parseInt(tenor) > 48 ? 8 : 6 },
        ],
      });
      setStatus('done');
    }, 1600);
  };

  const tier = getScoreTier(output.score);
  const scoreColor = getScoreColor(output.score);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* LEFT: Input Panel 60% */}
      <div style={{
        width: '55%',
        borderRight: `1px solid ${C.border}`,
        padding: 24,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 3, height: 14, background: C.orange }} />
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.orange, letterSpacing: '0.15em' }}>RISK ASSESSMENT ENGINE</span>
          </div>
          <p style={{ fontFamily: C.sans, fontSize: 11, color: C.textDim, margin: 0, paddingLeft: 11 }}>
            Enter loan parameters to compute risk score and feature attribution
          </p>
        </div>

        {/* Terminal prompt inputs */}
        <div style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 2,
          padding: '16px 20px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[C.red, C.yellow, C.green].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginLeft: 4 }}>finiq:risk_engine $ ./assess --mode=standard</span>
          </div>

          <TerminalInput label="Loan Amount" value={loanAmount} onChange={setLoanAmount} />
          <TerminalInput label="Credit Score" value={creditScore} onChange={setCreditScore} prefix="" />
          <TerminalInput label="Debt-to-Income" value={dti} onChange={setDti} prefix="" />
          <TerminalSelect label="Industry Sector" value={industry} onChange={setIndustry} options={INDUSTRIES} />
          <TerminalInput label="Loan Tenor (mo)" value={tenor} onChange={setTenor} prefix="" />
        </div>

        {/* Constraints */}
        <div style={{
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 2,
          padding: '12px 20px',
          marginBottom: 20,
        }}>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: '0.1em', display: 'block', marginBottom: 10 }}>MODEL CONFIG</span>
          {[
            { key: 'Model Version', val: 'v3.2.1 · Gradient Boost' },
            { key: 'Feature Set', val: '42 features · normalized' },
            { key: 'Threshold', val: '0.65 (standard)' },
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textDim }}>{item.key}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text }}>{item.val}</span>
            </div>
          ))}
        </div>

        {/* Run Button */}
        <button
          onClick={runModel}
          disabled={status === 'running'}
          style={{
            width: '100%',
            height: 44,
            background: status === 'running' ? 'rgba(255,107,0,0.3)' : C.orange,
            border: 'none',
            borderRadius: 2,
            color: '#fff',
            fontFamily: C.mono,
            fontSize: 12,
            letterSpacing: '0.2em',
            cursor: status === 'running' ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'background 0.2s ease',
          }}
        >
          {status === 'running' ? (
            <>
              <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}>
                <Loader size={14} />
              </div>
              PROCESSING...
            </>
          ) : (
            <>
              <Play size={14} />
              RUN MODEL
            </>
          )}
        </button>
      </div>

      {/* RIGHT: Output Panel 40% */}
      <div style={{
        flex: 1,
        padding: 24,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, background: C.cyan }} />
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.cyan, letterSpacing: '0.15em' }}>RISK OUTPUT</span>
          </div>
          {status === 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
              <span style={{ fontFamily: C.mono, fontSize: 9, color: C.green }}>COMPUTED</span>
            </div>
          )}
        </div>

        {status === 'running' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ animation: 'spin 1s linear infinite', display: 'flex' }}>
              <Loader size={36} color={C.orange} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, letterSpacing: '0.1em' }}>RUNNING INFERENCE...</span>
            {['Loading model weights...', 'Normalizing features...', 'Computing SHAP values...'].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.orange, animation: `pulse ${1 + i * 0.3}s infinite` }} />
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim }}>{step}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Gauge */}
            <div style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              padding: '20px 16px 8px',
              marginBottom: 12,
              textAlign: 'center',
            }}>
              <GaugeChart score={output.score} key={output.score} />
              <div style={{ marginTop: 8, marginBottom: 16, display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginBottom: 4, letterSpacing: '0.1em' }}>CONFIDENCE</div>
                  <div style={{ fontFamily: C.mono, fontSize: 16, color: C.cyan }}>{output.confidence.toFixed(1)}%</div>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginBottom: 4, letterSpacing: '0.1em' }}>RISK TIER</div>
                  <div style={{
                    fontFamily: C.mono,
                    fontSize: 13,
                    color: tier.color,
                    background: tier.bg,
                    border: `1px solid ${tier.color}40`,
                    borderRadius: 2,
                    padding: '2px 10px',
                    letterSpacing: '0.12em',
                  }}>{tier.label}</div>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginBottom: 4, letterSpacing: '0.1em' }}>SCORE</div>
                  <div style={{ fontFamily: C.mono, fontSize: 16, color: scoreColor }}>{output.score}/100</div>
                </div>
              </div>
              {/* Color scale legend */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 8 }}>
                {[
                  { label: 'LOW 0–40', color: C.green },
                  { label: 'MED 40–70', color: C.yellow },
                  { label: 'HIGH 70–100', color: C.red },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px' }}>
                    <div style={{ width: 8, height: 3, background: s.color, borderRadius: 1 }} />
                    <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SHAP Feature Importance */}
            <div style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              padding: '16px',
              flex: 1,
            }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 12, background: C.orange }} />
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.orange, letterSpacing: '0.15em' }}>TOP CONTRIBUTING FACTORS</span>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>SHAP VALUES</span>
              </div>

              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  layout="vertical"
                  data={output.shap}
                  margin={{ top: 4, right: 30, left: 90, bottom: 4 }}
                  barSize={10}
                >
                  <XAxis type="number" domain={[-50, 50]} tick={{ fill: C.textDim, fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis dataKey="factor" type="category" tick={{ fill: C.text, fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={88} />
                  <ReferenceLine x={0} stroke={C.border} strokeWidth={1} />
                  <Tooltip content={<CustomShapTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="value" radius={1}>
                    {output.shap.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.value > 0 ? C.red : C.green} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 3, background: C.red }} />
                  <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>INCREASES RISK</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 3, background: C.green }} />
                  <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>REDUCES RISK</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>
    </div>
  );
}
