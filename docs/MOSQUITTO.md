# MQTT e Mosquitto

Mosquitto autentica i device e applica le ACL con Dynamic Security.
SQLite contiene la configurazione; il backend la sincronizza con una coda persistente.
Il web e il mobile usano le API del portale: non ricevono password del broker.
Per inviare comandi come utente vedere la [guida di integrazione API](API.md).

## Avvio

1. Preparare `.env` come descritto nel [README](../README.md).
2. Generare i segreti: `node scripts/create-mqtt-secrets.cjs`. I file esistenti vengono preservati.
3. Impostare `MQTT_PUBLIC_HOST`, `MQTT_PUBLIC_PORT` (default `8883`) e `MQTT_TLS_DIR`.
4. In `MQTT_TLS_DIR` mettere `fullchain.pem` e `privkey.pem`, leggibili dall’UID/GID `1883`.
   Usare file reali o includere le destinazioni dei symlink di Let’s Encrypt.
5. Avviare:

```sh
docker compose -f docker-compose.release.yml -f docker-compose.mosquitto.yml up -d --build
```

Solo la porta TLS è pubblicata; la `1883` resta nella rete Docker.
Il certificato deve coprire `MQTT_PUBLIC_HOST`. Dopo il rinnovo copiare entrambi i PEM e ricaricare:

```sh
docker compose -f docker-compose.release.yml -f docker-compose.mosquitto.yml kill -s HUP mosquitto
```

Salvare nei backup `secrets/`, volume Mosquitto, database e chiave di cifratura.
Cambiare un file secret dopo l’inizializzazione non cambia la password già registrata nel broker.

## Impostazioni e ACL

MQTT funziona quando il device è attivo, il suo Device Type ha MQTT abilitato e il device non è escluso.
I nuovi tipi partono con MQTT disabilitato. Solo l’admin modifica questi flag.

In **Settings → MQTT settings**:

- con Dynamic Security la connessione viene dal deployment ed è mostrata in sola lettura;
- con un broker esterno si modificano host, credenziali e TLS; l’autenticazione dei device va configurata sul broker;
- con `mqtts` e “Allow insecure TLS” disattivato, la CA è facoltativa: Node.js verifica il server usando le CA attendibili predefinite;
- certificato e chiave client sono facoltativi, ma devono essere forniti insieme;
- “Allow insecure TLS” disabilita la verifica del server;
- le password non vengono restituite: campo vuoto conserva la password, “Remove” la cancella.

Se la password salvata non è leggibile, il modulo resta accessibile: reinserirla o rimuoverla esplicitamente.

La sezione **MQTT ACL and synchronization** mostra ACL attese, ACL lette sul broker e job pendenti.
Per gli utenti mostra i permessi del portale. Gli inviti e le condivisioni aggiornano automaticamente le ACL.

I job vengono elaborati ogni secondo; gli errori vengono ritentati con attese fino a 60 secondi.
La riconciliazione periodica ripristina le identità gestite e rimuove quelle orfane.
Durante un guasto del broker restano valide le ultime ACL applicate: una modifica in coda non è ancora confermata.
Disabilitare MQTT rimuove i permessi del portale subito e l’identità broker alla successiva sincronizzazione.
Riabilitare MQTT genera nuove credenziali.

## Topic e link

I topic del Device Type hanno `key`, `topic`, `action` (`publish`, `subscribe`, `all`).
Le azioni descrivono il device: se pubblica telemetria, l’utente può leggerla; se riceve comandi, l’utente può inviarli.

I template accettano `{deviceCode}`, `{ownerId}`, `{deviceTypeId}`.
Devono contenere un segmento completo `{deviceCode}` o `{ownerId}`; niente wildcard o topic di sistema.

Un link usa `linkedTopic: { deviceTypeId, topicKey }` e conserva la propria `key`.
Il target deve essere un topic diretto con un segmento `{ownerId}`, per isolare i proprietari.
Nelle sottoscrizioni collegate `{deviceCode}` diventa `+`.
Per pubblicare tramite link il target non deve contenere `{deviceCode}`: MQTT non pubblica su wildcard.
Esempio di target sottoscrivibile: `owners/{ownerId}/{deviceTypeId}/{deviceCode}/state`.
Riferimenti mancanti, concatenati o non sicuri vengono rifiutati.

