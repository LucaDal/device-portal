import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { getDeviceTypes, getDevices, createDevice, deleteDevice, updateDeviceProperties } from "../devices/deviceService"; // quello che hai già
import { DeviceType } from "@shared/types/device_type";
import { DeviceWithRelations } from "@shared/types/device";
import "../style/DevicePage.css";
import { useAuth } from "../auth/AuthContext";

type DevicePropertyRow = {
    key: string;
    type: string;   // "string" | "int" | "float" | "bool"
    value: string;  // valore per QUEL device
};

const DevicesPage: React.FC = () => {
    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // form "nuovo device"
    const [code, setCode] = useState("");
    const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
    const [ownerId, setOwnerId] = useState<string>("");
    const [activated, setActivated] = useState(false);

    // properties per device selezionato
    const [selectedDevice, setSelectedDevice] = useState<DeviceWithRelations | null>(null);
    const [propertyRows, setPropertyRows] = useState<DevicePropertyRow[]>([]);
    const [savingProps, setSavingProps] = useState(false);
    const { user } = useAuth();

    // helper: parse JSON di type_properties (schema)
    const parseTypeProperties = (raw: unknown): Record<string, string> => {
        if (!raw) return {};
        try {
            const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
                // obj: { propName: type }
                return obj as Record<string, string>;
            }
        } catch (e) {
            console.error("Impossibile parsare type_properties", e);
        }
        return {};
    };

    // helper: parse JSON di device_properties (valori)
    const parseDeviceProperties = (raw: unknown): Record<string, unknown> => {
        if (!raw) return {};
        try {
            const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
                return obj as Record<string, unknown>;
            }
        } catch (e) {
            console.error("Impossibile parsare device_properties", e);
        }
        return {};
    };

    const fetchAll = async () => {
        try {
            setLoading(true);
            setError(null);
            const [types, devs] = await Promise.all([
                getDeviceTypes(),
                getDevices(),
            ]);
            setDeviceTypes(types);
            setDevices(devs);
        } catch (err: any) {
            setError(err.error || "Errore imprevisto");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const resetNewDeviceForm = () => {
        setCode("");
        setDeviceTypeId("");
        setOwnerId("");
        setActivated(false);
    };

    // CREA DEVICE
    const handleCreateDevice = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!code.trim() || deviceTypeId === "") {
            setError("Compila almeno code e device type.");
            return;
        }

        try {
            await createDevice({
                code: code.trim(),
                device_type_id: Number(deviceTypeId),
                owner_id: ownerId ? Number(ownerId) : undefined,
                activated,
            });

            setSuccessMessage("Device creato con successo.");
            resetNewDeviceForm();
            await fetchAll();
        } catch (err: any) {
            setError(err.errror || "Errore durante la creazione del device.");
        }
    };

    // APRI EDIT PROPERTIES PER UN DEVICE
    const handleOpenProperties = (device: DeviceWithRelations) => {
        setSelectedDevice(device);
        setSuccessMessage(null);
        setError(null);

        const typeProps = parseTypeProperties(device.type_properties);
        const devProps = parseDeviceProperties(device.device_properties);

        const rows: DevicePropertyRow[] = Object.entries(typeProps).map(
            ([key, type]) => ({
                key,
                type,
                value: devProps[key] != null ? String(devProps[key]) : "",
            })
        );

        setPropertyRows(rows);
    };


    const handleDeleteDevice = (device: DeviceWithRelations) => {
        setSelectedDevice(device);
        setSuccessMessage(null);
        setError(null);

        try {
            deleteDevice(device.code);
            setSuccessMessage("Device deleted correctly");
            fetchAll();
        } catch (err: any) {
            setError(
                err.error ||
                    "Errore durante il salvataggio delle proprietà del device."
            );
        } finally {
            setSavingProps(false);
        }

    };

    const handlePropertyValueChange = (index: number, value: string) => {
        setPropertyRows((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, value } : row
            )
        );
    };

    // SALVA PROPERTIES PER DEVICE
    const handleSaveProperties = async () => {
        if (!selectedDevice) return;

        setError(null);
        setSuccessMessage(null);

        // costruisco oggetto con cast in base al tipo
        const propsObj: Record<string, unknown> = {};

        for (const row of propertyRows) {
            const k = row.key.trim();
            if (!k) continue;

            let v: unknown = row.value;

            if (row.type === "int") {
                const n = parseInt(row.value, 10);
                if (Number.isNaN(n)) {
                    setError(`Valore non valido per "${k}" (int atteso).`);
                    return;
                }
                v = n;
            } else if (row.type === "float") {
                const n = parseFloat(row.value);
                if (Number.isNaN(n)) {
                    setError(`Valore non valido per "${k}" (float atteso).`);
                    return;
                }
                v = n;
            } else if (row.type === "bool") {
                const lower = row.value.toLowerCase();
                if (lower !== "true" && lower !== "false") {
                    setError(`Valore non valido per "${k}" (true/false atteso).`);
                    return;
                }
                v = lower === "true";
            } else {
                // string
                v = row.value;
            }

            propsObj[k] = v;
        }

        try {
            setSavingProps(true);
            await updateDeviceProperties(selectedDevice.code, propsObj);
            setSuccessMessage("Proprietà del device salvate.");
            await fetchAll();
        } catch (err: any) {
            setError(
                err.error ||
                    "Errore durante il salvataggio delle proprietà del device."
            );
        } finally {
            setSavingProps(false);
        }
    };

    return (
        <div className="devices-page">
            <header className="dt-header">
                <h1>Devices</h1>
                <p>Gestisci i dispositivi e i valori delle loro proprietà.</p>
            </header>

            <div className="dt-layout">
                {/* CARD: NUOVO DEVICE - mostro solo se admina*/}
                { user?.role === "admin" && <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>Nuovo device</h2>
                    </div>

                    <form className="dt-form" onSubmit={handleCreateDevice}>
                        <div className="dt-form-group">
                            <label htmlFor="code">Code</label>
                            <input
                                id="code"
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Es. DEV-001"
                            />
                        </div>

                        <div className="dt-form-group">
                            <label htmlFor="deviceType">Device type</label>
                            <select
                                id="deviceType"
                                value={deviceTypeId}
                                onChange={(e) =>
                                    setDeviceTypeId(
                                        e.target.value ? Number(e.target.value) : ""
                                    )
                                }
                            >
                                <option value="">Seleziona...</option>
                                {deviceTypes.map((dt) => (
                                    <option key={dt.id} value={dt.id}>
                                        #{dt.id} - {dt.description} (FW {dt.firmware_version})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="dt-form-group">
                            <label htmlFor="ownerId">Owner ID (opzionale)</label>
                            <input
                                id="ownerId"
                                type="number"
                                value={ownerId}
                                onChange={(e) => setOwnerId(e.target.value)}
                            />
                        </div>

                        <div className="dt-form-group dt-inline">
                            <label htmlFor="activated">
                                <input
                                    id="activated"
                                    type="checkbox"
                                    checked={activated}
                                    onChange={(e) =>
                                        setActivated(e.target.checked)
                                    }
                                />{" "}
                                Attivato
                            </label>
                        </div>

                        {error && (
                            <div className="dt-alert dt-alert-error">{error}</div>
                        )}
                        {successMessage && (
                            <div className="dt-alert dt-alert-success">
                                {successMessage}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="dt-btn dt-btn-primary"
                        >
                            Crea device
                        </button>
                    </form>
                </section>}


                {/* CARD: LISTA DEVICES + PROPERTIES */}
                <section className="dt-card dt-table-card">
                    <div className="dt-table-header">
                        <h2>Lista devices</h2>
                        <button
                            className="dt-btn dt-btn-outline"
                            onClick={fetchAll}
                        >
                            Aggiorna
                        </button>
                    </div>

                    {loading ? (
                        <div className="dt-loading">Caricamento...</div>
                    ) : devices.length === 0 ? (
                        <p className="dt-empty">Nessun device presente.</p>
                    ) : (
                        <div className="dt-table-wrapper">
                            <table className="dt-table">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Type</th>
                                        <th>Owner</th>
                                        <th>Attivo</th>
                                        <th>Azione</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map((d) => (
                                        <tr key={d.code}>
                                            <td>{d.code}</td>
                                            <td>
                                                {d.device_type_description ??
                                                    `type #${d.device_type_id}`}
                                            </td>
                                            <td>{d.owner_id ?? "-"}</td>
                                            <td>{d.activated ? "✔︎" : "✗"}</td>
                                            <td>
                                                <div className="dt-actions">
                                                    <button
                                                        className="dt-btn dt-btn-xs"
                                                        type="button"
                                                        onClick={() =>
                                                            handleOpenProperties(d)
                                                        }
                                                    >
                                                        Properties
                                                    </button>
                                                </div>
                                                <div className="dt-actions">
                                                    <button
                                                        className="dt-btn dt-btn-xs"
                                                        type="button"
                                                        onClick={() =>
                                                            handleDeleteDevice(d)
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* FORM PROPERTIES PER DEVICE SELEZIONATO */}
                    <div className="dt-divider" />

                    <div className="dt-properties-panel">
                        <h3>Proprietà device</h3>
                        {selectedDevice ? (
                            <>
                                <p className="dt-small">
                                    Device <strong>{selectedDevice.code}</strong>{" "}
                                    ({selectedDevice.device_type_description ??
                                        `type #${selectedDevice.device_type_id}`})
                                </p>

                                {propertyRows.length === 0 ? (
                                    <p className="dt-empty">
                                        Nessuna proprietà definita nel device type.
                                    </p>
                                ) : (
                                    <div className="dt-props-list">
                                        {propertyRows.map((row, index) => (
                                            <div
                                                key={row.key}
                                                className="dt-prop-row"
                                            >
                                                <div className="dt-prop-key">
                                                    <strong>{row.key}</strong>{" "}
                                                    <span className="dt-chip">
                                                        {row.type}
                                                    </span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={row.value}
                                                    onChange={(e) =>
                                                        handlePropertyValueChange(
                                                            index,
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder={
                                                        row.type === "bool"
                                                            ? "true / false"
                                                            : "Valore"
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="dt-btn dt-btn-primary"
                                    onClick={handleSaveProperties}
                                    disabled={savingProps}
                                >
                                    {savingProps
                                        ? "Salvataggio..."
                                        : "Salva proprietà device"}
                                </button>
                            </>
                        ) : (
                            <p className="dt-empty">
                                Seleziona un device per modificare le proprietà.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default DevicesPage;

