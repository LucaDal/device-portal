import TopicPreview from "./TopicPreview";
import "../style/MqttAclList.css";

type AclRule = {
    id: string | number;
    topic_pattern: string;
    action: string;
    permission: string;
    priority?: number;
    source_device_code?: string | null;
    source_key?: string | null;
    source?: string;
};

type Props = { rules: AclRule[]; onCopy?: (topic: string) => void };

export default function MqttAclList({ rules, onCopy }: Props) {
    return <div className="mqtt-acl-list">
        {rules.map((rule, index) => <div key={rule.id} className="mqtt-acl-row">
            <div className="mqtt-acl-main">
                <strong>{rule.source_key || rule.source || `Topic rule ${index + 1}`}</strong>
                <span className="mqtt-acl-meta">
                    Action: {rule.action} | Permission: {rule.permission}
                    {rule.priority !== undefined && ` | Priority: ${rule.priority}`}
                    {rule.source_device_code && ` | Device: ${rule.source_device_code}`}
                </span>
                <TopicPreview cacheKey={rule.topic_pattern} label={rule.source_key || `ACL rule ${index + 1}`}
                    resolve={() => rule.topic_pattern} />
            </div>
            {onCopy && <button type="button" className="dt-btn dt-btn-outline" onClick={() => onCopy(rule.topic_pattern)}>Copy</button>}
        </div>)}
    </div>;
}
