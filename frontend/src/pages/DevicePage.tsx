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
    regenerateDeviceSecretCode,
    revokeDeviceOwnership,
    registerDeviceByCode,
} from "../devices/deviceService";
import { DeviceType } from "@shared/types/device_type";
import {
    DeviceProvisioningResult,
    DeviceShareInvitationRow,
    DeviceShareRow,
    DeviceWithRelations,
} from "@shared/types/device";
import { useAuth } from "../auth/AuthContext";
import { PropertyType, SavedProperties, castPropertyValue } from "@shared/types/properties";
import {
    DevicePropertyRow,
    buildGenericPropertyRows,
    buildPropertyRows,
} from "../devices/deviceProperties";
import { ROLES, Role } from "@shared/constants/auth";
import { MqttAclRule } from "@shared/types/mqtt";
import ErrorBanner from "../components/ErrorBanner";
import "../style/DevicePage.css";

const formatDateTime = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
};

const canSeePropertyKey = (role?: Role): boolean => {
    return role === ROLES.ADMIN || role === ROLES.DEV;
};

const DevicesPage: React.FC = () => {
    const { user } = useAuth();
    const canCreateDevice = user?.role === ROLES.ADMIN;
    const isAdmin = canCreateDevice;
    const showPropertyKey = canSeePropertyKey(user?.role);
    const canViewSecurity = isAdmin;

    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [devices, setDevices] = useState<DeviceWithRelations[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [code, setCode] = useState("");
    const [deviceTypeId, setDeviceTypeId] = useState<string | "">("");
    const [ownerEmail, setOwnerEmail] = useState("");
    const [activated, setActivated] = useState(false);
    const [newDeviceSecret, setNewDeviceSecret] = useState<string | null>(null);
    const [registerCode, setRegisterCode] = useState("");
    const [registeringDevice, setRegisteringDevice] = useState(false);

    const [selectedDevice, setSelectedDevice] = useState<DeviceWithRelations | null>(null);
    const [propertyRows, setPropertyRows] = useState<DevicePropertyRow[]>([]);
    const [genericPropertyRows, setGenericPropertyRows] = useState<DevicePropertyRow[]>([]);
    const [savingProps, setSavingProps] = useState(false);

    const [aclRules, setAclRules] = useState<MqttAclRule[]>([]);
    const [aclLoading, setAclLoading] = useState(false);

    const [deviceShares, setDeviceShares] = useState<DeviceShareRow[]>([]);
    const [shareInvitations, setShareInvitations] = useState<DeviceShareInvitationRow[]>([]);
    const [sharingLoading, setSharingLoading] = useState(false);
    const [sharingSaving, setSharingSaving] = useState(false);
    const [shareEmail, setShareEmail] = useState("");
    const [rotatingSecret, setRotatingSecret] = useState(false);

    const [activeTab, setActiveTab] = useState<"add" | "create" | "list" | "properties">("list");

    const isSelectedDeviceOwner = Boolean(
        selectedDevice && user && Number(selectedDevice.owner_id) === Number(user.id)
    );
    const canViewDeviceProperties = isSelectedDeviceOwner;
    const canManageSharing = Boolean(selectedDevice && (isAdmin || isSelectedDeviceOwner));
    const showSecurityPanel = canViewSecurity && (aclLoading || aclRules.length > 0);
    const canEditSelectedDevice = canViewDeviceProperties;

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

    const handleCopyText = async (value: string, message: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setSuccessMessage(message);
        } catch {
            setError("Could not copy value to clipboard.");
        }
    };

    const handleCreateDevice = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setNewDeviceSecret(null);

        if (!code.trim() || !deviceTypeId) {
            setError("Fill at least code and device type.");
            return;
        }

        try {
            const created = await createDevice({
                code: code.trim(),
                device_type_id: deviceTypeId,
                owner_email: ownerEmail.trim() || undefined,
                activated,
            }) as DeviceProvisioningResult;
            setNewDeviceSecret(created.secret_code);
            setSuccessMessage("Device created successfully. Save the secret code now.");
            resetNewDeviceForm();
            await fetchAll();
        } catch (err: any) {
            setError(err?.error || "Error while creating device.");
        }
    };

    const handleRegisterDevice = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        const trimmedCode = registerCode.trim();
        if (!trimmedCode) {
            setError("Enter the device code.");
            return;
        }

        try {
            setRegisteringDevice(true);
            await registerDeviceByCode(trimmedCode);
            setRegisterCode("");
            setSuccessMessage("Device added successfully.");
            await fetchAll();
            setActiveTab("list");
        } catch (err: any) {
            setError(err?.error || err?.message || "Error while adding the device. Please verify the code.");
        } finally {
            setRegisteringDevice(false);
        }
    };

    const handleRegenerateSecretCode = async (device: DeviceWithRelations) => {
        if (!isAdmin) return;
        if (!window.confirm(`Regenerate secret code for device "${device.code}"? The old secret will stop working.`)) {
            return;
        }

        try {
            setRotatingSecret(true);
            setError(null);
            setSuccessMessage(null);
            const result = await regenerateDeviceSecretCode(device.code);
            setNewDeviceSecret(result.secret_code);
            setSuccessMessage(`Secret code regenerated for ${device.code}. Save the new value now.`);
            window.prompt(`New secret code for ${device.code}. Copy it now:`, result.secret_code);
        } catch (err: any) {
            setError(err?.error || "Error while regenerating secret code.");
        } finally {
            setRotatingSecret(false);
        }
    };

    const handleOpenProperties = async (device: DeviceWithRelations) => {
        setActiveTab("properties");
        setSelectedDevice(device);
        setSuccessMessage(null);
        setError(null);
        setNewDeviceSecret(null);
        setPropertyRows(buildPropertyRows(device));
        setGenericPropertyRows(buildGenericPropertyRows(device));
        setShareEmail("");

        if (canViewSecurity) {
            await Promise.all([
                loadAclForDevice(device.code),
                loadSharesForDevice(device.code),
            ]);
        } else {
            setAclRules([]);
            await loadSharesForDevice(device.code);
        }
    };

    const handleSelectDeviceFromTab = async (code: string) => {
        if (!code) {
            setSelectedDevice(null);
            setPropertyRows([]);
            setGenericPropertyRows([]);
            setDeviceShares([]);
            setShareInvitations([]);
            return;
        }
        const device = devices.find((d) => d.code === code);
        if (!device) return;
        await handleOpenProperties(device);
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

            const castResult = castPropertyValue(row.type, row.value, k);
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

    const handleCopyDeviceCode = async (deviceCode: string) => {
        await handleCopyText(deviceCode, `Code copied: ${deviceCode}`);
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
            });
            setShareEmail("");
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

    const renderDeviceSecretAlert = () => {
        if (!newDeviceSecret) return null;

        return (
            <div className="dt-alert dt-alert-success">
                <strong>Device secret code</strong>
                <div className="device-secret-block">{newDeviceSecret}</div>
                <p className="dt-small">Shown only now. Save it on the device firmware or provisioning flow.</p>
                <button
                    type="button"
                    className="dt-btn dt-btn-outline"
                    onClick={() => handleCopyText(newDeviceSecret, "Device secret code copied to clipboard.")}
                >
                    Copy secret code
                </button>
            </div>
        );
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

            <div className="dt-tabs">
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "list" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("list")}
                >
                    Device list
                </button>
                {canCreateDevice && (
                    <button
                        type="button"
                        className={`dt-btn ${activeTab === "create" ? "dt-btn-primary" : "dt-btn-outline"}`}
                        onClick={() => setActiveTab("create")}
                    >
                        New device
                    </button>
                )}
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "add" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("add")}
                >
                    Add device
                </button>
                <button
                    type="button"
                    className={`dt-btn ${activeTab === "properties" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    onClick={() => setActiveTab("properties")}
                >
                    Properties
                </button>
            </div>

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
                                        className="dt-check"
                                        type="checkbox"
                                        checked={activated}
                                        onChange={(e) => setActivated(e.target.checked)}
                                    />{" "}
                                    Activated
                                </label>
                            </div>

                            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
                            {renderDeviceSecretAlert()}

                            <button type="submit" className="dt-btn dt-btn-primary">
                                Create device
                            </button>
                        </form>
                    </section>
                )}

                {activeTab === "add" && (
                    <section className="dt-card dt-form-card">
                        <div className="dt-form-header">
                            <h2>Add device</h2>
                        </div>
                        <form className="dt-form" onSubmit={handleRegisterDevice}>
                            <p className="dt-small">
                                Enter the device code to associate it with your account.
                            </p>
                            <div className="dt-form-group">
                                <label htmlFor="registerDeviceCode">Code</label>
                                <input
                                    id="registerDeviceCode"
                                    type="text"
                                    value={registerCode}
                                    onChange={(e) => setRegisterCode(e.target.value)}
                                    placeholder="e.g. ABCD-1234-TOKEN"
                                />
                            </div>

                            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}

                            <button
                                type="submit"
                                className="dt-btn dt-btn-primary"
                                disabled={registeringDevice}
                            >
                                {registeringDevice ? "Adding..." : "Add device"}
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
                                            <th className="device-active-col">Active</th>
                                            <th className="device-action-col">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {devices.map((d) => (
                                            <tr
                                                key={d.code}
                                                className="dt-clickable-row"
                                                onClick={() => handleOpenProperties(d)}
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        void handleOpenProperties(d);
                                                    }
                                                }}
                                            >
                                                <td>{d.code}</td>
                                                <td>
                                                    <div className="device-type-cell">
                                                        <strong>{d.device_type_id}</strong>
                                                        {d.device_type_description ? (
                                                            <span>{d.device_type_description}</span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>{d.owner_email ?? (d.owner_id ? `#${d.owner_id}` : "-")}</td>
                                                <td className="device-active-col">
                                                    <span
                                                        className={`device-active-dot ${
                                                            d.activated ? "is-active" : "is-inactive"
                                                        }`}
                                                        title={d.activated ? "Active" : "Inactive"}
                                                        aria-label={d.activated ? "Active" : "Inactive"}
                                                    />
                                                </td>
                                                <td className="device-action-col">
                                                    <div className="dt-actions">
                                                        <button
                                                            className="dt-btn dt-btn-xs device-table-btn device-table-btn-outline"
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void handleCopyDeviceCode(d.code);
                                                            }}
                                                        >
                                                            Copy code
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                className="dt-btn dt-btn-xs device-table-btn device-table-btn-outline"
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleRevokeOwnership(d);
                                                                }}
                                                            >
                                                                Revoke owner
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="dt-btn dt-btn-xs device-table-btn device-table-btn-danger"
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleDeleteDevice(d);
                                                                }}
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
                    </section>
                )}

                {activeTab === "properties" && (
                    <section className="dt-card dt-table-card">
                        <div className="dt-table-header">
                            <h2>Device properties</h2>
                            <button className="dt-btn dt-btn-outline" onClick={fetchAll}>
                                Refresh
                            </button>
                        </div>

                            <div className="dt-form-group">
                                <label htmlFor="selectedDeviceCode">Selected device</label>
                                <select
                                    id="selectedDeviceCode"
                                    value={selectedDevice?.code || ""}
                                    onChange={(e) => handleSelectDeviceFromTab(e.target.value)}
                                >
                                    <option value="">Select...</option>
                                    {devices.map((d) => (
                                        <option key={d.code} value={d.code}>
                                            {d.code} - {d.device_type_id}
                                        </option>
                                    ))}
                                </select>
                            </div>

                        <div className="dt-divider" />

                        {!selectedDevice ? (
                            <p className="dt-empty">Select a device to open details.</p>
                        ) : (
                            <>
                                <div className="device-detail-header">
                                    <h3>Device details</h3>
                                    <p className="dt-small">
                                        <strong>{selectedDevice.code}</strong> (
                                        {selectedDevice.device_type_id}
                                        {selectedDevice.device_type_description
                                            ? ` - ${selectedDevice.device_type_description}`
                                            : ""}
                                        )
                                    </p>
                                    {isAdmin && (
                                        <button
                                            type="button"
                                            className="dt-btn dt-btn-outline"
                                            disabled={rotatingSecret}
                                            onClick={() => handleRegenerateSecretCode(selectedDevice)}
                                        >
                                            {rotatingSecret ? "Regenerating..." : "Regenerate secret code"}
                                        </button>
                                    )}
                                </div>

                                {renderDeviceSecretAlert()}

                                <div className={showSecurityPanel ? "device-detail-grid" : "device-detail-grid single"}>
                                    <section className="dt-properties-panel dt-card-sub">
                                        <div className="device-subhead">
                                            <h4>Properties</h4>
                                        </div>

                                        {!canViewDeviceProperties ? (
                                            <p className="dt-empty">
                                                Device properties are visible only to the device owner.
                                            </p>
                                        ) : propertyRows.length === 0 ? (
                                            <p className="dt-empty">No properties defined in the device type.</p>
                                        ) : (
                                            <div className="dt-props-list dt-device-props-list">
                                                <div className="dt-prop-row dt-device-prop-row dt-device-prop-row-header">
                                                    <strong>Key</strong>
                                                    <strong>Value</strong>
                                                </div>
                                                {propertyRows.map((row, index) => (
                                                    <div key={row.key} className="dt-prop-row dt-device-prop-row">
                                                        <div className="dt-prop-key dt-device-prop-key-cell">
                                                            <strong>{row.label || row.key}</strong>
                                                            {row.label && showPropertyKey && (
                                                                <span className="dt-chip">{row.key}</span>
                                                            )}
                                                            {row.sensitive && <span className="dt-chip">sensitive</span>}
                                                        </div>
                                                        {row.type === PropertyType.BOOL ? (
                                                            <label className="dt-small dt-prop-inline-flag">
                                                                <input
                                                                    className="dt-check"
                                                                    type="checkbox"
                                                                    checked={row.value === "true"}
                                                                    disabled={!canEditSelectedDevice}
                                                                    onChange={(e) =>
                                                                        handlePropertyValueChange(
                                                                            index,
                                                                            e.target.checked ? "true" : "false"
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                        ) : (
                                                            <input
                                                                type={row.type === PropertyType.STRING ? "text" : "number"}
                                                                min={row.type === PropertyType.UINT ? 0 : undefined}
                                                                step={row.type === PropertyType.FLOAT ? "any" : 1}
                                                                value={row.value}
                                                                disabled={!canEditSelectedDevice}
                                                                onChange={(e) =>
                                                                    handlePropertyValueChange(index, e.target.value)
                                                                }
                                                                placeholder="Value"
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {canViewDeviceProperties && (
                                            <button
                                                type="button"
                                                className="dt-btn dt-btn-primary"
                                                onClick={handleSaveProperties}
                                                disabled={savingProps || !canEditSelectedDevice}
                                            >
                                                {savingProps ? "Saving..." : "Save properties"}
                                            </button>
                                        )}

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

                                    {showSecurityPanel && (
                                        <section className="dt-properties-panel dt-card-sub">
                                            <h4>Security</h4>

                                            <div className="dt-divider" />
                                            <h5>MQTT ACL</h5>
                                            <div className="dt-props-list compact">
                                                {aclLoading ? (
                                                    <p className="dt-loading">Loading ACL...</p>
                                                ) : (
                                                    aclRules.map((rule) => (
                                                        <div key={rule.id} className="dt-prop-row">
                                                            <div className="dt-prop-key">
                                                                <strong>{rule.topic_pattern}</strong>
                                                                <span className="dt-chip">{rule.action}</span>
                                                                <span className="dt-chip">{rule.permission}</span>
                                                                <span className="dt-chip">Priority {rule.priority}</span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                        </section>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>

            <ErrorBanner message={error} />
            {successMessage && <div className="dt-alert dt-alert-success">{successMessage}</div>}
        </div>
    );
};

export default DevicesPage;
