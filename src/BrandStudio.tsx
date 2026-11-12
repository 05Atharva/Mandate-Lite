import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Brand, BrandMark } from './Brand.js';
import { ThemeControl } from './Theme.js';

export function BrandStudio() {
  return (
    <div className="brand-studio">
      <header className="brand-studio-header">
        <a href="/" className="brand" aria-label="Mandate Lite home">
          <Brand />
        </a>
        <ThemeControl />
      </header>
      <a href="/" className="text-button">
        <ArrowLeft size={16} /> Back to the workspace
      </a>
      <div className="brand-studio-intro">
        <span className="eyebrow">
          <span className="tiny-square" /> THE MANDATE LITE IDENTITY
        </span>
        <h1>Freedom, framed.</h1>
        <p>
          An original mark for an agent that has room to work.
          <br />
          And a person who sets the boundaries.
        </p>
      </div>
      <section className="brand-specimens" aria-label="Logo in light and dark settings">
        <div className="brand-specimen specimen-light">
          <BrandMark />
          <span>01 / MINERAL IVORY</span>
        </div>
        <div className="brand-specimen specimen-dark">
          <BrandMark />
          <span>02 / WARM GRAPHITE</span>
        </div>
      </section>
      <section className="brand-story-grid">
        <div>
          <span className="eyebrow">THE CONSTRUCTION</span>
          <h2>
            A mandate. An open boundary.
            <br />
            One deliberate point of action.
          </h2>
        </div>
        <p>
          The angular M holds its shape inside two open corners. Those corners express a clear
          perimeter without closing off useful autonomy. A small square completes the composition:
          the moment an intention becomes an explicit decision.
        </p>
      </section>
      <section className="brand-palette" aria-label="Brand colors">
        {[
          { name: 'Graphite', color: '#252a22', ink: '#f1f2e9' },
          { name: 'Mineral', color: '#f5f5ee', ink: '#252920' },
          { name: 'Citron', color: '#d9f36b', ink: '#252e13' },
          { name: 'Olive', color: '#52652b', ink: '#fffefa' },
        ].map(({ name, color, ink }) => (
          <div key={name} style={{ background: color, color: ink }}>
            <strong>{name}</strong>
            <span>{color.toUpperCase()}</span>
          </div>
        ))}
      </section>
      <section className="brand-type panel">
        <div>
          <span className="eyebrow">SPACE GROTESK / DISPLAY</span>
          <h2>
            A little freedom.
            <br />
            Clear boundaries.
          </h2>
          <span className="brand-type-numbers">$400.00</span>
        </div>
        <div>
          <span className="eyebrow">MANROPE / INTERFACE</span>
          <h3>Permission before payment.</h3>
          <p>
            Readable, measured, and comfortable. A workspace that makes the next decision clear, on
            a phone or at your desk.
          </p>
          <a className="text-button" href="/brand/mandate-mark.svg" download>
            Download the SVG mark <ArrowUpRight size={16} />
          </a>
          <a className="text-button" href="/brand/mandate-mark-mono.svg" download>
            Download monochrome SVG <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
      <footer className="main-footer">
        <span>MANDATE LITE / BOUNDARY IDENTITY</span>
        <span>Original vector artwork · Hand-authored motion</span>
      </footer>
    </div>
  );
}
