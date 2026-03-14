import "../style/ErrorBanner.css";

type ErrorBannerProps = {
    message?: string | null;
    variant?: "error" | "success" | "info";
    className?: string;
    inlineClassName?: string;
    title?: string;
};

const ErrorBanner: React.FC<ErrorBannerProps> = ({
    message,
    variant = "error",
    className = "",
    inlineClassName = "",
    title,
}) => {
    const resolvedTitle =
        title || (variant === "success" ? "Success" : variant === "info" ? "Info" : "Attention");
    const alertClassName = [
        "dt-alert",
        variant === "success" ? "dt-alert-success" : variant === "info" ? "dt-alert-info" : "dt-alert-error",
        "app-banner",
        inlineClassName,
        className,
    ]
        .filter(Boolean)
        .join(" ");

    if (!message) return null;

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
        </div>
    );
};

export default ErrorBanner;
