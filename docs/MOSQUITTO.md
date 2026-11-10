# MQTT e Mosquitto

Mosquitto autentica i device e applica le ACL con Dynamic Security.
SQLite contiene topic, widget e ACL; il backend sincronizza le identità con una coda persistente.
La connessione del portale al broker è configurata soltanto nell'ambiente del server, mai nel database.
Il web e il mobile usano le API del portale: non ricevono password del broker.
Per inviare comandi come utente vedere la [guida di integrazione API](API.md).

## Avvio

1. Preparare `.env` come descritto nel [README](../README.md).
2. Generare i segreti: `node scripts/create-mqtt-secrets.cjs`. I file esistenti vengono preservati.
3. Specificare in `.env` la connessione del portale e il dominio pubblico:

```dotenv
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_BROKER_USERNAME=dp-backend
MQTT_PUBLIC_HOST=mqtt.example.org
```

Compose legge URL e account del portale da `.env`, abilita Dynamic Security e monta i secret generati.
La password del portale è fornita da `MQTT_BROKER_PASSWORD_FILE` nel container; l'account di controllo
usa un secret separato. Non inserire le password nell'URL del broker.
`MQTT_PUBLIC_PORT` (default `8883`) e `MQTT_PROXY_PORT` (default `1883`) si impostano soltanto
per usare porte diverse. `MQTT_TLS_DIR` serve soltanto per il TLS diretto sul broker.
Il dominio e la porta pubblici sono quelli raggiungibili dai dispositivi, in entrambe le modalità.

### TLS su Nginx (predefinito)

Nginx gestisce il certificato pubblico e inoltra MQTT al broker. `MQTT_TLS_DIR` non è utilizzata.
Avviare:

```sh
docker compose -f docker-compose.release.yml -f docker-compose.mosquitto.yml up -d --build
```

Per usare le immagini pubblicate sostituire `docker-compose.release.yml` con `docker-compose.yml`.
Mosquitto espone `1883` nel container e soltanto `127.0.0.1:${MQTT_PROXY_PORT:-1883}` sull'host:
la connessione non cifrata non deve essere esposta su Internet.

Se Nginx gira sull'host, il suo upstream MQTT deve puntare a `127.0.0.1:1883` oppure alla porta
scelta in `MQTT_PROXY_PORT`. Usare il modulo `stream` con supporto SSL, non un `location` HTTP.
L'esempio completo è in [nginx/mqtt-stream.conf.example](../nginx/mqtt-stream.conf.example).
Adattare il dominio dei certificati e la porta pubblica a `MQTT_PUBLIC_HOST` e `MQTT_PUBLIC_PORT`.
Nel file principale di Nginx, fuori dal blocco `http`, includere il file del server MQTT nel blocco
`stream` esistente, per esempio:

```nginx
stream {
    include /etc/nginx/streams-enabled/*.conf;
}
```

Il file di esempio contiene soltanto il blocco `server` e va installato nella directory inclusa,
per esempio `/etc/nginx/streams-enabled/device-portal-mqtt.conf`.
Se hai già un server `stream` MQTT, aggiornare quello esistente senza creare un secondo listener
sulla stessa porta. Validare con `nginx -t` e ricaricare Nginx dopo la modifica.

Se Nginx gira in un altro container, collegarlo alla rete `mqtt-internal` di questo progetto
(il nome effettivo è `<progetto>_mqtt-internal`) e usare `proxy_pass mosquitto:1883;`.
Il localhost di un container non è l'host Docker.

