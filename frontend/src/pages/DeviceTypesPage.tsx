import { useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from "react";
import { DeviceType } from "@shared/types/device_type";
import {
    DevicePropertyMap,
    PropertyRow,
    PropertyType,
    SavedProperties,
    parseDevicePropertyMap,
} from "@shared/types/properties";
import { getDeviceTypes, updateDeviceType } from "../devices/deviceService";
import ErrorBanner from "../components/ErrorBanner";
import "../style/DeviceTypesPage.css";

type DeviceTypesTab = "list" | "create" | "edit" | "properties";
type GenericPropertyRow = PropertyRow & { value: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const parseDeviceProperties = (raw: unknown): PropertyRow[] => {
    const parsed = parseDevicePropertyMap(raw);
    return Object.entries(parsed).map(([key, def]) => ({
        key,
        type: def.type,
        sensitive: Boolean(def.sensitive),
    }));
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
            const normalized = row.value.replace(",", ".");
            const n = parseFloat(normalized);
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
    const [activeTab, setActiveTab] = useState<DeviceTypesTab>("list");

    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [typeId, setTypeId] = useState("");
    const [description, setDescription] = useState("");
    const [firmwareVersion, setFirmwareVersion] = useState("");
    const [firmwareFile, setFirmwareFile] = useState<File | null>(null);

    const [deviceProperties, setDeviceProperties] = useState<PropertyRow[]>([]);
    const [genericProperties, setGenericProperties] = useState<GenericPropertyRow[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const firmwareInputRef = useRef<HTMLInputElement | null>(null);

    const selectedDevice = useMemo(
        () => deviceTypes.find((d) => d.id === selectedTypeId) || null,
        [deviceTypes, selectedTypeId]
    );

    const fetchDeviceTypes = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getDeviceTypes();
            setDeviceTypes(data);
            if (selectedTypeId && !data.some((d) => d.id === selectedTypeId)) {
                setSelectedTypeId("");
            }
        } catch (err: any) {
            setError(err.error || "Unexpected error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeviceTypes();
    }, []);

    const resetCreateForm = () => {
        setTypeId("");
        setDescription("");
        setFirmwareVersion("");
        setFirmwareFile(null);
        if (firmwareInputRef.current) {
            firmwareInputRef.current.value = "";
        }
    };

    const loadEditFields = (device: DeviceType) => {
        setTypeId(device.id ? String(device.id) : "");
        setDescription(device.description || "");
        setFirmwareVersion(device.firmware_version || "");
        setFirmwareFile(null);
        if (firmwareInputRef.current) {
            firmwareInputRef.current.value = "";
        }
    };

    const loadPropertiesFields = (device: DeviceType) => {
        setDeviceProperties(parseDeviceProperties(device.deviceProperties));
        setGenericProperties(parseGenericProperties(device.genericProperties));
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

    const handleCreateSubmit = async (e: FormEvent) => {
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
        if (!firmwareFile) {
            setError("Select a .bin file (max 10MB).");
            return;
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            formData.append("id", typeId);
            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            formData.append("firmware_build", firmwareFile);

            await updateDeviceType("", "POST", formData);
            setSuccessMessage("Operazione eseguita con successo.");
            resetCreateForm();
            await fetchDeviceTypes();
            setActiveTab("list");
        } catch (err: any) {
            setError(err.error || "Unexpected error while saving.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedDevice) {
            setError("Select a device type to edit.");
            return;
        }

        if (!firmwareVersion.trim()) {
            setError("Compile every field.");
            return;
        }

        const fwError = validateFirmwareVersion(firmwareVersion);
        if (fwError) {
            setError(fwError);
            return;
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            if (firmwareFile) {
                formData.append("firmware_build", firmwareFile);
            }

            await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);
            setSuccessMessage("Device type updated successfully.");
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(err.error || "Unexpected error while saving.");
        } finally {
            setSubmitting(false);
        }
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
            if (selectedTypeId === device.id) {
                setSelectedTypeId("");
            }
            if (activeTab !== "list") {
                setActiveTab("list");
            }
        } catch (err: any) {
            setError(err.error || "Unexpected error while deleting.");
        }
    };

    const handleEditAction = (device: DeviceType) => {
        setSelectedTypeId(device.id);
        loadEditFields(device);
        setActiveTab("edit");
        setError(null);
        setSuccessMessage(null);
    };

    const handlePropertiesAction = (device: DeviceType) => {
        setSelectedTypeId(device.id);
        loadPropertiesFields(device);
        setActiveTab("properties");
        setError(null);
        setSuccessMessage(null);
    };

    const handleSelectedTypeChange = (value: string) => {
        setSelectedTypeId(value);
        const device = deviceTypes.find((d) => d.id === value);
        if (!device) return;

        if (activeTab === "edit") {
            loadEditFields(device);
        }
        if (activeTab === "properties") {
            loadPropertiesFields(device);
        }
    };

    const handleAddDeviceProperty = () => {
        setDeviceProperties((prev) => [...prev, { key: "", type: PropertyType.STRING, sensitive: false }]);
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
                i === index
                    ? {
                        ...p,
                        type: newType,
                        sensitive: newType === PropertyType.STRING ? Boolean(p.sensitive) : false,
                    }
                    : p
            )
        );
    };

    const handleDevicePropertySensitiveChange = (index: number, sensitive: boolean) => {
        setDeviceProperties((prev) =>
            prev.map((p, i) =>
                i === index
                    ? {
                        ...p,
                        sensitive: p.type === PropertyType.STRING ? sensitive : false,
                    }
                    : p
            )
        );
    };

    const handleRemoveDeviceProperty = (index: number) => {
        setDeviceProperties((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAddGenericProperty = () => {
        setGenericProperties((prev) => [...prev, { key: "", type: PropertyType.STRING, value: "" }]);
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
            setError("Select a device type to update properties.");
            return;
        }

        try {
            setSubmitting(true);

            const formData = new FormData();
            const devicePropsObj: DevicePropertyMap = {};
            const genericPropsObj: SavedProperties = {};

            for (const row of deviceProperties) {
                const k = row.key.trim();
                if (!k) continue;
                devicePropsObj[k] = {
                    type: row.type,
                    sensitive: row.type === PropertyType.STRING && Boolean(row.sensitive),
                };
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

            formData.append("description", selectedDevice.description || "");
            formData.append("firmware_version", selectedDevice.firmware_version || "");
            formData.append("deviceProperties", JSON.stringify(devicePropsObj));
            formData.append("genericProperties", JSON.stringify(genericPropsObj));

            await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);

            setSuccessMessage("Properties updated successfully.");
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(err.error || "Unexpected error while saving properties.");
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

            <div className="dt-tabs">
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "list" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("list")}
                >
                    Device Type List
                </button>
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "create" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => {
                        setActiveTab("create");
                        resetCreateForm();
                    }}
                >
                    New Type
                </button>
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "edit" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("edit")}
                >
                    Edit
                </button>
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "properties" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("properties")}
                >
                    Properties
                </button>
            </div>

            {activeTab === "list" && (
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
                                                        type="button"
                                                        className="dt-btn dt-btn-xs dt-btn-primary"
                                                        onClick={() => handleEditAction(dt)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="dt-btn dt-btn-xs dt-btn-outline"
                                                        onClick={() => handlePropertiesAction(dt)}
                                                    >
                                                        Properties
                                                    </button>
                                                    <button
                                                        type="button"
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
            )}

            {activeTab === "create" && (
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>Create new device type</h2>
                    </div>
                    <form className="dt-form" onSubmit={handleCreateSubmit}>
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
                                Firmware file <span className="dt-chip">required</span>
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

                            <small className="dt-help-text">Max 10MB.</small>
                        </div>

                        <button
                            type="submit"
                            className="dt-btn dt-btn-primary"
                            disabled={submitting}
                        >
                            {submitting ? "Saving..." : "Save"}
                        </button>
                    </form>
                </section>
            )}

            {activeTab === "edit" && (
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>Edit device type</h2>
                    </div>
                    <form className="dt-form" onSubmit={handleEditSubmit}>
                        <div className="dt-form-group">
                            <label htmlFor="editTypeSelect">Device type</label>
                            <select
                                id="editTypeSelect"
                                value={selectedTypeId}
                                onChange={(e) => handleSelectedTypeChange(e.target.value)}
                            >
                                <option value="">Select...</option>
                                {deviceTypes.map((dt) => (
                                    <option key={dt.id} value={dt.id}>
                                        {dt.id} - {dt.description || "No description"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!selectedDevice ? (
                            <p className="dt-empty">Select a device type to edit.</p>
                        ) : (
                            <>
                                <div className="dt-form-group">
                                    <label htmlFor="editDescription">Description</label>
                                    <input
                                        id="editDescription"
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Description"
                                    />
                                </div>

                                <div className="dt-form-group">
                                    <label htmlFor="editFirmwareVersion">Firmware version</label>
                                    <input
                                        id="editFirmwareVersion"
                                        type="text"
                                        value={firmwareVersion}
                                        onChange={(e) => setFirmwareVersion(e.target.value)}
                                        placeholder="E.g. 1.0.0"
                                    />
                                </div>

                                <div className="dt-form-group">
                                    <label htmlFor="editFirmwareFile">Firmware file (optional)</label>
                                    <div className="dt-file-input">
                                        <input
                                            id="editFirmwareFile"
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
                                </div>

                                <button
                                    type="submit"
                                    className="dt-btn dt-btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? "Saving..." : "Save"}
                                </button>
                            </>
                        )}
                    </form>
                </section>
            )}

            {activeTab === "properties" && (
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>Device type properties</h2>
                    </div>
                    <form className="dt-form dt-properties-form" onSubmit={handlePropertiesSubmit}>
                        <div className="dt-form-group">
                            <label htmlFor="propsTypeSelect">Device type</label>
                            <select
                                id="propsTypeSelect"
                                value={selectedTypeId}
                                onChange={(e) => handleSelectedTypeChange(e.target.value)}
                            >
                                <option value="">Select...</option>
                                {deviceTypes.map((dt) => (
                                    <option key={dt.id} value={dt.id}>
                                        {dt.id} - {dt.description || "No description"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!selectedDevice ? (
                            <p className="dt-empty">Select a device type to edit properties.</p>
                        ) : (
                            <>
                                <div className="dt-form-group">
                                    <label>Device properties (filled by final user)</label>

                                    {deviceProperties.length === 0 && (
                                        <p className="dt-empty">No properties. Add one.</p>
                                    )}

                                    {deviceProperties.length > 0 && (
                                        <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-device dt-prop-row-header">
                                            <strong>Key</strong>
                                            <strong>Type</strong>
                                            <strong>Encrypt</strong>
                                            <strong>Action</strong>
                                        </div>
                                    )}

                                    {deviceProperties.map((p, index) => (
                                        <div
                                            key={`device-prop-${index}`}
                                            className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-device"
                                        >
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

                                            {p.type === PropertyType.STRING ? (
                                                <label className="dt-small dt-prop-inline-flag">
                                                    <input
                                                        className="dt-check"
                                                        type="checkbox"
                                                        checked={Boolean(p.sensitive)}
                                                        onChange={(e) =>
                                                            handleDevicePropertySensitiveChange(index, e.target.checked)
                                                        }
                                                    />
                                                </label>
                                            ) : (
                                                <span className="dt-small dt-prop-inline-empty">-</span>
                                            )}

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
                                        className="dt-btn dt-btn-xs dt-btn-outline"
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

                                    {genericProperties.length > 0 && (
                                        <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-generic dt-prop-row-header">
                                            <strong>Key</strong>
                                            <strong>Type</strong>
                                            <strong>Value</strong>
                                            <strong>Action</strong>
                                        </div>
                                    )}

                                    {genericProperties.map((p, index) => (
                                        <div
                                            key={`generic-prop-${index}`}
                                            className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-generic"
                                        >
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
                                        className="dt-btn dt-btn-xs dt-btn-outline"
                                        onClick={handleAddGenericProperty}
                                    >
                                        + Add generic property
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    className="dt-btn dt-btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? "Saving..." : "Save properties"}
                                </button>
                            </>
                        )}
                    </form>
                </section>
            )}

            <ErrorBanner message={error} />
            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
        </div>
    );
};

export default DeviceTypesPage;
