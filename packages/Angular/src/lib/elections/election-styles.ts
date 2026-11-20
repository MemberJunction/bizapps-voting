/**
 * Styles shared by the election tabs and the wizard (semantic design tokens only).
 */
export const ELECTION_COMMON_STYLES = `
    :host { display: block; }
    .panel { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .panel h3 { margin: 0 0 0.5rem; font-size: 1.05rem; color: var(--mj-text-primary); }
    .panel h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
    .panel h4 { margin: 0.75rem 0 0.35rem; font-size: 0.9rem; color: var(--mj-text-secondary); }
    .hint { margin: 0.15rem 0 0.5rem; font-size: 0.85rem; color: var(--mj-text-secondary); }
    .muted { color: var(--mj-text-muted); }
    .small { font-size: 0.85rem; }
    .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2.5rem 1rem; color: var(--mj-text-muted); text-align: center; }
    .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
    .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1rem; border-radius: 8px; margin: 0 0 0.75rem; border: 1px solid transparent; }
    .banner span { flex: 1; }
    .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
    .banner-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: var(--mj-status-warning-border); }
    .banner-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
    .banner-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: var(--mj-status-info-border); }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem 1.5rem; margin: 0; }
    .facts dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }
    .facts dd { margin: 0.15rem 0 0; color: var(--mj-text-primary); word-break: break-word; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--mj-border-default); border-radius: 10px; background: var(--mj-bg-surface); }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { padding: 0.55rem 0.75rem; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
    .grid thead th { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .grid tbody th { font-weight: 600; }
    .grid .num { text-align: right; font-variant-numeric: tabular-nums; }
    .row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; min-width: 0; border: 0; padding: 0; }
    .field label, .field legend { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); padding: 0; }
    .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0 1.25rem; }
    .field-grid .wide { grid-column: 1 / -1; }
    .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; width: 100%; box-sizing: border-box; }
    .input.mono, .mono { font-family: monospace; font-size: 0.85rem; }
    .input:focus-visible, .tab-button:focus-visible, .check input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
    .input[aria-invalid='true'] { border-color: var(--mj-status-error); }
    textarea.input { resize: vertical; }
    .error { margin: 0; font-size: 0.8rem; color: var(--mj-status-error-text); }
    .error:empty { display: none; }
    .checks { display: flex; flex-wrap: wrap; gap: 0.4rem 1.25rem; }
    .check { display: inline-flex; gap: 0.5rem; align-items: center; font-weight: 400; color: var(--mj-text-primary); }
    .chip { display: inline-block; padding: 0.1rem 0.55rem; margin-right: 0.25rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); border: 1px solid var(--mj-border-default); }
    .chip-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: transparent; }
    .chip-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: transparent; }
    .chip-bad { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: transparent; }
    .chip-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: transparent; }
    code { background: var(--mj-bg-surface-sunken); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.85em; color: var(--mj-text-primary); word-break: break-all; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .confirm-text { color: var(--mj-status-warning-text); font-size: 0.9rem; }
`;
