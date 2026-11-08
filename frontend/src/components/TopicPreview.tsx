import { useState } from "react";
import "../style/TopicPreview.css";

type Props = { cacheKey: string; label: string; resolve: () => string };

export default function TopicPreview({ cacheKey, label, resolve }: Props) {
    const [preview, setPreview] = useState<{ key: string; value: string } | null>(null);
    const visible = preview?.key === cacheKey;
    const action = `${visible ? "Hide" : "Show"} topic preview: ${label}`;
    return <div className="topic-preview">
        <button type="button" className="topic-preview-toggle" aria-label={action} title={action} aria-expanded={visible}
            onClick={() => setPreview(visible ? null : { key: cacheKey, value: resolve() })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {visible && <path d="m3 3 18 18" />}
            </svg>
        </button>
        {visible && <code className="topic-preview-value">{preview.value}</code>}
    </div>;
}
