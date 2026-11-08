import { useEffect, useRef, useState } from "react";
import { MqttLiveEntry } from "@shared/widgets";
import { getApiUrl } from "../api/apiClient";

export function useMqttStream(userId: number | undefined, enabled: boolean) {
    const [stream, setStream] = useState<{ userId?: number; entries: Record<string, MqttLiveEntry>; connected: boolean; error?: string }>({ entries: {}, connected: false });
    const sequence = useRef(0);
    useEffect(() => {
        setStream({ userId, entries: {}, connected: false });
        if (!userId || !enabled) return;
        const source = new EventSource(getApiUrl("/mqtt/stream"), { withCredentials: true });
        const ready = (event: MessageEvent<string>) => {
            try {
                const body = JSON.parse(event.data) as { connected?: boolean };
                setStream((current) => ({ ...current, connected: body.connected === true, error: undefined }));
            } catch { /* Ignore malformed service events. */ }
        };
        const message = (event: MessageEvent<string>) => {
            try {
                const body = JSON.parse(event.data) as { topic?: string; content?: unknown; payload?: unknown; receivedAt?: string; retained?: boolean; cached?: boolean };
                if (typeof body.topic !== "string" || !body.topic) return;
                const topic = body.topic;
                const entry: MqttLiveEntry = {
                    value: body.content === undefined ? body.payload : body.content,
                    receivedAt: body.receivedAt || new Date().toISOString(),
                    sequence: ++sequence.current,
                    replayed: body.retained === true || body.cached === true,
                };
                setStream((current) => {
                    const entries = { ...current.entries };
                    delete entries[topic];
                    entries[topic] = entry;
                    if (Object.keys(entries).length > 500) delete entries[Object.keys(entries)[0]];
                    return { ...current, entries, connected: entry.replayed ? current.connected : true, error: entry.replayed ? current.error : undefined };
                });
            } catch { /* Ignore malformed events and keep the connection usable. */ }
        };
        const serviceError = (event: MessageEvent<string>) => {
            let error = "Realtime MQTT stream is unavailable.";
            try {
                const body = JSON.parse(event.data) as { error?: string };
                if (typeof body.error === "string") error = body.error;
            } catch { /* Use the generic message. */ }
            setStream((current) => ({ ...current, connected: false, error }));
        };
        source.addEventListener("ready", ready);
        source.addEventListener("mqtt-message", message);
        source.addEventListener("mqtt-error", serviceError);
        source.onerror = () => setStream((current) => ({ ...current, connected: false }));
        return () => {
            source.removeEventListener("ready", ready);
            source.removeEventListener("mqtt-message", message);
            source.removeEventListener("mqtt-error", serviceError);
            source.onerror = null;
            source.close();
        };
    }, [userId, enabled]);
    return stream.userId === userId ? stream : { entries: {}, connected: false };
}
