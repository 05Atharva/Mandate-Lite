import { useState } from 'react';
import { ArrowLeft, FileCheck2, ShieldCheck } from 'lucide-react';
import { replayCases } from '../shared/replay-fixtures.js';
import './replay.css';
import { Brand } from './Brand.js';
import { ThemeControl } from './Theme.js';
const dollars = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
export function Replay() {
  const [selected, setSelected] = useState(replayCases[0]);
  return (
    <div className="replay-page">
      <header className="replay-header">
        <a href="/" className="brand" aria-label="Mandate Lite home">
          <Brand />
        </a>
        <ThemeControl />
      </header>
      <a className="text-button" href="/">
        <ArrowLeft size={17} />
        Open live workspace
      </a>
      <div className="replay-banner" role="note">
        <FileCheck2 size={24} />
        <div>
          <strong>READ-ONLY FIXTURE REPLAY</strong>
          <p>
            Simulated scenarios. No AI or PayPal calls, no real payment evidence, and no changes to
            your ledger.
          </p>
        </div>
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MANDATE LITE · PRODUCT WALKTHROUGH</span>
          <h1>Follow a purchase through its boundaries.</h1>
          <p>The same three outcomes, shown with clearly fictional examples.</p>
        </div>
      </div>
      <section className="panel replay-budget">
        <ShieldCheck size={24} />
        <div>
          <span>Pilot mandate</span>
          <strong>$400 budget · $200 order cap · Review above $150</strong>
        </div>
        <p>Fixture budget: $18 spent, $180 reserved, $202 available.</p>
      </section>
      <div className="replay-layout">
        <section className="replay-cases" aria-label="Fixture scenarios">
          {replayCases.map((item) => (
            <button
              key={item.id}
              className={`panel replay-case ${selected.id === item.id ? 'selected' : ''}`}
              onClick={() => setSelected(item)}
            >
              <span
                className={`badge ${item.state === 'BLOCKED' ? 'red' : item.state === 'REVIEW' ? 'amber' : 'green'}`}
              >
                {item.state === 'CAPTURED'
                  ? 'Fixture payment completed'
                  : item.state === 'REVIEW'
                    ? 'Needs owner review'
                    : 'Blocked'}
              </span>
              <h2>{item.title}</h2>
              <strong>{dollars(item.amountCents)}</strong>
              <p>{item.explanation}</p>
            </button>
          ))}
        </section>
        <section className="panel replay-detail">
          <span className="eyebrow">SIMULATED REQUEST · {selected.id}</span>
          <h2>{selected.title}</h2>
          <ol className="timeline">
            {selected.steps.map((step) => (
              <li key={step.title}>
                <span className="timeline-dot" />
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <dl>
            <dt>Fixture order ID</dt>
            <dd>{selected.orderId ?? 'None'}</dd>
            <dt>Fixture capture ID</dt>
            <dd>{selected.captureId ?? 'None'}</dd>
          </dl>
          <p className="notice">
            This view cannot approve or pay. Use the live workspace with configured sandbox accounts
            to verify an actual transaction.
          </p>
        </section>
      </div>
    </div>
  );
}
