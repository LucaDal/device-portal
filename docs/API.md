# Integrazione API

Base URL pubblica: `https://portal.example.org/api`. Sostituire il dominio con quello del proprio server.
Le integrazioni usano gli account del portale; un utente invitato deve prima completare il cambio password.

## Creare e aggiungere dispositivi

La creazione è riservata agli amministratori: `POST /devices` riceve nome, tipo ed email del proprietario opzionale.

```json
{
  "name": "Sensore soggiorno",
  "device_type_id": "esp32",
  "owner_email": "utente@example.org"
}
```

Il backend genera un UUID come `code`, mantenuto come identificatore nelle URL e nei topic MQTT.
Se l'email corrisponde a un utente, assegna il dispositivo e imposta `activated: 1`;
senza email salva `owner_id: null` e `activated: 0`. Un'email sconosciuta restituisce `400` senza creare il dispositivo.
`name` è obbligatorio, con massimo 128 caratteri; può essere diverso dal codice ed è usato come etichetta nelle interfacce.

La risposta di creazione `201` contiene il dispositivo e `secret_code`, con `Cache-Control: no-store`.
Il secret è mostrato solo in quel momento all'amministratore per caricarlo sul firmware.
Il database conserva soltanto il suo hash; liste e risposte successive non lo contengono.
Non esiste un'azione di recupero o rigenerazione del secret.

La clonazione è disponibile soltanto per i **Device Type**, da **Device Types → New Type**.
`POST /device-types` riceve un multipart con `id` nuovo e `clone_from_type_id` sorgente;
`description` e un nuovo `firmware_build` con `firmware_version` sono opzionali.
Senza nuovo upload conserva firmware e versione della sorgente.
Copia proprietà locali e globali, abilitazione e catalogo MQTT, widget e relativo ordine.
I collegamenti MQTT verso lo stesso tipo vengono riferiti al nuovo ID; i link esterni restano invariati.
La copia è indipendente: non vengono spostati o creati dispositivi e i tipi possono essere modificati separatamente.
Creazione riuscita: `201`; ID mancante o sorgente non valida: `400`; sorgente assente: `404`; ID già esistente: `409`.
L'operazione è riservata agli amministratori. `POST /devices` rifiuta `clone_from_code` con `400`.

L'utente autenticato aggiunge un dispositivo libero con `POST /devices/register`:

```json
{"code":"f5f84486-34d4-4e79-a8cb-d67fe11d802c"}
```

Il codice è sufficiente per l'associazione al proprio account; il secret non va fornito.
L'assegnazione e l'attivazione sono atomiche: un dispositivo già assegnato restituisce `409`,
anche se due utenti tentano di acquisirlo contemporaneamente. Un codice inesistente restituisce `404`.
Le chiamate del dispositivo a `/device` e `/ota` continuano a richiedere il secret negli header.

## Configurazione del firmware

`GET /device/configuration` restituisce soltanto le proprietà applicative del dispositivo e quelle globali.
`GET /device/mqtt-credentials`, tramite HTTPS e gli stessi header `x-device-code` e `x-device-secret`,
restituisce host, porta, credenziali e tutti i topic risolti nell'oggetto `topics` (`schemaVersion: 2`).
L'unica chiave integrata è `topics.availability`. `telemetry` e `commands` sono generati nel catalogo
quando si abilita MQTT, poi modificabili dall'admin. `state` è un'eventuale voce personalizzata.
I filtri che terminano in `/#` richiedono un suffisso concreto per le pubblicazioni dei widget.
Esempi e contratto firmware nella [guida MQTT](MOSQUITTO.md#firmware-esp).

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
sui topic di telemetria scelti nel catalogo, come descritto nella [guida MQTT](MOSQUITTO.md#stato-e-disponibilità).

## Browser e widget

Il browser autenticato usa `POST /mqtt/session-publish` con il cookie di sessione e lo stesso body
`{ "topic": "...", "content": { "relay": true } }`.

Per i widget si usa `POST /devices/:code/widgets/:widgetId/action`: il backend risolve topic e payload
dal widget definito nel Device Type del dispositivo. Uno switch riceve `{ "state": true }`, un input `{ "value": 42 }`, un button `{}`.
La risposta dell'azione contiene `status: "published"`, senza presentare lo stato richiesto come confermato.
Solo gli amministratori leggono e salvano le definizioni con `GET` e `PUT /device-types/:id/widgets`.
Tutti i dispositivi dello stesso tipo ereditano le definizioni; `GET /devices/:code/widgets`
restituisce soltanto la proiezione per la dashboard e non consente configurazioni individuali.
Il contratto dei widget è alla versione 2: lettura, configurazione, revisione dei salvataggi e oggetti
per ciascun tipo sono descritti nella [guida ai widget](WIDGETS.md).
Le azioni del portale non richiedono di distribuire agli utenti le credenziali MQTT dei dispositivi.

## Errori

Gli errori restituiscono un oggetto JSON con `error`.

| Stato HTTP | Significato |
| --- | --- |
| `400` | Topic o contenuto non validi, oppure broker non configurato |
| `401` | Credenziali mancanti o errate; sessione scaduta o revocata |
| `403` | Topic non autorizzato o cambio password obbligatorio |
| `404` | Dispositivo, tipo o widget inesistente |
| `409` | Dispositivo già assegnato oppure configurazione widget del tipo modificata da un altro editor |
| `429` | Troppe richieste: rispettare l’header `Retry-After` |
| `500` | Pubblicazione fallita: verificare configurazione e connessione al broker |

Per provisioning e messaggi pubblicati dagli ESP vedere la [guida MQTT](MOSQUITTO.md#firmware-esp).
Per l’elenco degli altri endpoint vedere il [README principale](../README.md#api-essenziali).
