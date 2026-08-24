import { useEffect, useState } from "react";
import { subscribeInSystemDialogs } from "../services/inSystemDialogs.js";

function DialogContent({ active, finish }) {
  const [value, setValue] = useState(active.defaultValue || "");
  const isPrompt = active.kind === "prompt";
  const confirmDisabled = isPrompt && !active.readOnly && !value.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(isPrompt ? null : false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="system-dialog-title" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl" onKeyDown={(event) => { if (event.key === "Escape") finish(isPrompt ? null : false); }}>
        <h2 id="system-dialog-title" className="text-lg font-semibold text-gray-900">{active.title}</h2>
        {active.message && <p className="mt-2 text-sm text-gray-600">{active.message}</p>}
        {isPrompt && <textarea autoFocus value={value} readOnly={active.readOnly} onFocus={(event) => active.readOnly && event.currentTarget.select()} onChange={(event) => setValue(event.target.value)} rows={active.readOnly ? 4 : 3} className="mt-4 w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100" />}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => finish(isPrompt ? null : false)} className="app-secondary-button rounded-xl px-4 py-2 text-sm font-medium">{active.cancelLabel}</button>
          <button type="button" disabled={confirmDisabled} onClick={() => finish(isPrompt ? value : true)} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${active.danger ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}`}>{active.confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

export default function InSystemDialogs() {
  const [queue, setQueue] = useState([]);
  const active = queue[0] || null;

  useEffect(() => subscribeInSystemDialogs((request) => setQueue((current) => [...current, request])), []);
  if (!active) return null;

  function finish(result) {
    active.resolve(result);
    setQueue((current) => current.slice(1));
  }

  return <DialogContent key={active.id} active={active} finish={finish} />;
}
