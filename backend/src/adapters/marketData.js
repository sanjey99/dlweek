import crypto from 'crypto';

function rand(seed, min, max) {
  const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8);
  const x = parseInt(h, 16) / 0xffffffff;
  return min + (max - min) * x;
}

export async function getMarketSnapshot(symbols = ['BTC-USD', 'ETH-USD', 'SPY', 'QQQ']) {
  const t = Date.now();
  return symbols.map((s, i) => {
    const base = s.includes('BTC') ? 65000 : s.includes('ETH') ? 3200 : s === 'SPY' ? 520 : 450;
    const drift = Math.sin((t / 10000) + i) * 0.01;
    const px = +(base * (1 + drift)).toFixed(2);
    const changePct = +(drift * 100).toFixed(2);
    const vol = Math.round(rand(`${s}:${Math.floor(t/5000)}`, 100000, 10000000));
    return { symbol: s, price: px, changePct, volume: vol, ts: new Date(t).toISOString() };
  });
}