Il certificato deve coprire `MQTT_PUBLIC_HOST`. Certbot continua a rinnovarlo nel percorso
Let’s Encrypt già usato da Nginx. L'automazione del rinnovo deve ricaricare Nginx dopo un rinnovo
riuscito, come fa l'installer Nginx di Certbot; se usi `certonly`, configura un deploy hook di reload.
Non occorre copiare certificati nel container Mosquitto o ricaricare il broker.
Riferimenti: [Nginx stream SSL](https://nginx.org/en/docs/stream/ngx_stream_ssl_module.html)
e [rinnovi Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

### TLS direttamente su Mosquitto (opzionale)

Richiede Docker Compose 2.24.4 o successivo per sostituire le porte con `!override`.
Impostare `MQTT_TLS_DIR` sulla directory host che contiene `fullchain.pem` e `privkey.pem`,
leggibili dall’UID/GID `1883`. Usare file reali: i link in `/etc/letsencrypt/live` puntano ad `archive`,
che non viene montata da questa configurazione.
Avviare aggiungendo l'overlay TLS dopo quello Mosquitto:

```sh
docker compose -f docker-compose.release.yml -f docker-compose.mosquitto.yml \
  -f docker-compose.mosquitto-tls.yml up -d --build
```

Il broker pubblica direttamente `${MQTT_PUBLIC_PORT:-8883}` con TLS. La pubblicazione localhost
di `1883` viene rimossa; l'API continua a usare `mosquitto:1883` nella rete Docker.
Il certificato deve coprire `MQTT_PUBLIC_HOST`. In questa modalità Nginx non deve occupare la stessa
porta pubblica. Al rinnovo aggiornare entrambi i PEM nella directory montata e ricaricare il broker;
queste operazioni possono essere eseguite da un deploy hook di Certbot:

```sh
docker compose -f docker-compose.release.yml -f docker-compose.mosquitto.yml \
  -f docker-compose.mosquitto-tls.yml kill -s HUP mosquitto
```

Nelle operazioni successive usare sempre gli stessi file Compose della modalità scelta.
Entrambe le modalità mantengono gli stessi dati, utenti e ACL. I dispositivi continuano a ricevere
`mqtts`, dominio e porta pubblici da `/device/mqtt-configuration`.

Salvare nei backup `secrets/`, volume Mosquitto, database e chiave di cifratura.
Cambiare un file secret dopo l’inizializzazione non cambia la password già registrata nel broker.

## Impostazioni e ACL

MQTT funziona quando il device è attivo, il suo Device Type ha MQTT abilitato e il device non è escluso.
I nuovi tipi partono con MQTT disabilitato. Solo l’admin modifica questi flag.

In **Settings → MQTT settings**:

- la connessione del portale e quella pubblica dei dispositivi sono mostrate soltanto in lettura;
- non ci sono form o endpoint HTTP per cambiare la connessione al broker, anche usando un broker esterno;
- le password non vengono mai restituite; il pannello resta leggibile anche se un file secret non è accessibile;
- la diagnostica e la visualizzazione delle ACL restano disponibili agli amministratori.

Per un broker esterno, avviare API e UI senza l'overlay Mosquitto e configurare `.env`:

```dotenv
MQTT_BROKER_URL=mqtts://broker.example.org:8883
MQTT_BROKER_USERNAME=portal
MQTT_BROKER_PASSWORD=your-broker-password
```

In alternativa alla password diretta si può impostare `MQTT_BROKER_PASSWORD_FILE` con il percorso
di un file leggibile dal processo API. Se sono definiti entrambi, il file ha precedenza.
Le altre opzioni TLS per la connessione del portale sono:

| Variabile | Uso |
| --- | --- |
| `MQTT_BROKER_CA_FILE` | CA privata; omettere per usare le CA di sistema |
| `MQTT_BROKER_CLIENT_CERT_FILE` | Certificato client, soltanto per mTLS |
| `MQTT_BROKER_CLIENT_KEY_FILE` | Chiave client, da fornire insieme al certificato |

Questi percorsi devono esistere **nel container API**, montandoli se necessario.
Con `mqtts` la verifica del certificato server è sempre attiva; non esiste un'opzione per disabilitarla.
Il prefisso dei client ID è generato dal server e non è un parametro di configurazione.
L'autenticazione dei dispositivi su un broker esterno va predisposta sul broker stesso.

`MQTT_TLS_DIR` configura soltanto il listener TLS del Mosquitto incluso, tramite l'overlay TLS.
Non è una directory di certificati client del portale.
Dopo modifiche a `.env`, ricreare il
container API con `docker compose ... up -d api` usando gli stessi file Compose del deployment:
un semplice riavvio non aggiorna le variabili d'ambiente del container.

La sezione **MQTT ACL and synchronization** mostra ACL attese, ACL lette sul broker e job pendenti.
Per gli utenti mostra i permessi del portale. Gli inviti e le condivisioni aggiornano automaticamente le ACL.

I job vengono elaborati ogni secondo; gli errori vengono ritentati con attese fino a 60 secondi.
La riconciliazione periodica ripristina le identità gestite e rimuove quelle orfane.
Durante un guasto del broker restano valide le ultime ACL applicate: una modifica in coda non è ancora confermata.
Disabilitare MQTT rimuove i permessi del portale subito e l’identità broker alla successiva sincronizzazione.
Riabilitare MQTT genera nuove credenziali.

## Topic e link

I topic del Device Type hanno `key`, `topic`, `action` (`publish`, `subscribe`, `all`).
L'unico topic integrato è `availability`, riservato a `online`/`offline` e non modificabile.
Abilitando MQTT si generano nel catalogo le voci modificabili `telemetry` (`publish`) e `commands`
(`subscribe`), con filtri `devices/{deviceCode}/telemetry/#` e `devices/{deviceCode}/commands/#`.
L'admin può cambiare questi topic e aggiungerne altri. `state` non è integrato: è una normale
proprietà MQTT, da creare soltanto se necessaria.
Alla riabilitazione vengono aggiunte le voci predefinite mancanti, senza sovrascrivere quelle già configurate.
Definizioni e valori predefiniti sono in `shared/constants/mqtt.ts`; il catalogo del tipo è salvato
nel database. I permessi del dispositivo derivano da questo catalogo, senza autorizzazioni implicite
per telemetria o comandi. `availability` resta sempre disponibile per i dispositivi con MQTT attivo.

Le viste ACL di Users, Devices e Settings condividono lo stesso elenco. Il topic completo si apre
con l'icona dell'occhio; nelle ACL il valore viene preparato solo al clic e conservato fino alla chiusura
o al cambio del topic. **Generated MQTT ACL** mantiene anche la copia del topic.
Le anteprime nella scheda MQTT dei Device Type restano sempre visibili, senza controllo mostra/nascondi.
L'elenco ACL scorre nello spazio assegnato dal contenitore, senza un'altezza massima fissa propria.

Il pulsante **MQTT info** raccoglie le spiegazioni di placeholder, azioni, wildcard e collegamenti.
L'anteprima nei Device Type è generica: `{ownerId}` e `{deviceCode}` restano placeholder,
senza selettore o caricamento dei dispositivi. Per i link usa il tipo sorgente e sostituisce il
codice con `+`. I valori concreti vengono risolti nelle viste Device e Users.
Senza `{deviceTypeId}`, un filtro collegato
può includere topic di altri tipi con lo stesso percorso e proprietario.
I nomi dei placeholder sono sensibili alle maiuscole: sono ammessi soltanto `{deviceCode}`,
`{ownerId}` e `{deviceTypeId}`. Errori di battitura e graffe non bilanciate vengono segnalati nella riga
e rifiutati dal backend prima del salvataggio.

Le azioni descrivono il device: se pubblica telemetria, l’utente può leggerla; se riceve comandi, l’utente può inviarli.

I template accettano `{deviceCode}`, `{ownerId}`, `{deviceTypeId}`.
Devono contenere un segmento completo `{deviceCode}` o `{ownerId}`. È ammesso soltanto un wildcard
finale `/#`, come livello separato; `+`, wildcard intermedi e topic di sistema non sono ammessi.

Un link usa `linkedTopic: { deviceTypeId, topicKey }` e conserva la propria `key`.
Il target deve essere un topic diretto con un segmento `{ownerId}`, per isolare i proprietari.
Nelle sottoscrizioni collegate `{deviceCode}` diventa `+`.
Per pubblicare tramite link il target non deve contenere `{deviceCode}`. Se il filtro termina in `/#`,
il widget deve specificare un suffisso concreto prima della pubblicazione.
Esempio di target sottoscrivibile: `owners/{ownerId}/{deviceTypeId}/{deviceCode}/state`.
Riferimenti mancanti, concatenati o non sicuri vengono rifiutati.

## Firmware ESP

### Configurazione MQTT

Il portale genera il codice del dispositivo alla creazione; il nome è una semplice etichetta e non cambia i topic MQTT.
Il secret mostrato una sola volta all'amministratore va memorizzato sul firmware insieme al codice.
L'utente aggiunge invece un dispositivo libero al proprio account usando soltanto il codice.

Il provisioning richiede Dynamic Security abilitato e un device attivo con MQTT disponibile.
Richiesta HTTPS:

```http
GET /api/device/mqtt-configuration
x-device-code: ESP32-001
x-device-secret: <secret-di-provisioning>
```

Esempio di risposta con valori fittizi:

```json
{
  "schemaVersion": 3,
  "protocol": "mqtts",
  "host": "mqtt.example.org",
  "port": 8883,
  "username": "dp-device:ESP32-001",
  "password": "password-mqtt-casuale-specifica-del-device",
  "clientId": "ESP32-001",
  "syncStatus": "synced",
  "keepalive": 30,
  "topics": {
    "publish": {
      "availability": "devices/ESP32-001/telemetry/availability",
      "telemetry": "devices/ESP32-001/telemetry/#"
    },
    "subscribe": {
      "commands": "devices/ESP32-001/commands/#"
    },
    "all": {}
  }
}
```

Usare host, porta, username, password e client ID ricevuti. `keepalive` è espresso in secondi.
La password MQTT è distinta dal secret di provisioning e resta valida fino alla rotazione o alla revoca.
Non salvare la risposta nei log. Se `syncStatus` è `pending`, attendere e ritentare con attesa crescente.

Le azioni sono dal punto di vista del dispositivo: `topics.publish` contiene i topic di sola
pubblicazione, `topics.subscribe` quelli di sola sottoscrizione e `topics.all` quelli bidirezionali.
I tre oggetti sono sempre presenti,
anche quando vuoti. Ogni voce è indicizzata dalla chiave del catalogo del Device Type; per esempio
`topics.publish.telemetry`. Per sottoscriversi il firmware scorre `topics.subscribe` e `topics.all`;
per pubblicare cerca in `topics.publish` e `topics.all`. Ogni topic compare soltanto nel gruppo
della propria azione. I gruppi sono generati dall'unico catalogo,
anche per i topic collegati, senza duplicare la configurazione salvata.

### Stato e disponibilità

Il firmware pubblica la telemetria sui sotto-topic del filtro `topics.publish.telemetry`, scegliendo nomi
come `measurements` o `relay/status`. `#` è un filtro: non si invia nei messaggi pubblicati.
Dopo un comando di accensione, conferma lo stato del relè una volta eseguito il comando.
Esempio sul topic `devices/ESP32-001/telemetry/measurements`, con **QoS 1 e retained**:

```json
{
  "relay": true,
  "temperature": 23.4,
  "brightness": 80
}
```

I campi sono scelti dal firmware; il backend non produce automaticamente questi dati.
Per visualizzarne i dati, il widget seleziona `telemetry`, imposta `state.topicSuffix: "measurements"`
e legge i campi tramite `state.path`, per esempio `/relay` o `/temperature`.
Un comando può selezionare `commands` con `command.topicSuffix: "relay/set"` per inviare
a `devices/ESP32-001/commands/relay/set`. Se l'admin definisce un topic esatto, non serve alcun suffisso.
I comandi usano un `command.path` indipendente: vedere la [struttura dei widget](WIDGETS.md).
È accettato anche un payload racchiuso in `content`: lo stream SSE estrae il contenuto prima di aggiornare i widget.

Retained permette alle nuove sottoscrizioni di ricevere l’ultimo stato pubblicato.
`topics.publish.availability` comunica invece `online` o `offline`: lo stato retained da solo non conferma che il device sia connesso.

Il firmware deve:

1. Verificare TLS e usare credenziali e client ID ricevuti.
2. Configurare una Last Will retained QoS 1 `offline` su `topics.publish.availability`, poi pubblicare `online` alla connessione.
3. Sottoscrivere i filtri di `topics.subscribe` e `topics.all`, tra cui `topics.subscribe.commands` se configurato, e pubblicare la telemetria sui sotto-topic concreti con QoS 1 e retained.
4. Prima di una disconnessione volontaria pubblicare `offline` retained; la Last Will copre le interruzioni inattese.
5. Gestire comandi duplicati senza invertire lo stato due volte; non conservare i comandi come retained.
6. Ripetere il provisioning se la password viene rifiutata.

`GET /api/device/configuration` restituisce soltanto le proprietà applicative con gli stessi header,
incluse le proprietà globali del tipo. Se una chiave è globale, il valore del tipo prevale su eventuali
vecchi valori locali. Tutta la configurazione MQTT si legge da `/api/device/mqtt-configuration`.
La risposta MQTT v3 raccoglie in `topics.publish`, `topics.subscribe` e `topics.all` availability e il catalogo personalizzato del tipo.
Il firmware usa i filtri ricevuti per le sottoscrizioni e topic concreti per le pubblicazioni.
Il codice ESP non è incluso nel repository.

Dashboard e lista dispositivi mostrano verde per `online`, arancione per `offline`, grigio quando
il dato non è ancora noto o il collegamento live al broker è interrotto. Se MQTT non è disponibile,
l'indicatore è assente. Il proprietario è identificato dall'email, separatamente dalla disponibilità MQTT.
Il firmware deve pubblicare questi valori: il portale non può dedurre la connessione da `activated`.
Il funzionamento di Last Will e retained è descritto nella [documentazione MQTT di Mosquitto](https://mosquitto.org/man/mqtt-7.html).

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
Per verificare le due modalità di deployment: `cd backend && node test/mqttDeployment.test.cjs`.
Questi test richiedono Docker Compose, Mosquitto 2.1 e OpenSSL installati, ma non avviano container.
