import { useState } from 'react';
import { TopBar } from './components/fin/TopBar';
import { Sidebar } from './components/fin/Sidebar';
import { RiskScore } from './components/fin/RiskScore';
import { FraudDetect } from './components/fin/FraudDetect';
import { Portfolio } from './components/fin/Portfolio';
import { C } from './components/fin/colors';

type Tab = 'RISK_SCORE' | 'FRAUD_DETECT' | 'PORTFOLIO';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('RISK_SCORE');

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: C.sans,
      color: C.text,
    }}>
      {/* Top Bar */}
      <TopBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Body */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main style={{
          flex: 1,
          background: C.bg,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Subtle grid overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 0,
            backgroundImage: `
              linear-gradient(${C.border}44 1px, transparent 1px),
              linear-gradient(90deg, ${C.border}44 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            opacity: 0.3,
          }} />

          {/* Content area */}
          <div style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {activeTab === 'RISK_SCORE' && <RiskScore />}
            {activeTab === 'FRAUD_DETECT' && <FraudDetect />}
            {activeTab === 'PORTFOLIO' && <Portfolio />}
          </div>
        </main>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        ::selection { background: rgba(255,107,0,0.3); color: #E8E8E8; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: #2A3441; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #374151; }
        input:focus { caret-color: ${C.orange}; }
        select option { background: #0D1117; color: #E8E8E8; }
      `}</style>
    </div>
  );
}
