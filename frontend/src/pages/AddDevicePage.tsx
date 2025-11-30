import { FormEvent, useState } from "react";
import { registerDeviceByCode } from "../devices/deviceService";
import { useAuth } from "../auth/AuthContext";
import "../style/DevicePage.css"; // riuso lo stesso tema

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
            setError("Inserisci il code del dispositivo.");
            return;
        }

        try {
            setSubmitting(true);
            await registerDeviceByCode(code.trim());
            setSuccessMessage("Dispositivo aggiunto correttamente.");
            setCode("");
        } catch (err: any) {
            setError(
                err?.message ||
                    "Errore durante l'aggiunta del dispositivo. Verifica il code."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="devices-page">
            <header className="dt-header">
                <h1>Aggiungi dispositivo</h1>
                <p>
                    Inserisci il <strong>code</strong> del dispositivo per
                    associarlo al tuo account.
                </p>
            </header>

            <div className="dt-layout">
                <section className="dt-card dt-form-card">
                    <div className="dt-form-header">
                        <h2>Inserisci code dispositivo</h2>
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
                                    placeholder="Es. ABCD-1234-TOKEN"
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
                                    ? "Aggiunta in corso..."
                                    : "Aggiungi dispositivo"}
                            </button>
                        </form>
                    )}
                </section>
            </div>
        </div>
    );
};

export default AddDevicePage;

