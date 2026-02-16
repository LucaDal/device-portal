import { FormEvent, useState } from "react";
import { registerDeviceByCode } from "../devices/deviceService";
import { useAuth } from "../auth/AuthContext";
import "../style/SinglePanelPage.css";

const AddDevicePage: React.FC = () => {
    const { user } = useAuth();

    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!code.trim()) {
            setError("Enter the device code.");
            return;
        }

        try {
            setSubmitting(true);
            await registerDeviceByCode(code.trim());
            setSuccessMessage("Device added successfully.");
            setCode("");
        } catch (err: any) {
            setError(
                err?.message ||
                    "Error while adding the device. Please verify the code."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="single-page">
            <header className="single-page-header">
                <h1>Add device</h1>
                <p>
                    Enter the <strong>code</strong> of the device to
                    associate it with your account.
                </p>
            </header>

            <div className="single-page-layout">
                <section className="dt-card single-page-card">
                    <div className="dt-form-header">
                        <h2>Enter device code</h2>
                    </div>

                    {!user ? (
                        <p className="dt-empty">
                            Devi effettuare il login per aggiungere un
                            dispositivo.
                        </p>
                    ) : (
                        <form className="dt-form" onSubmit={handleSubmit}>
                            <div className="dt-form-group">
                                <label htmlFor="deviceCode">Code</label>
                                <input
                                    id="deviceCode"
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="Eg. ABCD-1234-TOKEN"
                                />
                            </div>

                            {error && (
                                <div className="dt-alert dt-alert-error">
                                    {error}
                                </div>
                            )}
                            {successMessage && (
                                <div className="dt-alert dt-alert-success">
                                    {successMessage}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="dt-btn dt-btn-primary"
                                disabled={submitting}
                            >
                                {submitting
                                    ? "Adding..."
                                    : "Add device"}
                            </button>
                        </form>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AddDevicePage;
