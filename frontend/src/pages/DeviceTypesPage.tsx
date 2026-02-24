import { useEffect, useRef, useState, FormEvent, ChangeEvent } from "react";
import { DeviceType } from "@shared/types/device_type";
import { PropertyRow, PropertyType, SavedProperties } from "@shared/types/properties";
import { getDeviceTypes, updateDeviceType } from "../devices/deviceService";
import "../style/DeviceTypesPage.css";

type FormMode = "create" | "edit";
type GenericPropertyRow = PropertyRow & { value: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const parseDeviceProperties = (raw: unknown): PropertyRow[] => {
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
                }

                return { key, type };
            });
        }
    } catch (e) {
        console.error("Could not parse deviceProperties", e);
    }
    return [];
};

const parseGenericProperties = (raw: unknown): GenericPropertyRow[] => {
    if (!raw) return [];
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            const props = obj as SavedProperties;
            return Object.entries(props).map(([key, saved]) => ({
                key,
                type: saved?.type || PropertyType.STRING,
                value: typeof saved?.value === "undefined" ? "" : String(saved.value),
            }));
        }
    } catch (e) {
        console.error("Could not parse genericProperties", e);
    }
    return [];
};

const castValueForType = (
    row: GenericPropertyRow
): { ok: true; value: string | number | boolean } | { ok: false; error: string } => {
    const key = row.key.trim();
    switch (row.type) {
        case PropertyType.INT: {
            const n = parseInt(row.value, 10);
            if (Number.isNaN(n)) {
                return { ok: false, error: `Invalid value for "${key}" (int expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.FLOAT: {
            const n = parseFloat(row.value);
            if (Number.isNaN(n)) {
                return { ok: false, error: `Invalid value for "${key}" (float expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.BOOL: {
            const lower = row.value.toLowerCase();
            if (lower !== "true" && lower !== "false") {
                return { ok: false, error: `Invalid value for "${key}" (true/false expected).` };
            }
            return { ok: true, value: lower === "true" };
        }
        case PropertyType.STRING:
        default:
            return { ok: true, value: row.value };
    }
};

const DeviceTypesPage: React.FC = () => {
    const [propertiesMode, setPropertiesMode] = useState(false);
    const [deviceProperties, setDeviceProperties] = useState<PropertyRow[]>([]);
    const [genericProperties, setGenericProperties] = useState<GenericPropertyRow[]>([]);

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
    const firmwareInputRef = useRef<HTMLInputElement | null>(null);

    const fetchDeviceTypes = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getDeviceTypes();
            setDeviceTypes(data);
        } catch (err: any) {
            setError(err.error || "Unexpected error");
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
        setDeviceProperties([]);
        setGenericProperties([]);
        setError(null);
    };

    const validateFirmwareVersion = (value: string): string | null => {
        const trimmed = value.trim();

        const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)$/);
        if (!match) {
            return "Version should be in major minor patch format (ex 1.1.124) ";
        }

        const parts = match.slice(1).map(Number);
        if (parts.some((n) => n < 0 || n > 255)) {
            return "every number cannot be major of 255";
        }

        return null;
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) {
            setFirmwareFile(null);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError("File too big (max 10MB).");
            e.target.value = "";
            setFirmwareFile(null);
            return;
        }

        setError(null);
        setFirmwareFile(file);
    };

    const handleChooseFirmwareFile = () => {
        firmwareInputRef.current?.click();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!firmwareVersion.trim() || !typeId.trim()) {
            setError("Compile every field.");
            return;
        }

        const fwError = validateFirmwareVersion(firmwareVersion);
        if (fwError) {
            setError(fwError);
            return;
        }
        if (formMode === "create" && !firmwareFile) {
            setError("Select a .bin file (max 10MB).");
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
                setError("Invalid form state.");
                return;
            }
            setSuccessMessage("Operazione eseguita con successo.");
            resetForm();
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(err.error || "Unexpected error while saving.");
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
        if (!window.confirm(`Delete device type "${device.id}"?`)) {
            return;
        }

        try {
            setError(null);
            setSuccessMessage(null);

            await updateDeviceType(`/${device.id}`, "DELETE");
            setSuccessMessage("Device type deleted.");
            await fetchDeviceTypes();
            if (selectedDevice?.id === device.id) {
                resetForm();
            }
        } catch (err: any) {
            setError(err.error || "Unexpected error while deleting.");
        }
    };

    const handleProperties = (device: DeviceType) => {
        setFormMode("edit");
        setSelectedDevice(device);
        setPropertiesMode(true);

        setDescription(device.description || "");
        setFirmwareVersion(device.firmware_version || "");
        setFirmwareFile(null);
        setDeviceProperties(parseDeviceProperties(device.deviceProperties));
        setGenericProperties(parseGenericProperties(device.genericProperties));
        setSuccessMessage(null);
        setError(null);
    };

    const handleAddDeviceProperty = () => {
        setDeviceProperties((prev) => [
            ...prev,
            { key: "", type: PropertyType.STRING },
        ]);
    };

    const handleDevicePropertyChange = (index: number, newKey: string) => {
        setDeviceProperties((prev) =>
            prev.map((p, i) =>
                i === index ? { ...p, key: newKey } : p
            )
        );
    };

    const handleDevicePropertyTypeChange = (index: number, newType: PropertyType) => {
        setDeviceProperties((prev) =>
            prev.map((p, i) =>
                i === index ? { ...p, type: newType } : p
            )
        );
    };

    const handleRemoveDeviceProperty = (index: number) => {
        setDeviceProperties((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAddGenericProperty = () => {
        setGenericProperties((prev) => [
            ...prev,
            { key: "", type: PropertyType.STRING, value: "" },
        ]);
    };

    const handleGenericPropertyChange = (index: number, patch: Partial<GenericPropertyRow>) => {
        setGenericProperties((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleRemoveGenericProperty = (index: number) => {
        setGenericProperties((prev) => prev.filter((_, i) => i !== index));
    };

    const handlePropertiesSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedDevice) {
            setError("No device selected.");
            return;
        }

        try {
            setSubmitting(true);

            const formData = new FormData();
            const devicePropsObj: Record<string, string> = {};
            const genericPropsObj: SavedProperties = {};

            for (const row of deviceProperties) {
                const k = row.key.trim();
                if (!k) continue;
                devicePropsObj[k] = row.type;
            }

            for (const row of genericProperties) {
                const k = row.key.trim();
                if (!k) continue;
                const cast = castValueForType(row);
                if (!cast.ok) {
                    setError(cast.error);
                    return;
                }
                genericPropsObj[k] = { type: row.type, value: cast.value };
            }

            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            formData.append("deviceProperties", JSON.stringify(devicePropsObj));
            formData.append("genericProperties", JSON.stringify(genericPropsObj));

            await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);

            setSuccessMessage("Properties updated successfully.");
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(
                err.error ||
                "Unexpected error while saving properties."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="device-types-page">
            <header className="dt-header">
                <h1>Device Types</h1>
                <p>Manage firmware versions and file uploads (max 10MB).</p>
            </header>

            <div className="dt-layout">
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>
                            {propertiesMode
                                ? `Device type properties #${selectedDevice?.id}`
                                : formMode === "create"
                                    ? "Create new device type"
                                    : `Edit device type #${selectedDevice?.id}`}
                        </h2>

                        <div className="dt-form-header-actions">
                            {propertiesMode && (
                                <button
                                    className="dt-btn dt-btn-ghost"
                                    type="button"
                                    onClick={() => setPropertiesMode(false)}
                                >
                                    ← Back to firmware data
                                </button>
                            )}

                            {formMode !== "create" && !propertiesMode && (
                                <button
                                    className="dt-btn dt-btn-ghost"
                                    type="button"
                                    onClick={resetForm}
                                >
                                    + New
                                </button>
                            )}
                        </div>
                    </div>

                    {propertiesMode ? (
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
                                <label>Device properties (filled by final user)</label>

                                {deviceProperties.length === 0 && (
                                    <p className="dt-empty">No properties. Add one.</p>
                                )}

                                {deviceProperties.map((p, index) => (
                                    <div key={`device-prop-${index}`} className="dt-prop-row">
                                        <input
                                            type="text"
                                            placeholder="Key (es. maxTemp)"
                                            value={p.key}
                                            onChange={(e) =>
                                                handleDevicePropertyChange(index, e.target.value)
                                            }
                                        />

                                        <select
                                            value={p.type}
                                            onChange={(e) =>
                                                handleDevicePropertyTypeChange(
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
                                            onClick={() => handleRemoveDeviceProperty(index)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    className="dt-btn dt-btn-outline"
                                    onClick={handleAddDeviceProperty}
                                >
                                    + Add property
                                </button>
                            </div>

                            <div className="dt-divider" />

                            <div className="dt-form-group">
                                <label>Generic properties (filled by admin, shared by all devices of this type)</label>

                                {genericProperties.length === 0 && (
                                    <p className="dt-empty">No generic properties. Add one.</p>
                                )}

                                {genericProperties.map((p, index) => (
                                    <div key={`generic-prop-${index}`} className="dt-prop-row">
                                        <input
                                            type="text"
                                            placeholder="Key (es. security)"
                                            value={p.key}
                                            onChange={(e) =>
                                                handleGenericPropertyChange(index, { key: e.target.value })
                                            }
                                        />
                                        <select
                                            value={p.type}
                                            onChange={(e) =>
                                                handleGenericPropertyChange(index, {
                                                    type: e.target.value as PropertyType,
                                                })
                                            }
                                        >
                                            <option value={PropertyType.STRING}>string</option>
                                            <option value={PropertyType.INT}>int</option>
                                            <option value={PropertyType.FLOAT}>float</option>
                                            <option value={PropertyType.BOOL}>bool</option>
                                        </select>
                                        <input
                                            type="text"
                                            placeholder={p.type === PropertyType.BOOL ? "true / false" : "Value"}
                                            value={p.value}
                                            onChange={(e) =>
                                                handleGenericPropertyChange(index, { value: e.target.value })
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-xs dt-btn-danger"
                                            onClick={() => handleRemoveGenericProperty(index)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    className="dt-btn dt-btn-outline"
                                    onClick={handleAddGenericProperty}
                                >
                                    + Add generic property
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
                                {submitting ? "Saving..." : "Save properties"}
                            </button>
                        </form>
                    ) : (
                        <form className="dt-form" onSubmit={handleSubmit}>
                            <div className="dt-form-group">
                                <label htmlFor="type-id">Type ID</label>
                                <input
                                    id="type-id"
                                    type="text"
                                    value={typeId}
                                    onChange={(e) => setTypeId(e.target.value)}
                                    placeholder="E.g. tipo_1, gateway, ..."
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="description">Description</label>
                                <input
                                    id="description"
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="E.g. Controller ambiente, Gateway, ..."
                                />
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="firmwareVersion">Firmware version</label>
                                <input
                                    id="firmwareVersion"
                                    type="text"
                                    value={firmwareVersion}
                                    onChange={(e) => setFirmwareVersion(e.target.value)}
                                    placeholder="E.g. 1.0.0, 2.1.3, ..."
                                />
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="firmwareFile">
                                    Firmware file{" "}
                                    {formMode === "create" && (
                                        <span className="dt-chip">required</span>
                                    )}
                                </label>

                                <div className="dt-file-input">
                                    <input
                                        id="firmwareFile"
                                        type="file"
                                        ref={firmwareInputRef}
                                        onChange={handleFileChange}
                                        accept=".bin,*/*"
                                        className="dt-file-input-native"
                                    />
                                    <button
                                        type="button"
                                        className="dt-btn dt-btn-outline"
                                        onClick={handleChooseFirmwareFile}
                                    >
                                        Choose file
                                    </button>
                                    <span className="dt-file-input-name">
                                        {firmwareFile ? firmwareFile.name : "No file selected"}
                                    </span>
                                </div>

                                <small className="dt-help-text">
                                    Max 10MB.
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
                                {submitting ? "Saving..." : "Save"}
                            </button>
                        </form>
                    )}
                </section>

                <section className="dt-card dt-table-card">
                    <div className="dt-table-header">
                        <h2>Device types list</h2>
                        <button className="dt-btn dt-btn-outline" onClick={fetchDeviceTypes}>
                            Refresh
                        </button>
                    </div>

                    {loading ? (
                        <div className="dt-loading">Loading...</div>
                    ) : deviceTypes.length === 0 ? (
                        <p className="dt-empty">No device types found.</p>
                    ) : (
                        <div className="dt-table-wrapper">
                            <table className="dt-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Description</th>
                                        <th>Firmware</th>
                                        <th>Created</th>
                                        <th>Action</th>
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
                                                        className="dt-btn dt-btn-xs dt-btn-primary"
                                                        onClick={() => handleEdit(dt)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="dt-btn dt-btn-xs dt-btn-outline"
                                                        onClick={() => handleProperties(dt)}
                                                    >
                                                        Properties
                                                    </button>
                                                    <button
                                                        className="dt-btn dt-btn-xs dt-btn-danger"
                                                        onClick={() => handleDelete(dt)}
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
                </section>
            </div>
        </div>
    );
};

export default DeviceTypesPage;
