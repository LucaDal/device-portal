# Integrazione API

Base URL pubblica: `https://portal.example.org/api`. Sostituire il dominio con quello del proprio server.
Le integrazioni usano gli account del portale; un utente invitato deve prima completare il cambio password.

## Inviare un comando MQTT

`POST /mqtt/publish` richiede Basic Auth con email e password dell’utente.
Inviare JSON con `topic` e `content`: quest’ultimo deve essere un oggetto o un array.
Il topic deve essere concreto, senza `+` o `#`, e consentito dalle ACL dell’utente.

Esempio per accendere il relè; curl chiede la password:

```sh
curl --user 'utente@example.org' \
  'https://portal.example.org/api/mqtt/publish' \
  -H 'Content-Type: application/json' \
  --data '{"topic":"devices/ESP32-001/commands/relay","content":{"relay":true}}'
```

Sul topic `devices/ESP32-001/commands/relay` il dispositivo riceve:

```json
{
  "email": "utente@example.org",
  "content": {
    "relay": true
  }
}
```

L’email viene aggiunta dal backend usando l’utente autenticato. Il firmware legge `content.relay`
ed esegue il comando. Il backend pubblica con **QoS 1 e retained disattivato**.

Risposta HTTP `200` di esempio:

```json
{
  "ok": true,
  "topic": "devices/ESP32-001/commands/relay",
  "broker": "mqtts://mqtt.example.org:8883"
}
```

La risposta conferma la pubblicazione, non l’esecuzione fisica. Il firmware conferma lo stato reale
su `stateTopic`, come descritto nella [guida MQTT](MOSQUITTO.md#stato-e-disponibilità).

## Browser e widget

Il browser autenticato usa `POST /mqtt/session-publish` con il cookie di sessione e lo stesso body
`{ "topic": "...", "content": { "relay": true } }`.

Per i widget si usa `POST /devices/:code/widgets/:widgetId/action`: il backend risolve topic e payload
dal widget configurato. Uno switch riceve `{ "state": true }`, un input `{ "value": 42 }`, un button `{}`.
Le azioni del portale non richiedono di distribuire agli utenti le credenziali MQTT dei dispositivi.

## Errori

Gli errori restituiscono un oggetto JSON con `error`.

| Stato HTTP | Significato |
| --- | --- |
| `400` | Topic o contenuto non validi, oppure broker non configurato |
| `401` | Credenziali mancanti o errate; sessione scaduta o revocata |
| `403` | Topic non autorizzato o cambio password obbligatorio |
| `429` | Troppe richieste: rispettare l’header `Retry-After` |
| `500` | Pubblicazione fallita: verificare configurazione e connessione al broker |

Per provisioning e messaggi pubblicati dagli ESP vedere la [guida MQTT](MOSQUITTO.md#firmware-esp).
Per l’elenco degli altri endpoint vedere il [README principale](../README.md#api-essenziali).
