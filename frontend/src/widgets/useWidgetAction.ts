import { useEffect, useRef, useState } from "react";
import { DashboardWidgetValue, DeviceDashboardWidgetActionInput, WidgetObservation, matchesWidgetFeedback } from "@shared/widgets";
import { runDeviceDashboardWidgetAction } from "../devices/deviceService";

type Progress =
    | { status: "idle" | "sending" | "sent" | "confirmed" }
    | { status: "waiting"; expected: DashboardWidgetValue; afterSequence: number; deadline: number }
    | { status: "error"; message: string };

export function useWidgetAction(deviceCode: string, widgetId: string, observation: WidgetObservation | undefined, connected: boolean) {
    const [progress, setProgress] = useState<Progress>({ status: "idle" });
    const mounted = useRef(false);
    const locked = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const busy = progress.status === "sending" || progress.status === "waiting";
    useEffect(() => { if (!busy) locked.current = false; }, [busy]);
    useEffect(() => {
        if (progress.status !== "waiting") return;
        if (!connected) {
            setProgress({ status: "error", message: "Command sent; live connection lost before confirmation." });
        } else if (matchesWidgetFeedback(observation, progress.afterSequence, progress.expected)) {
            setProgress({ status: "confirmed" });
        }
    }, [observation, progress, connected]);
    useEffect(() => {
        if (progress.status !== "waiting") return;
        const timer = setTimeout(() => setProgress((current) => current.status === "waiting"
            ? { status: "error", message: "Command sent; no matching device state received within 10 seconds." } : current),
        Math.max(0, progress.deadline - Date.now()));
        return () => clearTimeout(timer);
    }, [progress]);

    async function send(input: DeviceDashboardWidgetActionInput = {}, expected?: DashboardWidgetValue) {
        if (locked.current) return;
        locked.current = true;
        const afterSequence = observation?.sequence || 0;
        setProgress({ status: "sending" });
        try {
            await runDeviceDashboardWidgetAction(deviceCode, widgetId, input);
            if (!mounted.current) return;
            setProgress(expected === undefined ? { status: "sent" } : {
                status: "waiting", expected, afterSequence, deadline: Date.now() + 10000,
            });
        } catch (error) {
            if (!mounted.current) return;
            const failure = error as { error?: string; message?: string };
            setProgress({ status: "error", message: failure.error || failure.message || "Command failed." });
        }
    }

    const message = progress.status === "error" ? progress.message : {
        idle: "", sending: "Sending...", waiting: "Waiting for device state...", sent: "Command sent", confirmed: "State confirmed",
    }[progress.status];
    return { send, busy, message, failed: progress.status === "error" };
}
