import { DashboardWidgetValue } from "./base";
import { SwitchValues } from "./switch";
import { mqttTopicMatches } from "../types/mqtt";

export interface WidgetObservation {
    value: unknown;
    sequence: number;
    replayed: boolean;
}

export interface MqttLiveEntry extends WidgetObservation {
    receivedAt: string;
}

export function latestMqttEntry(entries: Record<string, MqttLiveEntry>, topicPattern: string): MqttLiveEntry | undefined {
    let latest: MqttLiveEntry | undefined;
    for (const [topic, entry] of Object.entries(entries)) {
        if (mqttTopicMatches(topicPattern, topic) && (!latest || entry.sequence > latest.sequence)) latest = entry;
    }
    return latest;
}

export function switchState(value: unknown, mapping?: SwitchValues): boolean | undefined {
    if (!mapping || value === undefined) return undefined;
    if (value === mapping.onValue) return true;
    if (value === mapping.offValue) return false;
    return undefined;
}

export function matchesWidgetFeedback(observation: WidgetObservation | undefined, afterSequence: number, expected: DashboardWidgetValue): boolean {
    return Boolean(observation && !observation.replayed && observation.sequence > afterSequence && observation.value === expected);
}
