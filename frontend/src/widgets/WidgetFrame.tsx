import { ReactNode } from "react";
import { DeviceDashboardWidgetRuntime, WidgetObservation } from "@shared/widgets";

export interface WidgetViewProps<T extends DeviceDashboardWidgetRuntime> {
    widget: T;
    deviceCode: string;
    observation?: WidgetObservation;
    connected: boolean;
}

export default function WidgetFrame({ widget, observation, connected, children, message, failed = false }: {
    widget: DeviceDashboardWidgetRuntime; observation?: WidgetObservation; connected: boolean;
    children: ReactNode; message?: string; failed?: boolean;
}) {
    const status = !widget.configured ? widget.configurationError || "Not configured"
        : widget.state ? !connected ? "Offline" : !observation ? "Waiting for state"
            : observation.value === undefined ? "Invalid state" : "State received" : "No state feedback";
    return <article className={`home-widget ${widget.kind}`}>
        <div className="home-widget-head"><span>{widget.label}</span><small>{status}</small></div>
        {children}
        {message && <p className={failed ? "widget-command-error" : "widget-command-status"} role={failed ? "alert" : "status"}>{message}</p>}
    </article>;
}

export function formatWidgetValue(value: unknown): string {
    if (value === undefined || value === null) return "—";
    if (typeof value === "boolean") return value ? "On" : "Off";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}
