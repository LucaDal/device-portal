import { useEffect, useState } from "react";
import "../style/ErrorBanner.css";

type ErrorBannerProps = {
    message?: string | null;
    inlineClassName?: string;
};

const ErrorBanner: React.FC<ErrorBannerProps> = ({
    message,
    inlineClassName = "dt-alert dt-alert-error",
}) => {
    const [overlayDismissed, setOverlayDismissed] = useState(false);

    useEffect(() => {
        setOverlayDismissed(false);
    }, [message]);

    if (!message) return null;

    return (
        <>
            <div className={inlineClassName}>{message}</div>
            {!overlayDismissed && (
                <div className="error-overlay" role="alert" aria-live="assertive">
                    <div className="error-overlay__text">{message}</div>
                    <button
                        type="button"
                        className="error-overlay__close"
                        onClick={() => setOverlayDismissed(true)}
                        aria-label="Close error notification"
                    >
                        x
                    </button>
                </div>
            )}
        </>
    );
};

export default ErrorBanner;
