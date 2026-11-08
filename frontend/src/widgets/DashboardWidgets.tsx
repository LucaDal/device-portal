import { useEffect, useState } from "react";
import { DeviceDashboardWidgetRuntime, MqttLiveEntry, latestMqttEntry, readDashboardStateValue } from "@shared/widgets";
import { getDeviceDashboardWidgets } from "../devices/deviceService";
import ValueWidgetView from "./ValueWidget";
import TextWidgetView from "./TextWidget";
import ButtonWidgetView from "./ButtonWidget";
import SwitchWidgetView from "./SwitchWidget";
import InputWidgetView from "./InputWidget";

type Props = { deviceCode: string; entries: Record<string, MqttLiveEntry>; connected: boolean };

export default function DashboardWidgets({ deviceCode, entries, connected }: Props) {
    const [widgets, setWidgets] = useState<DeviceDashboardWidgetRuntime[] | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        void getDeviceDashboardWidgets(deviceCode).then((response) => { if (!cancelled) setWidgets(response.widgets); })
            .catch((error: { error?: string }) => { if (!cancelled) setError(error.error || "Error loading device widgets."); });
        return () => { cancelled = true; };
    }, [deviceCode]);
    if (error) return <p role="alert">{error}</p>;
    if (!widgets) return <p className="home-loading">Loading widgets...</p>;
    if (!widgets.length) return <section className="home-empty inline"><h2>No widgets configured</h2><p>This device has no dashboard widgets.</p></section>;
    return <section className="home-widget-grid" aria-label="MQTT dashboard widgets">
        {widgets.map((widget) => {
            const entry = widget.state ? latestMqttEntry(entries, widget.state.topic) : undefined;
            const observation = entry ? { ...entry, value: readDashboardStateValue(entry.value, widget.state?.path) } : undefined;
            const props = { deviceCode, observation, connected };
            switch (widget.kind) {
                case "value": return <ValueWidgetView key={widget.id} {...props} widget={widget} />;
                case "text": return <TextWidgetView key={widget.id} {...props} widget={widget} />;
                case "button": return <ButtonWidgetView key={widget.id} {...props} widget={widget} />;
                case "switch": return <SwitchWidgetView key={widget.id} {...props} widget={widget} />;
                case "input": return <InputWidgetView key={widget.id} {...props} widget={widget} />;
            }
        })}
    </section>;
}
