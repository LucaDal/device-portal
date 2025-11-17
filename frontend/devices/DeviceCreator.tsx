import { useEffect, useState } from "react";
import { DeviceType } from "../../src/types/device_type";
import { addDevice, getDeviceTypes } from "./deviceService";

export default function DeviceCreator() {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [type_id, setDeviceTypeId] = useState<number>(0);
  const [owner_id, setOwnerId] = useState<number>(0);
  const [firmware_version, setFirmwareVersion] = useState("");
  const [firmware_build, setFirmwareFile] = useState<File | null>(null);
  useEffect(() => {
    getDeviceTypes().then((types) => {
      setDeviceTypes(types);
      if (types.length > 0) 
        setDeviceTypeId(types[0].id);
    });
  }, []);

  const handleSubmit = async () => {
    try {
      const res = await addDevice({ type_id, owner_id, firmware_version, firmware_build});
      alert("Device created");
    } catch (err: any) {
      alert(err.error || "Request failed");
    }
  };

  return (
    <div className="card">
      <h2>New Device</h2>

      <label>Type</label>
      <select value={type_id} onChange={(e) => setDeviceTypeId(Number(e.target.value))}>
        {deviceTypes.map(dt => (
          <option key={dt.id} value={dt.id}>
            {dt.description}
          </option>
        ))}
      </select>

      <label>Firmware Version</label>
      <input
        value={firmware_version}
        onChange={e => setFirmwareVersion(e.target.value)}
        placeholder="1.0.0"
      />

      <label>Firmware Build (file)</label>
      <input type="file" onChange={e => setFirmwareFile(e.target.files?.[0] ?? null)} />

      <button onClick={handleSubmit}>Crea Device</button>
    </div>
  );
}