## Firmware ESP

### Credenziali di connessione

Il provisioning richiede Dynamic Security abilitato e un device attivo con MQTT disponibile.
Richiesta HTTPS:

```http
GET /api/device/mqtt-credentials
x-device-code: ESP32-001
x-device-secret: <secret-di-provisioning>
```

Esempio di risposta con valori fittizi:

```json
{
  "schemaVersion": 1,
  "protocol": "mqtts",
  "host": "mqtt.example.org",
  "port": 8883,
  "username": "dp-device:ESP32-001",
  "password": "password-mqtt-casuale-specifica-del-device",
  "clientId": "ESP32-001",
  "syncStatus": "synced",
  "keepalive": 30,
  "availabilityTopic": "devices/ESP32-001/telemetry/availability",
  "stateTopic": "devices/ESP32-001/telemetry/state"
}
```

Usare host, porta, username, password e client ID ricevuti. `keepalive` è espresso in secondi.
La password MQTT è distinta dal secret di provisioning e resta valida fino alla rotazione o alla revoca.
Non salvare la risposta nei log. Se `syncStatus` è `pending`, attendere e ritentare con attesa crescente.

### Stato e disponibilità

Il firmware pubblica su `stateTopic` lo stato reale alla connessione e quando cambia.
Dopo un comando di accensione, conferma lo stato del relè una volta eseguito il comando.
Esempio sul topic `devices/ESP32-001/telemetry/state`, con **QoS 1 e retained**:

```json
{
  "relay": true,
  "temperature": 23.4,
  "brightness": 80
}
```

I campi sono scelti dal firmware; il backend non produce automaticamente questi dati.
Per visualizzarli, definire `devices/{deviceCode}/telemetry/state` nel catalogo MQTT con azione `publish`
e associare i widget ai campi tramite `stateValuePath`, per esempio `/relay` o `/temperature`.
È accettato anche un payload racchiuso in `content`: lo stream SSE estrae il contenuto prima di aggiornare i widget.

Retained permette alle nuove sottoscrizioni di ricevere l’ultimo stato pubblicato.
`availabilityTopic` comunica invece `online` o `offline`: lo stato retained da solo non conferma che il device sia connesso.

Il firmware deve:

1. Verificare TLS e usare credenziali e client ID ricevuti.
2. Configurare una Last Will retained QoS 1 `offline` su `availabilityTopic`, poi pubblicare `online` alla connessione.
3. Sottoscrivere i comandi e pubblicare lo stato reale su `stateTopic` con QoS 1 e retained.
4. Gestire comandi duplicati senza invertire lo stato due volte; non conservare i comandi come retained.
5. Ripetere il provisioning se la password viene rifiutata.

`GET /api/device/configuration` restituisce proprietà e topic risolti con gli stessi header. Il firmware ESP non è incluso nel repository.

## Diagnostica e realtime

| Endpoint admin | Uso |
| --- | --- |
| `GET /mqtt/admin/dynsec` | Coda, tentativi e prossimi retry |
| `GET /mqtt/admin/dynsec/:deviceCode/acl` | ACL attese e applicate |
| `POST /mqtt/admin/dynsec/reconcile` | Richiede una riconciliazione |
| `POST /mqtt/admin/dynsec/:deviceCode/rotate` | Rigenera la password MQTT |

Publish e SSE usano MQTT.js; non servono processi `mosquitto_pub`/`mosquitto_sub` nell’API.
Lo stream invia eventi `ready`, `mqtt-message`, `mqtt-error` e applica anche i dinieghi ACL.
Cache: massimo 500 messaggi e 8 MiB; payload realtime fino a 256 KiB. I client troppo lenti vengono disconnessi.
Per verificare: `cd backend && npm run test:mqtt-dynsec`.
Il plugin di test predefinito è `/usr/lib/mosquitto_dynamic_security.so`; si può cambiare con `MOSQUITTO_DYNSEC_PLUGIN`.
