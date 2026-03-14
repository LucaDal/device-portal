import React, { useEffect, useState } from "react";
import { getSchema, updateSchema } from "./adminService";

export const SchemaPage: React.FC = () => {
  const [schema, setSchema] = useState<any>(null);
  const [schemaText, setSchemaText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchema()
      .then((loadedSchema) => {
        setSchema(loadedSchema);
        setSchemaText(JSON.stringify(loadedSchema, null, 2));
      })
      .catch((err) => setError(err.error || "Error"));
  }, []);

  const handleSave = async () => {
    try {
      setError(null);
      const parsed = JSON.parse(schemaText);
      await updateSchema(parsed);
      setSchema(parsed);
      alert("Schema salvato");
    } catch (err: any) {
      setError(err?.error || "JSON non valido o save error");
    }
  };

  return (
    <div>
      <h2>Admin: Modifica Schema</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <textarea
        rows={20}
        cols={80}
        value={schemaText}
        onChange={(e) => setSchemaText(e.target.value)}
      />
      <button onClick={handleSave}>Save</button>
    </div>
  );
};
