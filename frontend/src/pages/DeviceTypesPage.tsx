import { useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from "react";
import { DeviceType } from "@shared/types/device_type";
import { PropertyType, parseSavedPropertyMap } from "@shared/types/properties";
import { DeviceTypeMqttTopic, getMqttTopicPlaceholderError, withDefaultDeviceTypeMqttTopics } from "@shared/types/device_type_mqtt";
import { MQTT_AVAILABILITY_TOPIC } from "@shared/constants/mqtt";
import { getDeviceTypes, updateDeviceType } from "../devices/deviceService";
import { getDefaultProperties } from "../admin/adminService";
import {
    DeviceTypePropertyEditorRow,
    buildDeviceTypePropertiesPayload,
    parseDeviceTypePropertiesForm,
    parseMqttTopics,
} from "../deviceTypes/deviceTypeProperties";
import MqttTopicInfo from "../deviceTypes/MqttTopicInfo";
import DeviceTypeMqttTopicsEditor from "../deviceTypes/DeviceTypeMqttTopicsEditor";
import DeviceTypeWidgetsEditor from "../deviceTypes/DeviceTypeWidgetsEditor";
import ErrorBanner from "../components/ErrorBanner";
import { apiFetchWithAuth } from "../api/apiClient";
import "../style/DeviceTypesPage.css";

type DeviceTypesTab = "list" | "create" | "properties" | "mqtt" | "widgets";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const DeviceTypesPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<DeviceTypesTab>("list");

    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [defaultProperties, setDefaultProperties] = useState<DeviceTypePropertyEditorRow[]>([]);
    const [defaultsPickerOpen, setDefaultsPickerOpen] = useState(false);
    const [selectedDefaultKeys, setSelectedDefaultKeys] = useState<string[]>([]);
    const [selectedTypeId, setSelectedTypeId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [typeId, setTypeId] = useState("");
    const [cloneFromTypeId, setCloneFromTypeId] = useState("");
    const [createMqttEnabled, setCreateMqttEnabled] = useState(false);
    const [description, setDescription] = useState("");
    const [firmwareVersion, setFirmwareVersion] = useState("");
    const [firmwareFile, setFirmwareFile] = useState<File | null>(null);

    const [propertyRows, setPropertyRows] = useState<DeviceTypePropertyEditorRow[]>([]);
    const [mqttTopics, setMqttTopics] = useState<DeviceTypeMqttTopic[]>([]);
    const [mqttEnabled, setMqttEnabled] = useState(false);
    const [propertiesLoadedTypeId, setPropertiesLoadedTypeId] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const firmwareInputRef = useRef<HTMLInputElement | null>(null);

    const selectedType = useMemo(
        () => deviceTypes.find((d) => d.id === selectedTypeId) || null,
        [deviceTypes, selectedTypeId]
    );

    const mqttPlaceholderError = mqttTopics.map((topic) => getMqttTopicPlaceholderError(topic.topic || "")).find(Boolean);

    const defaultPropertiesWithStatus = useMemo(() => {
        const existingKeys = new Set(propertyRows.map((row) => row.key.trim()).filter(Boolean));
        return defaultProperties.map((row) => ({
            ...row,
            alreadyAdded: existingKeys.has(row.key.trim()),
        }));
    }, [defaultProperties, propertyRows]);

    const selectableDefaultKeys = useMemo(
        () => defaultPropertiesWithStatus
            .filter((row) => !row.alreadyAdded)
            .map((row) => row.key),
        [defaultPropertiesWithStatus]
    );

    const fetchDeviceTypes = async () => {
        try {
            setLoading(true);
            setError(null);
            const [data, defaults] = await Promise.all([getDeviceTypes(), getDefaultProperties()]);
            setDeviceTypes(data);
            setDefaultProperties(
                Object.entries(parseSavedPropertyMap(defaults)).map(([key, entry]) => ({
                    key,
                    label: entry.label || "",
                    type: entry.type,
                    global: Boolean(entry.global),
                    value: String(entry.value),
                    sensitive: false,
                    isGlobal: Boolean(entry.global),
                }))
            );
            if (selectedTypeId && !data.some((d) => d.id === selectedTypeId)) {
                setSelectedTypeId("");
                setPropertiesLoadedTypeId("");
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
        setCloneFromTypeId("");
        setCreateMqttEnabled(false);
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
        const formState = parseDeviceTypePropertiesForm(device);
        setPropertyRows(formState.properties);
        setMqttTopics(formState.mqttTopics);
        setMqttEnabled(Boolean(device.mqtt_enabled));
        setPropertiesLoadedTypeId(device.id);
    };

    useEffect(() => {
        if ((activeTab !== "properties" && activeTab !== "mqtt") || !selectedType) return;
        if (propertiesLoadedTypeId === selectedType.id) return;

        loadEditFields(selectedType);
        loadPropertiesFields(selectedType);
    }, [activeTab, selectedType, propertiesLoadedTypeId]);

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
        if (submitting) return;
        setError(null);
        setSuccessMessage(null);

        if (!typeId.trim()) {
            setError("Type ID is required.");
            return;
        }

        if (firmwareFile) {
            const fwError = validateFirmwareVersion(firmwareVersion);
            if (fwError) {
                setError(fwError);
                return;
            }
        }

        try {
            setSubmitting(true);
            const formData = new FormData();
            formData.append("id", typeId.trim());
            if (cloneFromTypeId) formData.append("clone_from_type_id", cloneFromTypeId);
            else formData.append("mqtt_enabled", String(createMqttEnabled));
            formData.append("description", description);
            if (firmwareFile) {
                formData.append("firmware_version", firmwareVersion);
                formData.append("firmware_build", firmwareFile);
            }

            await updateDeviceType("", "POST", formData);
            setSuccessMessage("Operation completed successfully.");
            resetCreateForm();
            await fetchDeviceTypes();
            setActiveTab("list");
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

    const handlePropertiesAction = (device: DeviceType) => {
        setSelectedTypeId(device.id);
        loadEditFields(device);
        loadPropertiesFields(device);
        setActiveTab("properties");
        setError(null);
        setSuccessMessage(null);
    };

    const handleSelectedTypeChange = (value: string) => {
        setSelectedTypeId(value);
        const device = deviceTypes.find((d) => d.id === value);
        if (!device) {
            setPropertiesLoadedTypeId("");
            return;
        }

        if (activeTab === "properties" || activeTab === "mqtt") {
            loadEditFields(device);
            loadPropertiesFields(device);
        }
    };

    const handleAddProperty = (isGlobal: boolean) => {
        setPropertyRows((prev) => [
            ...prev,
            {
                key: "",
                label: "",
                type: PropertyType.STRING,
                sensitive: false,
                notNull: true,
                value: "",
                isGlobal,
            },
        ]);
    };

    const handlePropertyChange = (index: number, patch: Partial<DeviceTypePropertyEditorRow>) => {
        setPropertyRows((prev) =>
            prev.map((p, i) =>
                i === index
                    ? {
                        ...p,
                        ...patch,
                        value:
                            patch.type === PropertyType.BOOL && p.type !== PropertyType.BOOL
                                ? "false"
                                : patch.type && p.type === PropertyType.BOOL
                                    ? ""
                                    : patch.value ?? p.value,
                        notNull:
                            (patch.type || p.type) === PropertyType.BOOL
                                ? true
                                : patch.notNull ?? p.notNull,
                        sensitive:
                            (patch.type || p.type) === PropertyType.STRING && !(patch.isGlobal ?? p.isGlobal)
                                ? Boolean(patch.sensitive ?? p.sensitive)
                                : false,
                    }
                    : p
            )
        );
    };

    const handleRemoveProperty = (index: number) => {
        setPropertyRows((prev) => prev.filter((_, i) => i !== index));
    };

    const handleOpenDefaultPropertiesPicker = () => {
        if (defaultProperties.length === 0) {
            setError("No default properties are defined.");
            return;
        }
        setSelectedDefaultKeys([]);
        setDefaultsPickerOpen(true);
    };

    const handleToggleDefaultSelection = (key: string, selected: boolean) => {
        setSelectedDefaultKeys((prev) => {
            if (selected) {
                return prev.includes(key) ? prev : [...prev, key];
            }
            return prev.filter((selectedKey) => selectedKey !== key);
        });
    };

    const handleSelectAllDefaultProperties = () => {
        setSelectedDefaultKeys(selectableDefaultKeys);
    };

    const handleClearDefaultSelection = () => {
        setSelectedDefaultKeys([]);
    };

    const handleImportSelectedDefaultProperties = () => {
        const selectedKeys = new Set(selectedDefaultKeys);
        if (selectedKeys.size === 0) {
            setError("Select at least one default property.");
            return;
        }
        setPropertyRows((prev) => {
            const existingKeys = new Set(prev.map((row) => row.key.trim()).filter(Boolean));
            const nextDefaults = defaultProperties
                .filter((row) => selectedKeys.has(row.key) && !existingKeys.has(row.key.trim()))
                .map((row) => ({
                    ...row,
                    isGlobal: Boolean(row.global),
                    notNull: true,
                    sensitive: false,
                }));
            return [...prev, ...nextDefaults];
        });
        setDefaultsPickerOpen(false);
        setSelectedDefaultKeys([]);
    };

    const handlePropertiesSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedType) {
            setError("Select a device type to update properties.");
            return;
        }

        if (!firmwareVersion.trim()) {
            setError("Firmware version is required.");
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
            const propertiesAreLoaded = propertiesLoadedTypeId === selectedType.id;
            const propertiesForSubmit = propertiesAreLoaded
                ? propertyRows
                : parseDeviceTypePropertiesForm(selectedType).properties;
            const payload = buildDeviceTypePropertiesPayload(propertiesForSubmit);

            if (!payload.ok) {
                setError(payload.error);
                return;
            }

            formData.append("description", description);
            formData.append("firmware_version", firmwareVersion);
            if (firmwareFile) {
                formData.append("firmware_build", firmwareFile);
            }
            formData.append("deviceProperties", JSON.stringify(payload.deviceProperties));
            formData.append("genericProperties", JSON.stringify(payload.genericProperties));

            const response = await updateDeviceType(`/${selectedType.id}`, "PUT", formData);
            const updated = await response.json().catch(() => null) as DeviceType | null;
            if (updated) {
                loadEditFields(updated);
                loadPropertiesFields(updated);
            }

            setSuccessMessage("Properties updated successfully.");
            await fetchDeviceTypes();
        } catch (err: any) {
            setError(err.error || "Unexpected error while saving properties.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleMqttSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedType) return;
        if (mqttEnabled && mqttPlaceholderError) { setError(mqttPlaceholderError); return; }
        setError(null);
        setSuccessMessage(null);
        setSubmitting(true);
        try {
            const updated = await apiFetchWithAuth<DeviceType>(
                "/device-types/" + encodeURIComponent(selectedType.id) + "/mqtt",
                { method: "PUT", body: JSON.stringify({ mqtt_enabled: mqttEnabled, mqttTopics }) }
            );
            setDeviceTypes((types) => types.map((type) => type.id === updated.id ? updated : type));
            setMqttEnabled(Boolean(updated.mqtt_enabled));
            setMqttTopics(parseMqttTopics(updated.mqttTopics));
            setSuccessMessage("MQTT configuration saved.");
        } catch (failure: any) {
            setError(failure?.error || "Could not save MQTT configuration.");
        } finally { setSubmitting(false); }
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
                    className={`dt-btn ${activeTab === "properties" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("properties")}
                >
                    Properties
                </button>
                <button type="button" className={`dt-btn ${activeTab === "mqtt" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("mqtt")}>
                    MQTT
                </button>
                <button type="button" className={`dt-btn ${activeTab === "widgets" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("widgets")}>
                    Widgets
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
                                        <tr
                                            key={dt.id}
                                            className="dt-clickable-row"
                                            tabIndex={0}
                                            onClick={() => handlePropertiesAction(dt)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    handlePropertiesAction(dt);
                                                }
                                            }}
                                        >
                                            <td>{dt.id}</td>
                                            <td>{dt.description}</td>
                                            <td>{dt.firmware_version}</td>
                                            <td>{dt.created_at}</td>
                                            <td>
                                                <div className="dt-actions">
                                                    <button
                                                        type="button"
                                                        className="dt-btn dt-btn-xs dt-btn-danger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(dt);
                                                        }}
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
                            <label htmlFor="clone-from-type">Clone from Device Type (optional)</label>
                            <select id="clone-from-type" value={cloneFromTypeId} disabled={submitting} onChange={(event) => {
                                setCloneFromTypeId(event.target.value);
                                const source = deviceTypes.find((type) => type.id === event.target.value);
                                setDescription(source?.description || "");
                                setFirmwareVersion(source?.firmware_version || "");
                                setFirmwareFile(null);
                                if (firmwareInputRef.current) firmwareInputRef.current.value = "";
                            }}>
                                <option value="">Create an empty Device Type</option>
                                {deviceTypes.map((type) => <option key={type.id} value={type.id}>{type.id} — {type.description || ""}</option>)}
                            </select>
                            <small className="dt-help-text">Copies properties, firmware, MQTT configuration and widgets into an independent type. Enter a new Type ID.</small>
                        </div>
                        {!cloneFromTypeId && <label className="dt-checkbox">
                            <input type="checkbox" checked={createMqttEnabled} disabled={submitting} onChange={(event) => setCreateMqttEnabled(event.target.checked)} />
                            Enable MQTT and create telemetry / commands topics
                        </label>}
                        <div className="dt-form-group">
                            <label htmlFor="type-id">Type ID</label>
                            <input
                                id="type-id"
                                required
                                disabled={submitting}
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
                            <small className="dt-help-text">
                                {cloneFromTypeId ? "Without a new file, the source firmware and version are copied." : "Optional on creation. Without a firmware file, version is 0.0.0."}
                            </small>
                        </div>

                        <div className="dt-form-group">
                            <label htmlFor="firmwareFile">
                                Firmware file <span className="dt-chip">optional</span>
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
                                {cloneFromTypeId ? "Max 10MB. Upload only to replace the source firmware in the new type." : "Max 10MB. If omitted, an empty firmware placeholder is created with version 0.0.0."}
                            </small>
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

                        {!selectedType ? (
                            <p className="dt-empty">Select a device type to edit properties.</p>
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

                                <div className="dt-divider" />

                                <div className="dt-form-group">
                                    <div className="dt-section-heading">
                                        <h3>Properties</h3>
                                        <p>Global values are shared by all devices and hidden in device details. All other properties are always shown.</p>
                                    </div>

                                    {propertyRows.length === 0 && (
                                        <p className="dt-empty">No properties. Add one.</p>
                                    )}

                                    {propertyRows.length > 0 && (
                                        <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-combined dt-prop-row-header">
                                            <strong>Global</strong>
                                            <strong>Key</strong>
                                            <strong>Label</strong>
                                            <strong>Type</strong>
                                            <strong>Default value</strong>
                                            <strong>Not null</strong>
                                            <strong>Encrypt</strong>
                                            <strong>Action</strong>
                                        </div>
                                    )}

                                    {propertyRows.map((p, index) => (
                                        <div
                                            key={`property-${index}`}
                                            className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-combined"
                                        >
                                            <label className="dt-small dt-prop-inline-flag">
                                                <input
                                                    className="dt-check"
                                                    type="checkbox"
                                                    checked={p.isGlobal}
                                                    onChange={(e) =>
                                                        handlePropertyChange(index, { isGlobal: e.target.checked })
                                                    }
                                                />
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Key (e.g. maxTemp)"
                                                value={p.key}
                                                onChange={(e) => handlePropertyChange(index, { key: e.target.value })}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Readable name"
                                                value={p.label || ""}
                                                onChange={(e) => handlePropertyChange(index, { label: e.target.value })}
                                            />

                                            <select
                                                value={p.type}
                                                onChange={(e) =>
                                                    handlePropertyChange(index, {
                                                        type: e.target.value as PropertyType,
                                                    })
                                                }
                                            >
                                                <option value={PropertyType.STRING}>string</option>
                                                <option value={PropertyType.INT}>int</option>
                                                <option value={PropertyType.UINT}>uint</option>
                                                <option value={PropertyType.FLOAT}>float</option>
                                                <option value={PropertyType.BOOL}>bool</option>
                                            </select>

                                            {p.type === PropertyType.BOOL ? (
                                                <label className="dt-small dt-prop-inline-flag">
                                                    <input
                                                        className="dt-check"
                                                        type="checkbox"
                                                        checked={p.value === "true"}
                                                        onChange={(e) =>
                                                            handlePropertyChange(index, {
                                                                value: e.target.checked ? "true" : "false",
                                                            })
                                                        }
                                                    />
                                                </label>
                                            ) : (
                                                <input
                                                    type={p.type === PropertyType.STRING ? "text" : "number"}
                                                    min={p.type === PropertyType.UINT ? 0 : undefined}
                                                    step={p.type === PropertyType.FLOAT ? "any" : 1}
                                                    placeholder={p.isGlobal ? "Value" : "Optional default"}
                                                    value={p.value}
                                                    onChange={(e) =>
                                                        handlePropertyChange(index, { value: e.target.value })
                                                    }
                                                />
                                            )}

                                            {!p.isGlobal && p.type !== PropertyType.BOOL ? (
                                                <label className="dt-small dt-prop-inline-flag">
                                                    <input
                                                        className="dt-check"
                                                        type="checkbox"
                                                        checked={p.notNull !== false}
                                                        onChange={(e) =>
                                                            handlePropertyChange(index, { notNull: e.target.checked })
                                                        }
                                                    />
                                                </label>
                                            ) : (
                                                <span className="dt-small dt-prop-inline-empty">-</span>
                                            )}

                                            {!p.isGlobal && p.type === PropertyType.STRING ? (
                                                <label className="dt-small dt-prop-inline-flag">
                                                    <input
                                                        className="dt-check"
                                                        type="checkbox"
                                                        checked={Boolean(p.sensitive)}
                                                        onChange={(e) =>
                                                            handlePropertyChange(index, { sensitive: e.target.checked })
                                                        }
                                                    />
                                                </label>
                                            ) : (
                                                <span className="dt-small dt-prop-inline-empty">-</span>
                                            )}

                                            <button
                                                type="button"
                                                className="dt-btn dt-btn-xs dt-btn-danger"
                                                onClick={() => handleRemoveProperty(index)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}

                                    <div className="dt-actions">
                                        <span className="dt-action-prefix">Add:</span>
                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-xs dt-btn-outline"
                                            onClick={() => handleAddProperty(false)}
                                        >
                                            Device property
                                        </button>
                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-xs dt-btn-outline"
                                            onClick={() => handleAddProperty(true)}
                                        >
                                            Global property
                                        </button>
                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-xs dt-btn-outline"
                                            onClick={handleOpenDefaultPropertiesPicker}
                                        >
                                            Catalog property
                                        </button>
                                    </div>
                                </div>

                                <div className="dt-divider" />

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

            {activeTab === "mqtt" && (
                <section className="dt-card dt-form-card">
                    <div className="mqtt-heading">
                        <h2>Device Type MQTT access</h2>
                        <MqttTopicInfo />
                    </div>
                    <form className="dt-form" onSubmit={handleMqttSubmit}>
                        <div className="dt-form-group">
                            <label htmlFor="mqtt-type-select">Device type</label>
                            <select id="mqtt-type-select" value={selectedTypeId}
                                onChange={(event) => handleSelectedTypeChange(event.target.value)}>
                                <option value="">Select…</option>
                                {deviceTypes.map((type) => <option value={type.id} key={type.id}>{type.id}</option>)}
                            </select>
                        </div>
                        {selectedType && <>
                            <label className="dt-checkbox" htmlFor="type-mqtt-enabled">
                                <input id="type-mqtt-enabled" type="checkbox" checked={mqttEnabled}
                                    onChange={(event) => {
                                        const enabled = event.target.checked;
                                        setMqttEnabled(enabled);
                                        if (enabled && !selectedType.mqtt_enabled) setMqttTopics((topics) => withDefaultDeviceTypeMqttTopics(topics));
                                    }} />
                                Enable MQTT for this device type
                            </label>
                            <div className="dt-form-group">
                                <h3>Built-in availability</h3>
                                <div className="dt-table-wrapper">
                                <table className="dt-table">
                                    <thead><tr><th>Key</th><th>Purpose</th><th>Device publishes to</th></tr></thead>
                                    <tbody><tr>
                                        <td>{MQTT_AVAILABILITY_TOPIC.key}</td><td>{MQTT_AVAILABILITY_TOPIC.label}</td><td><code className="mqtt-topic-template">{MQTT_AVAILABILITY_TOPIC.topic}</code></td>
                                    </tr></tbody>
                                </table>
                                </div>
                            </div>
                            <fieldset className="mqtt-settings-fields" disabled={!mqttEnabled || submitting}>
                                <div className="dt-form-group">
                                    <div className="dt-section-heading">
                                        <h3>MQTT topics</h3>
                                    </div>
                                    <DeviceTypeMqttTopicsEditor topics={mqttTopics} deviceTypes={deviceTypes}
                                        deviceTypeId={selectedTypeId} onChange={setMqttTopics} />
                                </div>
                            </fieldset>
                            <button type="submit" className="dt-btn dt-btn-primary" disabled={submitting || (mqttEnabled && Boolean(mqttPlaceholderError))}>
                                {submitting ? "Saving…" : "Save MQTT configuration"}
                            </button>
                        </>}
                    </form>
                </section>
            )}

            {activeTab === "widgets" && (
                <section className="dt-card dt-form-card">
                    <h2>Device Type widgets</h2>
                    <p>Widgets defined here apply to every device of this type, including new devices.</p>
                    <div className="dt-form-group">
                        <label htmlFor="widgets-type-select">Device type</label>
                        <select id="widgets-type-select" value={selectedTypeId} onChange={(event) => handleSelectedTypeChange(event.target.value)}>
                            <option value="">Select a device type</option>
                            {deviceTypes.map((type) => <option key={type.id} value={type.id}>{type.id}</option>)}
                        </select>
                    </div>
                    {selectedType && <DeviceTypeWidgetsEditor key={selectedType.id} deviceTypeId={selectedType.id}
                        onError={setError} onSaved={setSuccessMessage} />}
                </section>
            )}

            {defaultsPickerOpen && (
                <div className="dt-modal-backdrop" role="presentation">
                    <section
                        className="dt-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="default-properties-picker-title"
                    >
                        <div className="dt-modal-header">
                            <div>
                                <h2 id="default-properties-picker-title">Add catalog defaults</h2>
                                <p>Select the default properties to add to this device type.</p>
                            </div>
                            <button
                                type="button"
                                className="dt-btn dt-btn-outline"
                                onClick={() => setDefaultsPickerOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        <div className="dt-modal-actions">
                            <button
                                type="button"
                                className="dt-btn dt-btn-outline"
                                onClick={handleSelectAllDefaultProperties}
                                disabled={selectableDefaultKeys.length === 0}
                            >
                                Select available
                            </button>
                            <button
                                type="button"
                                className="dt-btn dt-btn-outline"
                                onClick={handleClearDefaultSelection}
                                disabled={selectedDefaultKeys.length === 0}
                            >
                                Clear
                            </button>
                        </div>

                        <div className="dt-default-picker-list">
                            {defaultPropertiesWithStatus.length === 0 ? (
                                <p className="dt-empty">No default properties are defined.</p>
                            ) : (
                                defaultPropertiesWithStatus.map((property) => (
                                    <label
                                        key={property.key}
                                        className={`dt-default-picker-row ${
                                            property.alreadyAdded ? "is-disabled" : ""
                                        }`}
                                    >
                                        <input
                                            className="dt-check"
                                            type="checkbox"
                                            checked={selectedDefaultKeys.includes(property.key)}
                                            disabled={property.alreadyAdded}
                                            onChange={(e) =>
                                                handleToggleDefaultSelection(property.key, e.target.checked)
                                            }
                                        />
                                        <span className="dt-default-picker-main">
                                            <strong>{property.key}</strong>
                                            <small>
                                                {property.label ? `${property.label} | ` : ""}
                                                {property.type} | {property.global ? "Global" : "Device"} | Default: {property.value || "-"}
                                                {property.alreadyAdded ? " | Already added" : ""}
                                            </small>
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>

                        <div className="dt-modal-footer">
                            <span className="dt-small">{selectedDefaultKeys.length} selected</span>
                            <button
                                type="button"
                                className="dt-btn dt-btn-primary"
                                onClick={handleImportSelectedDefaultProperties}
                                disabled={selectedDefaultKeys.length === 0}
                            >
                                Add selected
                            </button>
                        </div>
                    </section>
                </div>
            )}

            <ErrorBanner message={error} onDismiss={() => setError(null)} />
            <ErrorBanner
                message={successMessage}
                variant="success"
                onDismiss={() => setSuccessMessage(null)}
            />
        </div>
    );
};

export default DeviceTypesPage;
