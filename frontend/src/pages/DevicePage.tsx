import { useEffect, useMemo, useState, FormEvent } from "react";
import {
    getDeviceTypes,
    getDevices,
    createDevice,
    deleteDevice,
    updateDeviceProperties,
    getDeviceShares,
    shareDeviceByEmail,
    removeDeviceShare,
    revokeDeviceShareInvitation,
    getMqttAclRules,
    upsertMqttAclRule,
    deleteMqttAclRule,
    revokeDeviceOwnership,
} from "../devices/deviceService";
import { DeviceType } from "@shared/types/device_type";
import { DeviceShareInvitationRow, DeviceShareRow, DeviceWithRelations } from "@shared/types/device";
import { useAuth } from "../auth/AuthContext";
import {
    PropertyType,
    PropertyRow,
    SavedProperties,
} from "@shared/types/properties";
import { ROLES } from "@shared/constants/auth";
import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
    MqttAclAction,
    MqttAclPermission,
} from "@shared/constants/mqtt";
import { MqttAclRule } from "@shared/types/mqtt";
import "../style/DevicePage.css";

type DevicePropertyRow = PropertyRow & { value: string };

const parseTypeProperties = (raw: unknown): Record<string, PropertyType> => {
    if (!raw) return {};
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return obj as Record<string, PropertyType>;
        }
    } catch (e) {
        console.error("Could not parse type_deviceProperties", e);
    }
    return {};
};

const parseDeviceProperties = (raw: unknown): SavedProperties => {
    if (!raw) return {};
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return obj as SavedProperties;
        }
    } catch (e) {
        console.error("Could not parse device_properties", e);
    }
    return {};
};

const buildPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const typeProps = parseTypeProperties(device.type_deviceProperties);
    const devProps = parseDeviceProperties(device.device_properties);

    return Object.entries(typeProps).map(([key, type]) => {
        const savedProp = devProps[key];
        return {
            key,
            type,
            value: savedProp ? String(savedProp.value) : "",
        };
    });
};

const buildGenericPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const genericProps = parseDeviceProperties(device.type_genericProperties);
    return Object.entries(genericProps).map(([key, saved]) => ({
        key,
        type: saved.type,
        value: String(saved.value),
    }));
};

const formatDateTime = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
};

