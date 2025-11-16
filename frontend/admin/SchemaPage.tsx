import React, { useEffect, useState } from "react";
import { getSchema, updateSchema } from "./adminService";

export const SchemaPage: React.FC = () => {
  const [schema, setSchema] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchema().then(setSchema).catch(err => setError(err.error || "Errore"));
  }, []);

  const handleSave = async () => {
    try {
      await updateSchema(schema);
      alert("Schema salvato");
    } catch (err: any) {
      setError(err.error || "Errore salvataggio");
    }
  };

  return (
    <div>
      <h2>Admin: Modifica Schema</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <textarea
        rows={20}
        cols={80}
        value={JSON.stringify(schema, null, 2)}
        onChange={e => setSchema(JSON.parse(e.target.value))}
      />
      <button onClick={handleSave}>Salva</button>
    </div>
  );
};

