import { useEffect, useState } from "react";
import { addDeviceType, getDeviceTypes } from "./deviceService";
import { DeviceType } from "@shared/types/device_type";

export default function DeviceTypeManager() {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [newDesc, setNewDesc] = useState("");
 const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeviceTypes().then(setDeviceTypes).catch(err => setError(err.error || "Errore"));;
  }, []);

  const handleAdd = async () => {
    if (!newDesc.trim()) return;
    const created = await addDeviceType(newDesc);
    setDeviceTypes(prev => [...prev, created]);
    setNewDesc("");
  };

  return (
    <div className="card">
      <h2>Gestione Device Type</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul>
        {deviceTypes.map(dt => (
          <li key={dt.id}>{dt.description}</li>
        ))}
      </ul>

      <div>
        <input
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="device type"
        />
        <button onClick={handleAdd}>Aggiungi</button>
      </div>
    </div>
  );
}
