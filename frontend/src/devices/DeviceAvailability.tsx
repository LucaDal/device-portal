import { deviceAvailabilityTopic } from "@shared/constants/mqtt";
import { DeviceWithRelations } from "@shared/types/device";
import { MqttLiveEntry } from "@shared/widgets";
import "../style/DeviceAvailability.css";

type Props = {
    device: Pick<DeviceWithRelations, "code" | "mqtt_available">;
    entries: Record<string, MqttLiveEntry>;
    connected: boolean;
    compact?: boolean;
};

export function getDeviceAvailability({ device, entries, connected }: Props): "online" | "offline" | "unknown" | undefined {
    if (!device.mqtt_available) return undefined;
    if (!connected) return "unknown";
    const payload = entries[deviceAvailabilityTopic(device.code)]?.value;
    const value = payload && typeof payload === "object" && "value" in payload ? payload.value : payload;
    return value === "online" || value === "offline" ? value : "unknown";
}

export default function DeviceAvailability(props: Props) {
    const status = getDeviceAvailability(props);
    if (!status) return null;
    const label = status === "online" ? "Online" : status === "offline" ? "Offline" : "Availability unknown";
    return <span className={`device-availability ${status}`} role="status" aria-label={label} title={label}>
        <span className="device-availability-dot" aria-hidden="true" />
        {!props.compact && label}
    </span>;
}
