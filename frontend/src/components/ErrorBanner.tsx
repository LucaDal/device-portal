import { useEffect, useState } from "react";
import "../style/ErrorBanner.css";

type ErrorBannerProps = {
    message?: string | null;
    variant?: "error" | "success" | "info";
    className?: string;
    inlineClassName?: string;
    title?: string;
    display?: "toast" | "inline";
    durationMs?: number | null;
    onDismiss?: () => void;
};

const ErrorBanner: React.FC<ErrorBannerProps> = ({
    message,
    variant = "error",
    className = "",
    inlineClassName = "",
    title,
    display,
    durationMs,
    onDismiss,
}) => {
    const resolvedDisplay = display || (variant === "info" ? "inline" : "toast");
    const resolvedDuration = durationMs === undefined
        ? variant === "success" ? 4500 : variant === "error" ? 7000 : null
        : durationMs;
    const [visible, setVisible] = useState(Boolean(message));

    useEffect(() => {
        setVisible(Boolean(message));
        if (!message || resolvedDisplay !== "toast" || resolvedDuration === null) return;

        const timeoutId = window.setTimeout(() => {
            setVisible(false);
            onDismiss?.();
        }, resolvedDuration);
        return () => window.clearTimeout(timeoutId);
    }, [message, onDismiss, resolvedDisplay, resolvedDuration]);

    const resolvedTitle =
        title || (variant === "success" ? "Success" : variant === "info" ? "Info" : "Attention");
    const alertClassName = [
        "dt-alert",
        variant === "success" ? "dt-alert-success" : variant === "info" ? "dt-alert-info" : "dt-alert-error",
        "app-banner",
        `app-banner--${resolvedDisplay}`,
        inlineClassName,
        className,
    ]
        .filter(Boolean)
        .join(" ");

    if (!message || !visible) return null;

    const dismiss = () => {
        setVisible(false);
        onDismiss?.();
    };

    return (
        <div
            className={alertClassName}
            role={variant === "error" ? "alert" : "status"}
            aria-live={variant === "error" ? "assertive" : "polite"}
        >
            <span className="app-banner__icon" aria-hidden="true">
                {variant === "success" ? "✓" : variant === "info" ? "i" : "!"}
            </span>
            <div className="app-banner__body">
                <strong className="app-banner__title">{resolvedTitle}</strong>
                <div className="app-banner__message">{message}</div>
            </div>
            {resolvedDisplay === "toast" && (
                <button
                    type="button"
                    className="app-banner__close"
                    aria-label="Dismiss notification"
                    onClick={dismiss}
                >
                    ×
                </button>
            )}
        </div>
    );
};

export default ErrorBanner;