const castValueForType = (
    row: DevicePropertyRow
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

const DevicesPage: React.FC = () => {
    const { user } = useAuth();
    const canCreateDevice = user?.role === ROLES.ADMIN;
    const isAdmin = canCreateDevice;
    const canViewSecurity = isAdmin;
    const canManageSecurity = isAdmin;

    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [code, setCode] = useState("");
    const [deviceTypeId, setDeviceTypeId] = useState<string | "">("");
    const [ownerEmail, setOwnerEmail] = useState("");
    const [activated, setActivated] = useState(false);

    const [selectedDevice, setSelectedDevice] = useState<DeviceWithRelations | null>(null);
    const [propertyRows, setPropertyRows] = useState<DevicePropertyRow[]>([]);
    const [genericPropertyRows, setGenericPropertyRows] = useState<DevicePropertyRow[]>([]);
    const [savingProps, setSavingProps] = useState(false);

    const [aclRules, setAclRules] = useState<MqttAclRule[]>([]);
    const [aclLoading, setAclLoading] = useState(false);
    const [aclSaving, setAclSaving] = useState(false);
    const [aclAction, setAclAction] = useState<MqttAclAction>(MQTT_ACL_ACTIONS.PUBLISH);
    const [aclPermission, setAclPermission] = useState<MqttAclPermission>(MQTT_ACL_PERMISSION.ALLOW);
    const [aclTopicPattern, setAclTopicPattern] = useState("");
    const [aclPriority, setAclPriority] = useState("100");

    const [deviceShares, setDeviceShares] = useState<DeviceShareRow[]>([]);
    const [shareInvitations, setShareInvitations] = useState<DeviceShareInvitationRow[]>([]);
    const [sharingLoading, setSharingLoading] = useState(false);
    const [sharingSaving, setSharingSaving] = useState(false);
    const [shareEmail, setShareEmail] = useState("");
    const [shareCanWrite, setShareCanWrite] = useState(false);

    const [activeTab, setActiveTab] = useState<"create" | "list">("list");

    const isSelectedDeviceOwner = Boolean(
        selectedDevice && user && Number(selectedDevice.owner_id) === Number(user.id)
    );
    const canManageSharing = Boolean(selectedDevice && (isAdmin || isSelectedDeviceOwner));
    const canEditSelectedDevice = Boolean(
        selectedDevice && (isAdmin || isSelectedDeviceOwner || Number(selectedDevice.can_write) === 1)
    );

    const kpis = useMemo(() => {
        const total = devices.length;
        const active = devices.filter((d) => Boolean(d.activated)).length;
        const owned = devices.filter((d) => !d.is_shared).length;
        return { total, active, owned, types: deviceTypes.length };
    }, [devices, deviceTypes]);

    const fetchAll = async () => {
        try {
            setLoading(true);
            setError(null);
            const [types, devs] = await Promise.all([getDeviceTypes(), getDevices()]);
            setDeviceTypes(types);
            setDevices(devs);
        } catch (err: any) {
            setError(err?.error || "Unexpected error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, [isAdmin]);

    useEffect(() => {
        if (!canCreateDevice && activeTab === "create") {
            setActiveTab("list");
        }
    }, [canCreateDevice, activeTab]);

    const loadAclForDevice = async (deviceCode: string) => {
        try {
            setAclLoading(true);
            const rules = await getMqttAclRules(deviceCode);
            setAclRules(rules);
        } catch (err: any) {
            setError(err?.error || "Error loading MQTT ACL.");
        } finally {
            setAclLoading(false);
        }
    };

    const loadSharesForDevice = async (deviceCode: string) => {
        try {
            setSharingLoading(true);
            const payload = await getDeviceShares(deviceCode);
            setDeviceShares(payload.shares || []);
            setShareInvitations(payload.invitations || []);
        } catch (err: any) {
            setError(err?.error || "Error loading device sharing.");
            setDeviceShares([]);
            setShareInvitations([]);
        } finally {
            setSharingLoading(false);
        }
    };

    const resetNewDeviceForm = () => {
        setCode("");
        setDeviceTypeId("");
        setOwnerEmail("");
        setActivated(false);
    };

    const handleCreateDevice = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!code.trim() || !deviceTypeId) {
            setError("Fill at least code and device type.");
            return;
        }

        try {
            await createDevice({
                code: code.trim(),
                device_type_id: deviceTypeId,
                owner_email: ownerEmail.trim() || undefined,
                activated,
            });
            setSuccessMessage("Device created successfully.");
            resetNewDeviceForm();
            await fetchAll();
            setActiveTab("list");
        } catch (err: any) {
            setError(err?.error || "Error while creating device.");
        }
    };

    const handleOpenProperties = async (device: DeviceWithRelations) => {
        setSelectedDevice(device);
        setSuccessMessage(null);
        setError(null);
        setPropertyRows(buildPropertyRows(device));
        setGenericPropertyRows(buildGenericPropertyRows(device));
        setShareEmail("");
        setShareCanWrite(false);

        if (canManageSecurity) {
            await Promise.all([
                loadAclForDevice(device.code),
                loadSharesForDevice(device.code),
            ]);
        } else {
            setAclRules([]);
            await loadSharesForDevice(device.code);
        }
    };

    const handleDeleteDevice = async (device: DeviceWithRelations) => {
        if (!window.confirm(`Are you sure to delete device code: "${device.code}"?`)) return;

        setSuccessMessage(null);
        setError(null);

        try {
            await deleteDevice(device.code);
            setSuccessMessage("Device deleted correctly");
            await fetchAll();
            if (selectedDevice?.code === device.code) {
                setSelectedDevice(null);
                setPropertyRows([]);
                setGenericPropertyRows([]);
            }
        } catch (err: any) {
            setError(err?.error || "Error while deleting device.");
        }
    };

    const handleRevokeOwnership = async (device: DeviceWithRelations) => {
        if (!isAdmin) return;
        const ownerEmailInput = window.prompt(
            `Insert owner email for device "${device.code}":`,
            device.owner_email || ""
        );
        if (ownerEmailInput === null) return;

        const ownerEmail = ownerEmailInput.trim().toLowerCase();
        const deviceCodeInput = window.prompt(
            "Insert device code to confirm revoke:",
            device.code
        );
        if (deviceCodeInput === null) return;
        const deviceCode = deviceCodeInput.trim();

        if (!ownerEmail || !deviceCode) {
            setError("Owner email and device code are required.");
            return;
        }

        if (!window.confirm(`Revoke ownership for "${deviceCode}" from "${ownerEmail}"?`)) {
            return;
        }

        setSuccessMessage(null);
        setError(null);
        try {
            await revokeDeviceOwnership({ deviceCode, ownerEmail });
            setSuccessMessage(`Ownership revoked for device ${deviceCode}.`);
            await fetchAll();
            if (selectedDevice?.code === device.code) {
                setSelectedDevice(null);
                setPropertyRows([]);
                setGenericPropertyRows([]);
            }
        } catch (err: any) {
            setError(err?.error || "Error while revoking ownership.");
        }
    };

    const handlePropertyValueChange = (index: number, value: string) => {
        setPropertyRows((prev) => prev.map((row, i) => (i === index ? { ...row, value } : row)));
    };

    const handleSaveProperties = async () => {
        if (!selectedDevice) return;

        setError(null);
        setSuccessMessage(null);

        const propsObj: SavedProperties = {};
        for (const row of propertyRows) {
            const k = row.key.trim();
            if (!k) continue;

            const castResult = castValueForType(row);
            if (!castResult.ok) {
                setError(castResult.error);
                return;
            }

            propsObj[k] = { type: row.type, value: castResult.value };
        }

        try {
            setSavingProps(true);
            await updateDeviceProperties(selectedDevice.code, propsObj);
            setSuccessMessage("Device properties saved.");
            await fetchAll();
        } catch (err: any) {
            setError(err?.error || "Error while saving device properties.");
        } finally {
            setSavingProps(false);
        }
    };

    const handleAddAclRule = async () => {
        if (!selectedDevice || !canManageSecurity) return;
        if (!aclTopicPattern.trim()) {
            setError("Enter ACL topic pattern.");
            return;
        }
        try {
            setAclSaving(true);
            await upsertMqttAclRule(selectedDevice.code, {
                action: aclAction,
                topicPattern: aclTopicPattern.trim(),
                permission: aclPermission,
                priority: Number(aclPriority) || 100,
            });
            setAclTopicPattern("");
            setAclPriority("100");
            await loadAclForDevice(selectedDevice.code);
        } catch (err: any) {
            setError(err?.error || "Error saving ACL.");
        } finally {
            setAclSaving(false);
        }
    };

    const handleDeleteAclRule = async (id: number) => {
        if (!selectedDevice || !canManageSecurity) return;
        try {
            await deleteMqttAclRule(id);
            await loadAclForDevice(selectedDevice.code);
        } catch (err: any) {
            setError(err?.error || "Error deleting ACL.");
        }
    };

    const handleCopyDeviceCode = async (deviceCode: string) => {
        try {
            await navigator.clipboard.writeText(deviceCode);
            setSuccessMessage(`Code copied: ${deviceCode}`);
        } catch {
            setError("Could not copy device code to clipboard.");
        }
    };

    const handleShareDevice = async () => {
        if (!selectedDevice || !canManageSharing) return;
        const email = shareEmail.trim().toLowerCase();
        if (!email) {
            setError("Enter an email to share this device.");
            return;
        }
        try {
            setSharingSaving(true);
            const result = await shareDeviceByEmail(selectedDevice.code, {
                email,
                canWrite: shareCanWrite,
            });
            setShareEmail("");
            setShareCanWrite(false);
            setSuccessMessage(
                result.mode === "shared"
                    ? `Device shared with ${result.email}.`
                    : `Invitation created for ${result.email}.`
            );
            await loadSharesForDevice(selectedDevice.code);
            await fetchAll();
        } catch (err: any) {
            setError(err?.error || "Error while sharing device.");
        } finally {
            setSharingSaving(false);
        }
    };

    const handleRemoveShare = async (targetUserId: number) => {
        if (!selectedDevice || !canManageSharing) return;
        try {
            await removeDeviceShare(selectedDevice.code, targetUserId);
            await loadSharesForDevice(selectedDevice.code);
            await fetchAll();
        } catch (err: any) {
            setError(err?.error || "Error while revoking shared user.");
        }
    };

    const handleRevokeShareInvite = async (invitationId: number) => {
        if (!selectedDevice || !canManageSharing) return;
        try {
            await revokeDeviceShareInvitation(selectedDevice.code, invitationId);
            await loadSharesForDevice(selectedDevice.code);
        } catch (err: any) {
            setError(err?.error || "Error while revoking invitation.");
        }
    };

    return (
        <div className="devices-page">
            <header className="dt-header">
                <h1>Devices</h1>
                <p>Manage devices, properties, and MQTT security from one dashboard.</p>
            </header>

            <section className="device-kpi-grid">
                <article className="device-kpi-card">
                    <span className="device-kpi-label">Total devices</span>
                    <strong className="device-kpi-value">{kpis.total}</strong>
                </article>
                <article className="device-kpi-card">
                    <span className="device-kpi-label">Active</span>
                    <strong className="device-kpi-value">{kpis.active}</strong>
                </article>
                <article className="device-kpi-card">
                    <span className="device-kpi-label">Owned by you</span>
                    <strong className="device-kpi-value">{kpis.owned}</strong>
                </article>
                {isAdmin && (
                    <article className="device-kpi-card">
                        <span className="device-kpi-label">Device Types</span>
                        <strong className="device-kpi-value">{kpis.types}</strong>
                    </article>
                )}
            </section>

            {canCreateDevice && (
                <div className="dt-tabs">
                    <button
                        type="button"
                        className={`dt-btn ${activeTab === "list" ? "dt-btn-primary" : "dt-btn-outline"}`}
                        onClick={() => setActiveTab("list")}
                    >
                        Device list
                    </button>
                    <button
                        type="button"
                        className={`dt-btn ${activeTab === "create" ? "dt-btn-primary" : "dt-btn-outline"}`}
                        onClick={() => setActiveTab("create")}
                    >
                        New device
                    </button>
                </div>
            )}

            <div className="devices-content">
                {canCreateDevice && activeTab === "create" && (
                    <section className="dt-card dt-form-card">
                        <div className="dt-form-header">
                            <h2>New device</h2>
                        </div>
                        <form className="dt-form" onSubmit={handleCreateDevice}>
                            <div className="dt-form-group">
                                <label htmlFor="code">Code</label>
                                <input
                                    id="code"
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="e.g. DEV-001"
                                />
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="deviceType">Device type</label>
                                <select
                                    id="deviceType"
                                    value={deviceTypeId}
                                    onChange={(e) => setDeviceTypeId(e.target.value ? String(e.target.value) : "")}
                                >
                                    <option value="">Select...</option>
                                    {deviceTypes.map((dt) => (
                                        <option key={dt.id} value={dt.id}>
                                            #{dt.id} - {dt.description} (FW {dt.firmware_version})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="dt-form-group">
                                <label htmlFor="ownerEmail">Owner email (optional)</label>
                                <input
                                    id="ownerEmail"
                                    type="email"
                                    value={ownerEmail}
                                    onChange={(e) => setOwnerEmail(e.target.value)}
                                    placeholder="owner@example.com"
                                />
                            </div>

                            <div className="dt-form-group dt-inline">
                                <label htmlFor="activated">
                                    <input
                                        id="activated"
                                        type="checkbox"
                                        checked={activated}
                                        onChange={(e) => setActivated(e.target.checked)}
                                    />{" "}
                                    Activated
                                </label>
                            </div>

                            {error && <div className="dt-alert dt-alert-error">{error}</div>}
                            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}

                            <button type="submit" className="dt-btn dt-btn-primary">
                                Create device
                            </button>
                        </form>
                    </section>
                )}

                {activeTab === "list" && (
                    <section className="dt-card dt-table-card">
                        <div className="dt-table-header">
                            <h2>Device list</h2>
                            <button className="dt-btn dt-btn-outline" onClick={fetchAll}>
                                Refresh
                            </button>
                        </div>

                        {loading ? (
                            <div className="dt-loading">Loading...</div>
                        ) : devices.length === 0 ? (
                            <p className="dt-empty">No devices found.</p>
                        ) : (
                            <div className="dt-table-wrapper">
                                <table className="dt-table device-table">
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            <th>Type</th>
                                            <th>Owner</th>
                                            <th>Active</th>
                                            <th className="device-action-col">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {devices.map((d) => (
                                            <tr key={d.code}>
                                                <td>{d.code}</td>
                                                <td>{d.device_type_description ?? `type ${d.device_type_id}`}</td>
                                                <td>{d.owner_email ?? (d.owner_id ? `#${d.owner_id}` : "-")}</td>
                                                <td>{d.activated ? "✔" : "✗"}</td>
                                                <td className="device-action-col">
                                                    <div className="dt-actions">
                                                        <button
                                                            className="dt-btn dt-btn-xs device-table-btn device-table-btn-primary"
                                                            type="button"
                                                            onClick={() => handleOpenProperties(d)}
                                                        >
                                                            Properties
                                                        </button>
                                                        <button
                                                            className="dt-btn dt-btn-xs device-table-btn device-table-btn-outline"
                                                            type="button"
                                                            onClick={() => handleCopyDeviceCode(d.code)}
                                                        >
                                                            Copy code
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                className="dt-btn dt-btn-xs device-table-btn device-table-btn-outline"
                                                                type="button"
                                                                onClick={() => handleRevokeOwnership(d)}
                                                            >
                                                                Revoke owner
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="dt-btn dt-btn-xs device-table-btn device-table-btn-danger"
                                                                type="button"
                                                                onClick={() => handleDeleteDevice(d)}
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="dt-divider" />

                        {!selectedDevice ? (
                            <p className="dt-empty">Select a device to open details.</p>
                        ) : (
                            <>
                                <div className="device-detail-header">
                                    <h3>Device details</h3>
                                    <p className="dt-small">
                                        <strong>{selectedDevice.code}</strong> (
                                        {selectedDevice.device_type_description ?? `type #${selectedDevice.device_type_id}`})
                                    </p>
                                </div>

                                <div className={canViewSecurity ? "device-detail-grid" : "device-detail-grid single"}>
                                    <section className="dt-properties-panel dt-card-sub">
                                        <div className="device-subhead">
                                            <h4>Properties</h4>
                                        </div>

                                        {propertyRows.length === 0 ? (
                                            <p className="dt-empty">No properties defined in the device type.</p>
                                        ) : (
                                            <div className="dt-props-list">
                                                {propertyRows.map((row, index) => (
                                                    <div key={row.key} className="dt-prop-row">
                                                        <div className="dt-prop-key">
                                                            <strong>{row.key}</strong>
                                                            <span className="dt-chip">{row.type}</span>
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={row.value}
                                                            disabled={!canEditSelectedDevice}
                                                            onChange={(e) => handlePropertyValueChange(index, e.target.value)}
                                                            placeholder={
                                                                row.type === PropertyType.BOOL ? "true / false" : "Value"
                                                            }
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {genericPropertyRows.length > 0 && (
                                            <>
                                                <div className="dt-divider" />
                                                <h5>Generic properties (from Device Type)</h5>
                                                <div className="dt-props-list compact">
                                                    {genericPropertyRows.map((row) => (
                                                        <div key={`generic-${row.key}`} className="dt-prop-row">
                                                            <div className="dt-prop-key">
                                                                <strong>{row.key}</strong>
                                                                <span className="dt-chip">{row.type}</span>
                                                            </div>
                                                            <input type="text" value={row.value} disabled />
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-primary"
                                            onClick={handleSaveProperties}
                                            disabled={savingProps || !canEditSelectedDevice}
                                        >
                                            {savingProps ? "Saving..." : "Save properties"}
                                        </button>

                                        <div className="dt-divider" />
                                        <h5>Sharing</h5>
                                        <p className="dt-small">
                                            Share this device with other users. Existing users are linked immediately;
                                            non-registered emails receive a pending invitation.
                                        </p>

                                        {sharingLoading ? (
                                            <p className="dt-loading">Loading sharing...</p>
                                        ) : (
                                            <>
                                                {canManageSharing && (
                                                    <>
                                                        <div className="dt-form-group">
                                                            <label htmlFor="shareEmail">User email</label>
                                                            <input
                                                                id="shareEmail"
                                                                type="email"
                                                                value={shareEmail}
                                                                onChange={(e) => setShareEmail(e.target.value)}
                                                                placeholder="name@example.com"
                                                            />
                                                        </div>
                                                        <div className="dt-actions">
                                                            <label className="dt-small">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={shareCanWrite}
                                                                    onChange={(e) => setShareCanWrite(e.target.checked)}
                                                                />{" "}
                                                                Write access
                                                            </label>
                                                            <button
                                                                type="button"
                                                                className="dt-btn dt-btn-primary"
                                                                onClick={handleShareDevice}
                                                                disabled={sharingSaving}
                                                            >
                                                                {sharingSaving ? "Sharing..." : "Share device"}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}

                                                <div className="dt-props-list compact">
                                                    {deviceShares.length === 0 ? (
                                                        <p className="dt-empty">No users currently sharing this device.</p>
                                                    ) : (
                                                        deviceShares.map((share) => (
                                                            <div
                                                                key={`${share.device_code}:${share.user_id}`}
                                                                className="dt-prop-row"
                                                            >
                                                                <div className="dt-prop-key">
                                                                    <strong>{share.user_email}</strong>
                                                                    <span className="dt-chip">
                                                                        {share.can_write ? "write" : "read"}
                                                                    </span>
                                                                    <span className="dt-chip">
                                                                        since {formatDateTime(share.created_at)}
                                                                    </span>
                                                                </div>
                                                                {canManageSharing ? (
                                                                    <div className="dt-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="dt-btn dt-btn-xs dt-btn-danger"
                                                                            onClick={() => handleRemoveShare(share.user_id)}
                                                                        >
                                                                            Revoke
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div />
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>

                                                <h5>Pending invitations</h5>
                                                <div className="dt-props-list compact">
                                                    {shareInvitations.length === 0 ? (
                                                        <p className="dt-empty">No pending invitations.</p>
                                                    ) : (
                                                        shareInvitations.map((inv) => (
                                                            <div key={inv.id} className="dt-prop-row">
                                                                <div className="dt-prop-key">
                                                                    <strong>{inv.email}</strong>
                                                                    <span className="dt-chip">
                                                                        {inv.can_write ? "write" : "read"}
                                                                    </span>
                                                                    <span className="dt-chip">
                                                                        expires {formatDateTime(inv.expires_at)}
                                                                    </span>
                                                                </div>
                                                                {canManageSharing ? (
                                                                    <div className="dt-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="dt-btn dt-btn-xs dt-btn-danger"
                                                                            onClick={() => handleRevokeShareInvite(inv.id)}
                                                                        >
                                                                            Revoke
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div />
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </section>

                                    {canViewSecurity && (
                                        <section className="dt-properties-panel dt-card-sub">
                                            <h4>Security</h4>

                                            <div className="dt-divider" />
                                            <h5>MQTT ACL</h5>
                                            <div className="dt-props-list compact">
                                                {aclLoading ? (
                                                    <p className="dt-loading">Loading ACL...</p>
                                                ) : aclRules.length === 0 ? (
                                                    <p className="dt-empty">No ACL configured.</p>
                                                ) : (
                                                    aclRules.map((rule) => (
                                                        <div key={rule.id} className="dt-prop-row">
                                                            <div className="dt-prop-key">
                                                                <strong>{rule.topic_pattern}</strong>
                                                                <span className="dt-chip">{rule.action}</span>
                                                                <span className="dt-chip">{rule.permission}</span>
                                                                <span className="dt-chip">Priority {rule.priority}</span>
                                                            </div>
                                                            <div className="dt-actions">
                                                                <button
                                                                    type="button"
                                                                    className="dt-btn dt-btn-xs dt-btn-danger"
                                                                    onClick={() => handleDeleteAclRule(rule.id)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            <div className="dt-form-group">
                                                <label htmlFor="aclTopic">Topic Pattern</label>
                                                <input
                                                    id="aclTopic"
                                                    type="text"
                                                    value={aclTopicPattern}
                                                    onChange={(e) => setAclTopicPattern(e.target.value)}
                                                    disabled={!canManageSecurity}
                                                    placeholder="devices/DEVICE_CODE/telemetry/#"
                                                />
                                            </div>
                                            <div className="security-acl-grid">
                                                <div className="dt-form-group">
                                                    <label htmlFor="aclAction">Action</label>
                                                    <select
                                                        id="aclAction"
                                                        value={aclAction}
                                                        onChange={(e) =>
                                                            setAclAction(e.target.value as MqttAclAction)
                                                        }
                                                        disabled={!canManageSecurity}
                                                    >
                                                        <option value={MQTT_ACL_ACTIONS.PUBLISH}>publish</option>
                                                        <option value={MQTT_ACL_ACTIONS.SUBSCRIBE}>subscribe</option>
                                                        <option value={MQTT_ACL_ACTIONS.ALL}>all</option>
                                                    </select>
                                                </div>
                                                <div className="dt-form-group">
                                                    <label htmlFor="aclPermission">Permission</label>
                                                    <select
                                                        id="aclPermission"
                                                        value={aclPermission}
                                                        onChange={(e) =>
                                                            setAclPermission(e.target.value as MqttAclPermission)
                                                        }
                                                        disabled={!canManageSecurity}
                                                    >
                                                        <option value={MQTT_ACL_PERMISSION.ALLOW}>allow</option>
                                                        <option value={MQTT_ACL_PERMISSION.DENY}>deny</option>
                                                    </select>
                                                </div>
                                                <div className="dt-form-group">
                                                    <label htmlFor="aclPriority">Priority</label>
                                                    <input
                                                        id="aclPriority"
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={aclPriority}
                                                        onChange={(e) => setAclPriority(e.target.value)}
                                                        disabled={!canManageSecurity}
                                                        placeholder="100"
                                                    />
                                                </div>
                                                <div className="security-acl-submit">
                                                    <button
                                                        type="button"
                                                        className="dt-btn dt-btn-primary"
                                                        onClick={handleAddAclRule}
                                                        disabled={aclSaving || !canManageSecurity}
                                                    >
                                                        {aclSaving ? "Saving..." : "Add ACL"}
                                                    </button>
                                                </div>
                                            </div>

                                        </section>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>

            {error && <div className="dt-alert dt-alert-error">{error}</div>}
            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
        </div>
    );
};

export default DevicesPage;
