import { useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from "react";
import { DeviceType } from "@shared/types/device_type";
import { PropertyType, parseSavedPropertyMap } from "@shared/types/properties";
import {
    DEVICE_TYPE_WIDGET_KINDS,
    DeviceTypeDashboardWidget,
    DeviceTypeMqttTopic,
    DeviceTypeWidgetKind,
} from "@shared/types/device_type_mqtt";
import { MQTT_ACL_ACTIONS, MqttAclAction } from "@shared/constants/mqtt";
import { getDeviceTypes, updateDeviceType } from "../devices/deviceService";
import { getDefaultProperties } from "../admin/adminService";
import {
    DeviceTypePropertyEditorRow,
    buildDeviceTypePropertiesPayload,
    parseDashboardWidgets,
    parseDeviceTypePropertiesForm,
    parseMqttTopics,
} from "../deviceTypes/deviceTypeProperties";
import ErrorBanner from "../components/ErrorBanner";
import "../style/DeviceTypesPage.css";

type DeviceTypesTab = "list" | "create" | "properties";

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
    const [description, setDescription] = useState("");
    const [firmwareVersion, setFirmwareVersion] = useState("");
    const [firmwareFile, setFirmwareFile] = useState<File | null>(null);

    const [propertyRows, setPropertyRows] = useState<DeviceTypePropertyEditorRow[]>([]);
    const [mqttTopics, setMqttTopics] = useState<DeviceTypeMqttTopic[]>([]);
    const [dashboardWidgets, setDashboardWidgets] = useState<DeviceTypeDashboardWidget[]>([]);
    const [propertiesLoadedTypeId, setPropertiesLoadedTypeId] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const firmwareInputRef = useRef<HTMLInputElement | null>(null);

    const selectedDevice = useMemo(
        () => deviceTypes.find((d) => d.id === selectedTypeId) || null,
        [deviceTypes, selectedTypeId]
    );

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
                    visible: true,
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
        setDashboardWidgets(formState.dashboardWidgets);
        setPropertiesLoadedTypeId(device.id);
    };

    useEffect(() => {
        if (activeTab !== "properties" || !selectedDevice) return;
        if (propertiesLoadedTypeId === selectedDevice.id) return;

        loadEditFields(selectedDevice);
        loadPropertiesFields(selectedDevice);
    }, [activeTab, selectedDevice, propertiesLoadedTypeId]);

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
            formData.append("id", typeId);
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

        if (activeTab === "properties") {
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
                visible: true,
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
                        sensitive:
                            (patch.type || p.type) === PropertyType.STRING && !(patch.isGlobal ?? p.isGlobal)
                                ? Boolean(patch.sensitive ?? p.sensitive)
                                : false,
                        visible: patch.isGlobal ?? p.isGlobal ? true : patch.visible ?? p.visible,
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
                    visible: true,
                    sensitive: false,
                }));
            return [...prev, ...nextDefaults];
        });
        setDefaultsPickerOpen(false);
        setSelectedDefaultKeys([]);
    };

    const handleAddMqttTopic = () => {
        setMqttTopics((prev) => [
            ...prev,
            { key: "", label: "", topic: "", action: MQTT_ACL_ACTIONS.PUBLISH },
        ]);
    };

    const handleMqttTopicChange = (index: number, patch: Partial<DeviceTypeMqttTopic>) => {
        setMqttTopics((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleRemoveMqttTopic = (index: number) => {
        setMqttTopics((prev) => prev.filter((_, i) => i !== index));
    };

    const getMqttTopicsForType = (deviceTypeId: string, excludeIndex?: number): DeviceTypeMqttTopic[] => {
        if (deviceTypeId === selectedTypeId) {
            return mqttTopics.filter((topic, index) => index !== excludeIndex && topic.key.trim());
        }
        const deviceType = deviceTypes.find((dt) => dt.id === deviceTypeId);
        return deviceType ? parseMqttTopics(deviceType.mqttTopics) : [];
    };

    const handleMqttTopicLinkTypeChange = (index: number, deviceTypeId: string) => {
        setMqttTopics((prev) =>
            prev.map((row, i) =>
                i === index
                    ? {
                        ...row,
                        key: deviceTypeId ? "" : row.key,
                        label: deviceTypeId ? "" : row.label,
                        topic: deviceTypeId ? "" : row.topic,
                        linkedTopic: deviceTypeId
                            ? { deviceTypeId, topicKey: "" }
                            : undefined,
                    }
                    : row
            )
        );
    };

    const handleMqttTopicLinkedTopicChange = (index: number, topicKey: string) => {
        setMqttTopics((prev) =>
            prev.map((row, i) => {
                if (i !== index || !row.linkedTopic) return row;

                const linked = getMqttTopicsForType(row.linkedTopic.deviceTypeId, index)
                    .find((topic) => topic.key === topicKey);

                return {
                    ...row,
                    key: linked?.key || row.key,
                    label: linked?.label || "",
                    topic: linked?.topic || row.topic || "",
                    linkedTopic: {
                        ...row.linkedTopic,
                        topicKey,
                    },
                };
            })
        );
    };

    const handleAddDashboardWidget = () => {
        setDashboardWidgets((prev) => [
            ...prev,
            {
                id: "",
                label: "",
                kind: DEVICE_TYPE_WIDGET_KINDS.VALUE,
                topicKey: mqttTopics[0]?.key || "",
            },
        ]);
    };

    const handleDashboardWidgetChange = (index: number, patch: Partial<DeviceTypeDashboardWidget>) => {
        setDashboardWidgets((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleRemoveDashboardWidget = (index: number) => {
        setDashboardWidgets((prev) => prev.filter((_, i) => i !== index));
    };

    const handlePropertiesSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!selectedDevice) {
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
            const propertiesAreLoaded = propertiesLoadedTypeId === selectedDevice.id;
            const propertiesForSubmit = propertiesAreLoaded
                ? propertyRows
                : parseDeviceTypePropertiesForm(selectedDevice).properties;
            const mqttTopicsForSubmit = propertiesAreLoaded
                ? mqttTopics
                : parseMqttTopics(selectedDevice.mqttTopics);
            const dashboardWidgetsForSubmit = propertiesAreLoaded
                ? dashboardWidgets
                : parseDashboardWidgets(selectedDevice.dashboardWidgets);
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
            formData.append("mqttTopics", JSON.stringify(mqttTopicsForSubmit));
            formData.append("dashboardWidgets", JSON.stringify(dashboardWidgetsForSubmit));

            const response = await updateDeviceType(`/${selectedDevice.id}`, "PUT", formData);
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
                            <small className="dt-help-text">
                                Optional on creation. If no firmware file is uploaded, version will be set to 0.0.0.
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
                                Max 10MB. If omitted, an empty firmware placeholder will be created with version 0.0.0.
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

                        {!selectedDevice ? (
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
                                        <p>Use Global for type-level values shared by all devices.</p>
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
                                            <strong>Show</strong>
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

                                            {!p.isGlobal ? (
                                                <label className="dt-small dt-prop-inline-flag">
                                                    <input
                                                        className="dt-check"
                                                        type="checkbox"
                                                        checked={p.visible !== false}
                                                        onChange={(e) =>
                                                            handlePropertyChange(index, { visible: e.target.checked })
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

                                <div className="dt-form-group">
                                    <div className="dt-section-heading">
                                        <h3>MQTT topics</h3>
                                    </div>
                                    <p className="dt-help-text">
                                        Use placeholders to keep topics scoped: <code>{"{deviceCode}"}</code> for a
                                        specific device, <code>{"{ownerId}"}</code> for devices owned by the same user,
                                        and <code>{"{deviceTypeId}"}</code> for the device type.
                                    </p>

                                    {mqttTopics.length === 0 && (
                                        <p className="dt-empty">No MQTT topics. Add one.</p>
                                    )}

                                    {mqttTopics.length > 0 && (
                                        <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-mqtt dt-prop-row-header">
                                            <strong>Key</strong>
                                            <strong>Topic</strong>
                                            <strong>Link type</strong>
                                            <strong>Link topic</strong>
                                            <strong>Action</strong>
                                            <strong>Action</strong>
                                        </div>
                                    )}

                                    {mqttTopics.map((topic, index) => (
                                        <div
                                            key={`mqtt-topic-${index}`}
                                            className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-mqtt"
                                        >
                                            <input
                                                type="text"
                                                placeholder="relaySet"
                                                value={topic.key}
                                                disabled={Boolean(topic.linkedTopic)}
                                                onChange={(e) =>
                                                    handleMqttTopicChange(index, { key: e.target.value })
                                                }
                                            />
                                            <input
                                                type="text"
                                                placeholder="devices/{deviceCode}/commands/relay"
                                                value={topic.topic || ""}
                                                disabled={Boolean(topic.linkedTopic)}
                                                onChange={(e) =>
                                                    handleMqttTopicChange(index, { topic: e.target.value })
                                                }
                                            />
                                            <select
                                                value={topic.linkedTopic?.deviceTypeId || ""}
                                                onChange={(e) => handleMqttTopicLinkTypeChange(index, e.target.value)}
                                            >
                                                <option value="">No link</option>
                                                {deviceTypes.map((dt) => (
                                                    <option key={dt.id} value={dt.id}>
                                                        {dt.id}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                value={topic.linkedTopic?.topicKey || ""}
                                                disabled={!topic.linkedTopic?.deviceTypeId}
                                                onChange={(e) => handleMqttTopicLinkedTopicChange(index, e.target.value)}
                                            >
                                                <option value="">Select...</option>
                                                {getMqttTopicsForType(topic.linkedTopic?.deviceTypeId || "", index)
                                                    .map((linked) => (
                                                        <option key={linked.key} value={linked.key}>
                                                            {linked.key}
                                                        </option>
                                                    ))}
                                            </select>
                                            <select
                                                value={topic.action}
                                                onChange={(e) =>
                                                    handleMqttTopicChange(index, {
                                                        action: e.target.value as MqttAclAction,
                                                    })
                                                }
                                            >
                                                <option value={MQTT_ACL_ACTIONS.PUBLISH}>publish</option>
                                                <option value={MQTT_ACL_ACTIONS.SUBSCRIBE}>subscribe</option>
                                                <option value={MQTT_ACL_ACTIONS.ALL}>all</option>
                                            </select>
                                            <button
                                                type="button"
                                                className="dt-btn dt-btn-xs dt-btn-danger"
                                                onClick={() => handleRemoveMqttTopic(index)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        className="dt-btn dt-btn-xs dt-btn-outline"
                                        onClick={handleAddMqttTopic}
                                    >
                                        + Add MQTT topic
                                    </button>
                                </div>

                                <div className="dt-divider" />

                                <div className="dt-form-group">
                                    <div className="dt-section-heading">
                                        <h3>Dashboard widgets</h3>
                                        <p>Admin catalog</p>
                                    </div>

                                    {dashboardWidgets.length === 0 && (
                                        <p className="dt-empty">No widgets. Add one.</p>
                                    )}

                                    {dashboardWidgets.length > 0 && (
                                        <div className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-widget dt-prop-row-header">
                                            <strong>ID</strong>
                                            <strong>Label</strong>
                                            <strong>Kind</strong>
                                            <strong>Topic</strong>
                                            <strong>Publish value</strong>
                                            <strong>Action</strong>
                                        </div>
                                    )}

                                    {dashboardWidgets.map((widget, index) => (
                                        <div
                                            key={`dashboard-widget-${index}`}
                                            className="dt-prop-row dt-prop-row-inline dt-prop-row-inline-widget"
                                        >
                                            <input
                                                type="text"
                                                placeholder="relayButton"
                                                value={widget.id}
                                                onChange={(e) =>
                                                    handleDashboardWidgetChange(index, { id: e.target.value })
                                                }
                                            />
                                            <input
                                                type="text"
                                                placeholder="Relay ON"
                                                value={widget.label}
                                                onChange={(e) =>
                                                    handleDashboardWidgetChange(index, { label: e.target.value })
                                                }
                                            />
                                            <select
                                                value={widget.kind}
                                                onChange={(e) =>
                                                    handleDashboardWidgetChange(index, {
                                                        kind: e.target.value as DeviceTypeWidgetKind,
                                                    })
                                                }
                                            >
                                                <option value={DEVICE_TYPE_WIDGET_KINDS.TEXT}>text</option>
                                                <option value={DEVICE_TYPE_WIDGET_KINDS.VALUE}>value</option>
                                                <option value={DEVICE_TYPE_WIDGET_KINDS.SWITCH}>switch</option>
                                                <option value={DEVICE_TYPE_WIDGET_KINDS.INPUT}>input</option>
                                                <option value={DEVICE_TYPE_WIDGET_KINDS.BUTTON}>button</option>
                                            </select>
                                            <select
                                                value={widget.topicKey}
                                                onChange={(e) =>
                                                    handleDashboardWidgetChange(index, { topicKey: e.target.value })
                                                }
                                            >
                                                <option value="">Select topic...</option>
                                                {mqttTopics.map((topic) => (
                                                    <option key={topic.key} value={topic.key}>
                                                        {topic.key}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="1 / true / on"
                                                value={
                                                    typeof widget.publishValue === "undefined"
                                                        ? ""
                                                        : String(widget.publishValue)
                                                }
                                                onChange={(e) =>
                                                    handleDashboardWidgetChange(index, {
                                                        publishValue: e.target.value,
                                                    })
                                                }
                                                disabled={widget.kind !== DEVICE_TYPE_WIDGET_KINDS.BUTTON}
                                            />
                                            <button
                                                type="button"
                                                className="dt-btn dt-btn-xs dt-btn-danger"
                                                onClick={() => handleRemoveDashboardWidget(index)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        className="dt-btn dt-btn-xs dt-btn-outline"
                                        onClick={handleAddDashboardWidget}
                                    >
                                        + Add widget
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

            <ErrorBanner message={error} />
            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
        </div>
    );
};

export default DeviceTypesPage;
