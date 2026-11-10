import { DeviceType } from "@shared/types/device_type";

export default function DeviceTypeOptions({ deviceTypes }: { deviceTypes: DeviceType[] }) {
    return deviceTypes.map((type) => {
        const label = [type.id, type.description?.trim()].filter(Boolean).join(" — ");
        return <option key={type.id} value={type.id} label={label}>{label}</option>;
    });
}
