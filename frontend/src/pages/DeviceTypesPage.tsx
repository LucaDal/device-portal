import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { DeviceType } from "@shared/types/device_type";
import { PropertyRow, PropertyType } from "@shared/types/properties";
import { getDeviceTypes, updateDeviceType } from "../devices/deviceService";
import "../style/DeviceTypesPage.css";

type FormMode = "create" | "edit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DeviceTypesPage: React.FC = () => {
    const [propertiesMode, setPropertiesMode] = useState(false);
    const [properties, setProperties] = useState<PropertyRow[]>([]);

    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formMode, setFormMode] = useState<FormMode>("create");
    const [selectedDevice, setSelectedDevice] = useState<DeviceType | null>(null);

    const [typeId, setTypeId] = useState("");
    const [description, setDescription] = useState("");
    const [firmwareVersion, setFirmwareVersion] = useState("");
    const [firmwareFile, setFirmwareFile] = useState<File | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // properties nel DB: { key: "string" | "int" | ... }
    const parseProperties = (raw: unknown): PropertyRow[] => {
        if (!raw) return [];
        try {
            const obj = typeof raw === "string" ? JSON.parse(raw) : raw;

            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
                return Object.entries(obj).map(([key, value]) => {
                    let type: PropertyType = PropertyType.STRING;
                    const v = String(value);

                    if (
                        v === PropertyType.INT ||
                        v === PropertyType.FLOAT ||
                        v === PropertyType.BOOL ||
                        v === PropertyType.STRING
                    ) {
                        type = v as PropertyType;
                    } else {
                        type = PropertyType.STRING;
                    }

                    return {
                        key,
                        type,
                    };
                });
            }
        } catch (e) {
            console.error("Impossibile parsare properties", e);
        }
        return [];
    };

    // Carica lista device types
    const fetchDeviceTypes = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getDeviceTypes();
            setDeviceTypes(data);
        } catch (err: any) {
            setError(err.error || "Errore imprevisto");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeviceTypes();
    }, []);

    const resetForm = () => {
        setDescription("");
        setFirmwareVersion("");
        setTypeId("");
        setFirmwareFile(null);
        setFormMode("create");
        setSelectedDevice(null);
        setPropertiesMode(false);
        setProperties([]);
        setError(null);
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) {
            setFirmwareFile(null);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError("File troppo grande (max 10MB).");
            e.target.value = "";
            setFirmwareFile(null);
            return;
        }

        setError(null);
        setFirmwareFile(file);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!firmwareVersion.trim() || !typeId.trim()) {
            setError("Compila tutti i campi obbligatori.");
            return;
        }

        // In create il file è obbligatorio
        if (formMode === "create" && !firmwareFile) {
            setError("Seleziona un file firmware (max 10MB).");
            return;
        }

        if (firmwareFile && firmwareFile.size > MAX_FILE_SIZE) {
            setError("File troppo grande (max 10MB).");
            return;
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            formData.append("id", typeId);
            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            if (firmwareFile) {
                formData.append("firmware_build", firmwareFile);
            }

            if (formMode === "create") {
                await updateDeviceType("", "POST", formData);
            } else if (formMode === "edit" && selectedDevice) {
                await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);
            } else {
                setError("Stato del form non valido.");
                return;
            }
            setSuccessMessage("Operazione eseguita con successo.");
            resetForm();
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(err.error || "Errore imprevisto durante il salvataggio.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (device: DeviceType) => {
        setPropertiesMode(false);
        setFormMode("edit");
        setSelectedDevice(device);
        setDescription(device.description || "");
        setFirmwareVersion(device.firmware_version || "");
        setTypeId(device.id ? String(device.id) : "");
        setFirmwareFile(null);
        setSuccessMessage(null);
        setError(null);
    };

    const handleDelete = async (device: DeviceType) => {
        if (!window.confirm(`Eliminare il device type "${device.id}"?`)) {
            return;
        }

        try {
            setError(null);
            setSuccessMessage(null);

            await updateDeviceType(`/${device.id}`, "DELETE");
            setSuccessMessage("Device type eliminato.");
            await fetchDeviceTypes();
            if (selectedDevice?.id === device.id) {
                resetForm();
            }
        } catch (err: any) {
            setError(err.error || "Errore imprevisto durante l'eliminazione.");
        }
    };

    // PROPERTIES ================
    const handleProperties = (device: DeviceType) => {
        setFormMode("edit");
        setSelectedDevice(device);
        setPropertiesMode(true);

        setDescription(device.description || "");
        setFirmwareVersion(device.firmware_version || "");
        setFirmwareFile(null);
        setProperties(parseProperties(device.properties));
        setSuccessMessage(null);
        setError(null);
    };

    const handleAddProperty = () => {
        setProperties((prev) => [
            ...prev,
            { key: "", type: PropertyType.STRING },
        ]);
    };

    const handlePropertyChange = (index: number, newKey: string) => {
        setProperties((prev) =>
            prev.map((p, i) =>
                i === index ? { ...p, key: newKey } : p
            )
        );
    };

    const handlePropertyTypeChange = (index: number, newType: PropertyType) => {
        setProperties((prev) =>
            prev.map((p, i) =>
                i === index ? { ...p, type: newType } : p
            )
        );
    };

    const handleRemoveProperty = (index: number) => {
        setProperties((prev) => prev.filter((_, i) => i !== index));
    };

    const handlePropertiesSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedDevice) {
            setError("Nessun device selezionato.");
            return;
        }

        try {
            setSubmitting(true);

            const formData = new FormData();

            // nel DB salvi solo il tipo per ogni chiave
            const propsObj: Record<string, string> = {};

            for (const row of properties) {
                const k = row.key.trim();
                if (!k) continue; // salta righe senza chiave

                propsObj[k] = row.type; // enum -> string
            }

            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            formData.append("properties", JSON.stringify(propsObj));

            await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);

            setSuccessMessage("Proprietà aggiornate con successo.");
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(
                err.error ||
                "Errore imprevisto durante il salvataggio delle proprietà."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="device-types-page">
            <header className="dt-header">
                <h1>Device Types</h1>
                <p>Gestisci versioni firmware e caricamento file (max 10MB).</p>
            </header>

            <div className="dt-layout">
                {/* FORM CARD */}
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>
                            {propertiesMode
                                ? `Proprietà device type #${selectedDevice?.id}`
                                : formMode === "create"
                                    ? "Crea nuovo device type"
                                    : `Modifica device type #${selectedDevice?.id}`}
                        </h2>

                        <div className="dt-form-header-actions">
                            {propertiesMode && (
                                <button
                                    className="dt-btn dt-btn-ghost"
                                    type="button"
                                    onClick={() => setPropertiesMode(false)}
                                >
                                    ← Torna ai dati firmware
                                </button>
                            )}

                            {formMode !== "create" && !propertiesMode && (
                                <button
                                    className="dt-btn dt-btn-ghost"
                                    type="button"
                                    onClick={resetForm}
                                >
                                    + Nuovo
                                </button>
                            )}
                        </div>
                    </div>

                    {propertiesMode ? (
                        // === FORM PROPERTIES (solo proprietà) ===
                        <form className="dt-form" onSubmit={handlePropertiesSubmit}>
                            {selectedDevice && (
                                <div className="dt-form-group">
                                    <div className="dt-summary">
                                        <strong>Device:</strong> {selectedDevice.description}{" "}
                                        <span className="dt-summary-chip">
                                            FW {selectedDevice.firmware_version}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="dt-form-group">
                                <label>Proprietà</label>

                                {properties.length === 0 && (
                                    <p className="dt-empty">
                                        Nessuna proprietà. Aggiungine una.
                                    </p>
                                )}

                                {properties.map((p, index) => (
                                    <div key={index} className="dt-prop-row">
                                        {/* KEY */}
                                        <input
                                            type="text"
                                            placeholder="Key (es. maxTemp)"
                                            value={p.key}
                                            onChange={(e) =>
                                                handlePropertyChange(index, e.target.value)
                                            }
                                        />

                                        {/* TYPE SELECT */}
                                        <select
                                            value={p.type}
                                            onChange={(e) =>
                                                handlePropertyTypeChange(
                                                    index,
                                                    e.target.value as PropertyType
                                                )
                                            }
                                        >
                                            <option value={PropertyType.STRING}>string</option>
                                            <option value={PropertyType.INT}>int</option>
                                            <option value={PropertyType.FLOAT}>float</option>
                                            <option value={PropertyType.BOOL}>bool</option>
                                        </select>

                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-xs dt-btn-danger"
                                            onClick={() => handleRemoveProperty(index)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    className="dt-btn dt-btn-outline"
                                    onClick={handleAddProperty}
                                >
                                    + Aggiungi proprietà
                                </button>
                            </div>

                            {error && <div className="dt-alert dt-alert-error">{error}</div>}
                            {successMessage && (
                                <div className="dt-alert dt-alert-success">{successMessage}</div>
                            )}

                            <button
                                type="submit"
                                className="dt-btn dt-btn-primary"
                                disabled={submitting}
                            >
                                {submitting ? "Salvataggio..." : "Salva proprietà"}
                            </button>
                        </form>
                    ) : (
                        // === FORM FIRMWARE ORIGINALE ===
                        <form className="dt-form" onSubmit={handleSubmit}>
                            <div className="dt-form-group">
                                <label htmlFor="type-id">Type ID</label>
                                <input
                                    id="type-id"
                                    type="text"
                                    value={typeId}
                                    onChange={(e) => setTypeId(e.target.value)}
                                    placeholder="Es. tipo_1, gateway, ..."
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="description">Descrizione</label>
                                <input
                                    id="description"
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Es. Controller ambiente, Gateway, ..."
                                />
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="firmwareVersion">Firmware version</label>
                                <input
                                    id="firmwareVersion"
                                    type="text"
                                    value={firmwareVersion}
                                    onChange={(e) => setFirmwareVersion(e.target.value)}
                                    placeholder="Es. 1.0.0, 2.1.3, ..."
                                />
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="firmwareFile">
                                    Firmware file{" "}
                                    {formMode === "create" && (
                                        <span className="dt-chip">obbligatorio</span>
                                    )}
                                </label>

                                <div className="dt-file-input">
                                    <input
                                        id="firmwareFile"
                                        type="file"
                                        onChange={handleFileChange}
                                        accept=".bin,*/*"
                                    />
                                </div>

                                <small className="dt-help-text">
                                    Massimo 10MB.
                                </small>
                            </div>

                            {error && <div className="dt-alert dt-alert-error">{error}</div>}
                            {successMessage && (
                                <div className="dt-alert dt-alert-success">
                                    {successMessage}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="dt-btn dt-btn-primary"
                                disabled={submitting}
                            >
                                {submitting ? "Salvataggio..." : "Salva"}
                            </button>
                        </form>
                    )}
                </section>

                {/* TABLE CARD */}
                <section className="dt-card dt-table-card">
                    <div className="dt-table-header">
                        <h2>Lista device types</h2>
                        <button className="dt-btn dt-btn-outline" onClick={fetchDeviceTypes}>
                            Aggiorna
                        </button>
                    </div>

                    {loading ? (
                        <div className="dt-loading">Caricamento...</div>
                    ) : deviceTypes.length === 0 ? (
                        <p className="dt-empty">Nessun device type presente.</p>
                    ) : (
                        <div className="dt-table-wrapper">
                            <table className="dt-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Description</th>
                                        <th>Firmware</th>
                                        <th>Created</th>
                                        <th>Azione</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deviceTypes.map((dt) => (
                                        <tr key={dt.id}>
                                            <td>{dt.id}</td>
                                            <td>{dt.description}</td>
                                            <td>{dt.firmware_version}</td>
                                            <td>{dt.created_at}</td>
                                            <td>
                                                <div className="dt-actions">
                                                    <button
                                                        className="dt-btn dt-btn-xs"
                                                        onClick={() => handleEdit(dt)}
                                                    >
                                                        Modifica
                                                    </button>
                                                    <button
                                                        className="dt-btn dt-btn-xs"
                                                        onClick={() => handleProperties(dt)}
                                                    >
                                                        Properties
                                                    </button>
                                                    <button
                                                        className="dt-btn dt-btn-xs dt-btn-danger"
                                                        onClick={() => handleDelete(dt)}
                                                    >
                                                        Elimina
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default DeviceTypesPage;

