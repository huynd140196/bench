import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../api";

// Per-sheet calculated fields: simple arithmetic formulas over the sheet's real columns
// (e.g. "Revenue - Cost"), computed on read (server-side, in withCalculatedFields) and
// exposed to every chart on this sheet as if they were ordinary measure columns.
export default function CalculatedFieldsPanel({ workspaceId, sheet, onChange }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fields = sheet.calculatedFields || [];

  const save = async (nextFields) => {
    setSaving(true);
    setError("");
    try {
      await api.updateCalculatedFields(workspaceId, sheet.id, nextFields);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim() || !formula.trim()) return;
    await save([...fields, { name: name.trim(), formula: formula.trim() }]);
    setName("");
    setFormula("");
  };

  const remove = (fieldName) => save(fields.filter((f) => f.name !== fieldName));

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost mono"
        style={{ fontSize: 11, padding: "2px 4px", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Calculated fields {fields.length > 0 && `(${fields.length})`}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {fields.map((f) => (
            <div key={f.name} className="mono" style={{ fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", background: "var(--paper)", borderRadius: 5 }}>
              <span><strong>{f.name}</strong> = {f.formula}</span>
              <button onClick={() => remove(f.name)} className="btn-ghost" style={{ padding: 2 }} disabled={saving}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <form onSubmit={add} style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mono"
              style={{ fontSize: 11, padding: "4px 6px", width: 90 }}
            />
            <input
              type="text"
              placeholder="Formula (e.g. Revenue - Cost)"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              className="mono"
              style={{ fontSize: 11, padding: "4px 6px", flex: 1 }}
            />
            <button type="submit" className="btn" disabled={saving} style={{ padding: "4px 8px" }}>
              <Plus size={11} />
            </button>
          </form>
          {error && <div className="mono" style={{ fontSize: 11, color: "var(--red)" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
