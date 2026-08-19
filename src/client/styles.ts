/**
 * Arena UI styles — injected once inside the plugin's shadow root.
 * Dark-first palette that harmonizes with DSH Web's surface.
 */
export const ARENA_STYLES = `
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }

  .ar-root {
    position: fixed; inset: 0; z-index: 2147483000;
    pointer-events: none;
    font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Noto Sans", sans-serif;
    color-scheme: dark;
    color: #e6e8ee;
  }
  .ar-root * { pointer-events: none; }
  .ar-root .interactive, .ar-root button, .ar-root input, .ar-root select,
  .ar-root textarea, .ar-root a, .ar-root .ar-panel, .ar-root .ar-modal-bg {
    pointer-events: auto;
  }

  button {
    font: inherit; cursor: pointer; border: none; border-radius: 8px;
    padding: 8px 16px; background: #2a2f3a; color: #e6e8ee;
    transition: background .15s, transform .05s;
  }
  button:hover { background: #343b49; }
  button:active { transform: translateY(1px); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { background: #4f46e5; color: white; font-weight: 600; }
  button.primary:hover:not(:disabled) { background: #5b54f0; }
  button.danger { background: #7f1d1d; color: #fecaca; }
  button.ghost { background: transparent; border: 1px solid #3a4150; }
  button.small { padding: 4px 10px; font-size: 12.5px; border-radius: 6px; }

  input, select, textarea {
    font: inherit; color: #e6e8ee; background: #1a1e27;
    border: 1px solid #333a47; border-radius: 8px; padding: 8px 12px;
    width: 100%;
  }
  input:focus, select:focus, textarea:focus { outline: 2px solid #4f46e5; outline-offset: -1px; }
  textarea { resize: vertical; min-height: 88px; font-family: inherit; }
  label { font-size: 12.5px; color: #9aa3b2; display: block; margin: 0 0 6px 2px; }
  .field { margin-bottom: 14px; }
  .hint { font-size: 12px; color: #737d8d; margin-top: 4px; }

  /* Launcher pill */
  .ar-launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483001;
    display: flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: white; font-weight: 600; font-size: 14px;
    padding: 10px 18px; border-radius: 999px;
    box-shadow: 0 6px 24px rgba(79,70,229,.45);
    cursor: pointer; user-select: none; border: 1px solid rgba(255,255,255,.18);
  }
  .ar-launcher:hover { filter: brightness(1.1); }
  .ar-launcher .logo { font-size: 16px; }

  /* Full-screen panel */
  .ar-panel {
    position: fixed; inset: 0; z-index: 2147483000;
    background: #12141b; display: flex; flex-direction: column;
    animation: ar-fadein .18s ease;
  }
  @keyframes ar-fadein { from { opacity: 0 } to { opacity: 1 } }

  .ar-topbar {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 24px; border-bottom: 1px solid #262b36;
    background: #161922; flex-shrink: 0;
  }
  .ar-topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
  .ar-topbar .brand .mark { width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg,#4f46e5,#7c3aed); display: grid; place-items: center; font-size: 14px; }
  .ar-topbar .crumb { color: #737d8d; font-size: 13.5px; display: flex; gap: 8px; align-items: center; }
  .ar-topbar .spacer { flex: 1; }
  .ar-close { background: transparent; font-size: 18px; padding: 6px 10px; color: #9aa3b2; }

  .ar-body { flex: 1; overflow-y: auto; padding: 24px; }
  .ar-body::-webkit-scrollbar { width: 10px; }
  .ar-body::-webkit-scrollbar-thumb { background: #2c3240; border-radius: 6px; }
  .ar-wrap { max-width: 1060px; margin: 0 auto; }

  /* Cards + lists */
  .card {
    background: #181c26; border: 1px solid #262b36; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 14px;
  }
  .card.clickable { cursor: pointer; transition: border-color .15s, background .15s; }
  .card.clickable:hover { border-color: #4f46e5; background: #1b202c; }
  .card h3 { margin: 0 0 4px; font-size: 15px; }
  .row { display: flex; align-items: center; gap: 10px; }
  .row.between { justify-content: space-between; }
  .muted { color: #737d8d; font-size: 13px; }
  .mono { font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-size: 12.5px; }
  .empty {
    text-align: center; color: #5b6472; padding: 72px 0;
  }
  .empty .big { font-size: 44px; margin-bottom: 12px; }

  /* Pills & badges */
  .pill { font-size: 11.5px; padding: 2px 10px; border-radius: 999px; border: 1px solid #333a47; color: #9aa3b2; white-space: nowrap; }
  .pill.live { border-color: #4f46e5; color: #a5b4fc; background: rgba(79,70,229,.12); }
  .pill.ok { border-color: #065f46; color: #6ee7b7; background: rgba(16,185,129,.1); }
  .pill.bad { border-color: #7f1d1d; color: #fca5a5; background: rgba(239,68,68,.1); }
  .pill.warn { border-color: #92400e; color: #fcd34d; background: rgba(245,158,11,.1); }
  .pill.demo { border-color: #6d28d9; color: #c4b5fd; background: rgba(124,58,237,.12); }

  /* Lane cards (race view) */
  .lanes { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  @media (min-width: 900px) { .lanes.two { grid-template-columns: 1fr 1fr; } .lanes.three { grid-template-columns: repeat(3, 1fr); } .lanes.four { grid-template-columns: repeat(2, 1fr); } }

  .lane {
    background: #181c26; border: 1px solid #262b36; border-radius: 12px;
    padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;
    position: relative; overflow: hidden;
  }
  .lane .head { display: flex; align-items: center; gap: 10px; }
  .lane .badge {
    width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
    font-weight: 800; font-size: 16px; color: white; flex-shrink: 0;
  }
  .lane .badge.b-A { background: linear-gradient(135deg,#4f46e5,#818cf8); }
  .lane .badge.b-B { background: linear-gradient(135deg,#0891b2,#22d3ee); }
  .lane .badge.b-C { background: linear-gradient(135deg,#d97706,#fbbf24); }
  .lane .badge.b-D { background: linear-gradient(135deg,#be185d,#f472b6); }
  .lane .status-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: #9aa3b2; }

  .lane .progress { height: 4px; background: #232833; border-radius: 2px; overflow: hidden; }
  .lane .progress .bar { height: 100%; border-radius: 2px; background: linear-gradient(90deg,#4f46e5,#7c3aed); transition: width .6s ease; }
  .lane .progress.done .bar { background: linear-gradient(90deg,#059669,#34d399); }
  .lane .progress.err .bar { background: linear-gradient(90deg,#dc2626,#f87171); }

  .feed { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #8b94a5; max-height: 168px; overflow-y: auto; display: flex; flex-direction: column-reverse; gap: 2px; }
  .feed div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .feed .err { color: #f87171; }

  .lane .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 12.5px; }
  .lane .metrics .k { color: #5b6472; }

  .verdict-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .verdict-card {
    border: 2px solid #262b36; border-radius: 12px; padding: 16px;
    background: #181c26; cursor: pointer; transition: all .15s; text-align: center;
  }
  .verdict-card:hover { border-color: #4f46e5; }
  .verdict-card.selected { border-color: #4f46e5; background: rgba(79,70,229,.1); box-shadow: 0 0 0 4px rgba(79,70,229,.15); }
  .verdict-card.selected.win { border-color: #d97706; background: rgba(217,119,6,.1); box-shadow: 0 0 0 4px rgba(217,119,6,.18); }

  .verify-row { display: flex; align-items: center; gap: 8px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #9aa3b2; padding: 3px 0; }
  .verify-row .cmd { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .verify-row .exit0 { color: #34d399; } .verify-row .exitN { color: #f87171; }

  pre.answer {
    background: #14171f; border: 1px solid #262b36; border-radius: 8px;
    padding: 12px 14px; font-size: 13px; line-height: 1.65; white-space: pre-wrap;
    max-height: 320px; overflow-y: auto; margin: 0; color: #cbd3df;
  }
  pre.patch {
    background: #0d1017; border: 1px solid #262b36; border-radius: 8px;
    padding: 12px; font-size: 11.5px; line-height: 1.5; overflow: auto; max-height: 420px; margin: 0;
  }
  pre.patch .add { color: #6ee7b7; } pre.patch .del { color: #fca5a5; } pre.patch .hunk { color: #7c8aa5; }

  details.sect { margin-top: 10px; }
  details.sect summary { cursor: pointer; color: #8b93f8; font-size: 13px; user-select: none; padding: 4px 0; }
  details.sect summary:hover { color: #a5b0fc; }

  /* Reveal animation */
  .reveal-lane { text-align: center; padding: 22px; border: 1px solid #262b36; border-radius: 12px; background: #181c26; position: relative; overflow: hidden; }
  .reveal-lane .lbl { font-size: 30px; font-weight: 800; margin-bottom: 6px; }
  .reveal-lane .who { font-size: 16px; font-weight: 700; color: #a5b4fc; }
  .reveal-lane .verdict-note { font-size: 12.5px; color: #fbbf24; margin-top: 6px; }
  .reveal-lane .you-picked { position: absolute; top: 10px; right: 12px; font-size: 11px; color: #d97706; font-weight: 700; }
  @keyframes ar-flip { 0% { transform: rotateX(90deg); opacity: 0 } 100% { transform: rotateX(0); opacity: 1 } }
  .reveal-lane.flipped { animation: ar-flip .5s ease both; }
  .reveal-lane.match { border-color: #d97706; box-shadow: 0 0 24px rgba(217,119,6,.25); }

  /* Modal */
  .ar-modal-bg {
    position: fixed; inset: 0; background: rgba(8,10,14,.72); z-index: 2147483002;
    display: grid; place-items: center; padding: 24px;
    animation: ar-fadein .15s ease;
  }
  .ar-modal {
    background: #181c26; border: 1px solid #2c3240; border-radius: 14px;
    max-width: 640px; width: 100%; max-height: 86vh; overflow-y: auto; padding: 24px;
    box-shadow: 0 24px 80px rgba(0,0,0,.6);
  }
  .ar-modal h2 { margin: 0 0 6px; font-size: 18px; }
  .ar-modal .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

  .toast-wrap { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483100; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
  .toast { background: #222835; border: 1px solid #333a47; color: #e6e8ee; border-radius: 10px; padding: 10px 18px; font-size: 13.5px; box-shadow: 0 8px 30px rgba(0,0,0,.4); animation: ar-fadein .2s ease; }
  .toast.err { border-color: #7f1d1d; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 720px) { .grid2 { grid-template-columns: 1fr; } .ar-body { padding: 14px; } }

  .participant-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .participant-row select { flex: 1; }
  .remove-p { background: transparent; color: #f87171; padding: 6px 10px; font-size: 16px; }

  .spinner { width: 14px; height: 14px; border: 2px solid #4f46e5; border-top-color: transparent; border-radius: 50%; animation: ar-spin .8s linear infinite; display: inline-block; }
  @keyframes ar-spin { to { transform: rotate(360deg) } }

  .countdown { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #737d8d; }

  .lane-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .callout { border-left: 3px solid #4f46e5; background: rgba(79,70,229,.08); padding: 10px 14px; border-radius: 0 8px 8px 0; font-size: 13px; color: #b6bdd4; margin: 12px 0; }
  .callout.warn { border-color: #d97706; background: rgba(217,119,6,.08); }
`
