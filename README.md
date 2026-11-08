# Device Portal

Portale per gestire dispositivi ESP, utenti, proprietà, firmware OTA e dashboard MQTT.

| Cartella | Contenuto |
| --- | --- |
| `backend/` | API Express, SQLite con schema Drizzle, autorizzazioni e MQTT |
| `frontend/` | Interfaccia React |
| `shared/` | Tipi e regole condivise |
| `mobile/` | Client Android Flutter in sviluppo |

## Avvio con Docker

```sh
cp .env.example .env
# Configurare .env prima di avviare.
docker compose -f docker-compose.release.yml up -d --build
```

Il file `docker-compose.yml` usa immagini pubblicate; `docker-compose.release.yml` compila il codice locale.
Le immagini usano Node 24 ([versioni supportate](https://nodejs.org/en/about/previous-releases)).
API e UI ascoltano su `127.0.0.1:3000` e `127.0.0.1:5173`.
Per includere Mosquitto, seguire [la guida MQTT](docs/MOSQUITTO.md).

In `.env` impostare:

- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: creano il primo amministratore; non modificano account esistenti.
- `JWT_SECRET`: almeno 32 caratteri casuali.
- `DEVICE_PROPERTIES_ENCRYPTION_KEY`: 32 byte casuali, in hex o base64.
- `CORS_ALLOWED_ORIGINS`: origine esatta dell’interfaccia, per esempio `https://portal.example.org`.
- `DB_PATH`: database locale (`./data.db`, avviando da `backend/`). Docker Compose imposta `/app/backend/data/data.db`, montato da `DB_PATH_HOST` sull’host.

Per generare valori casuali: `openssl rand -hex 32`. Usare valori distinti per ogni segreto.
Conservare database e chiave di cifratura insieme nei backup: senza la chiave i valori cifrati sono persi.
SQLite usa WAL: creare backup consistenti con l’API di backup SQLite o fermare il servizio prima della copia.

## Compilare e pubblicare API e UI

Eseguire dalla radice del repository. Le immagini includono `amd64` e `arm64`, quindi funzionano anche su Raspberry Pi.
Accedere a Docker Hub con un account autorizzato a pubblicare sul proprio profilo in caso si voglia gestire 
le immagini docker in autonomia.

```sh
docker login

# Creare il builder una sola volta.
docker buildx create --name device-portal-builder --use
docker buildx inspect --bootstrap

# Compilare e pubblicare l’API.
docker buildx build --platform linux/amd64,linux/arm64 \
  -t lucadal/device-portal:api -f backend/Dockerfile --push .

# Compilare e pubblicare la UI.
docker buildx build --platform linux/amd64,linux/arm64 \
  -t lucadal/device-portal:ui -f frontend/Dockerfile --push .
```

Alle esecuzioni successive selezionare il builder con `docker buildx use device-portal-builder`.
`--push` carica le immagini su Docker Hub con i tag già usati da `docker-compose.yml`.

Sul server, dalla cartella con Compose e `.env`, scaricare e avviare le nuove immagini:

```sh
docker compose pull api ui
docker compose up -d api ui
```

Se usi Mosquitto, aggiungere `-f docker-compose.yml -f docker-compose.mosquitto.yml` dopo `docker compose` in entrambi i comandi.

## Reverse proxy

Esporre il portale tramite Nginx in HTTPS. Nel server Nginx configurato con il proprio certificato:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
location / {
    proxy_pass http://127.0.0.1:5173/;
}
```

## Uso

1. Accedere come admin e invitare gli utenti; al primo accesso devono cambiare password.
2. Creare un Device Type con proprietà, firmware ed eventuali topic MQTT; definire i widget nella scheda **Widgets**.
3. Creare il device inserendo nome e tipo: il codice viene generato automaticamente ed è copiabile dalle azioni della riga.
   Con un'email di un utente esistente, il device viene assegnato e attivato subito; senza email resta libero e inattivo.
   Il secret viene mostrato all'amministratore soltanto alla creazione e va caricato sul dispositivo.
4. Per aggiungere un device libero al proprio account basta il codice. Un device assegnato non può essere acquisito da un altro utente.
5. Il proprietario modifica le proprietà e condivide il device. Gli amministratori configurano i widget soltanto nel Device Type.

Le stringhe sensibili sono cifrate. Le proprietà salvate sono leggibili da proprietario e admin;
gli utenti condivisi usano i widget. Le proprietà globali restano nel Device Type e non compaiono nei dettagli del device; quelle non globali sono sempre elencate, senza un flag di visibilità.
Ogni tipo di widget ha un proprio oggetto e una validazione condivisa; vedere la [guida ai widget](docs/WIDGETS.md). Un nuovo device eredita i widget del proprio Device Type. In **Device Types → New Type → Clone from Device Type** si possono copiare proprietà, firmware, MQTT e widget indicando un nuovo Type ID; la copia è indipendente dall’originale. I singoli device non si clonano.

**Settings** contiene le schede Password e MQTT. Solo l’admin vede broker, ACL e stato di sincronizzazione.
L'unico topic integrato è `availability`. Abilitando MQTT si generano `telemetry` e `commands` nel catalogo modificabile; `state` è facoltativo e definito dall'admin.
I widget su un topic che termina in `/#` richiedono un suffisso e mostrano il topic concreto risultante.
Gli indicatori della dashboard e dei dispositivi usano `online`/`offline` da `availability`; sono assenti quando MQTT è disabilitato.
Il provisioning MQTT v2 raccoglie tutti i topic in `topics`; `/device/configuration` contiene solo proprietà applicative. Aggiornare il firmware al [nuovo formato](docs/MOSQUITTO.md#firmware-esp).
La CA MQTT è facoltativa: TLS usa le CA di sistema, una CA privata oppure la verifica disabilitata esplicitamente.

## API essenziali

Esempi di autenticazione, invio comandi MQTT e gestione degli errori nella [guida di integrazione API](docs/API.md).

Il proxy aggiunge `/api` ai percorsi. Il web usa cookie HttpOnly con sessione di un’ora. Cambio password, ruolo o reinvito revocano le sessioni precedenti.

| Operazione | Endpoint |
| --- | --- |
| Login / sessione / logout | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Device accessibili, con nome e codice | `GET /devices` |
| Creazione device admin | `POST /devices` con `name`, `device_type_id` e `owner_email` opzionale |
| Associazione device | `POST /devices/register` con il solo `code` |
| Proprietà | `PUT /devices/:code/properties` |
| Configurazione widget del tipo (admin) | `GET /device-types/:id/widgets`, `PUT /device-types/:id/widgets` |
| Widget / azione | `GET /devices/:code/widgets`, `POST /devices/:code/widgets/:widgetId/action` |
| Aggiornamenti realtime | `GET /mqtt/stream` |
| Configurazione device | `GET /device/configuration` con `x-device-code`, `x-device-secret` |
| Credenziali MQTT device | `GET /device/mqtt-credentials` via HTTPS con `x-device-code`, `x-device-secret` |
| Firmware OTA | `GET /ota/firmware` con gli stessi header più `x-device-type-id` |
| Versione firmware | `GET /ota/firmware/version` con `x-device-type-id` e `x-device-secret` |
| Upload firmware admin | `PUT /ota/firmware`, Basic Auth admin, `x-device-type-id`, campi `file` e `version` |

`/device` serve il dispositivo autenticato tramite i suoi header; `/devices` serve il portale con sessione utente.
`/ota` contiene solo firmware. I vecchi percorsi non hanno alias: aggiornare gli URL nel firmware ESP.

## Database

Le tabelle sono definite come oggetti TypeScript in `backend/src/db/schema/`; le query sono
centralizzate in `backend/src/repositories/`. Vincoli, indici e tipi derivano dallo schema.
La [guida al database](docs/DATABASE.md) descrive relazioni, query, Drizzle Studio e avvio da zero.

Questo schema richiede un database nuovo: non sono previste migrazioni. Per lo sviluppo usare
un nuovo `DB_PATH`; con Compose impostare `DB_PATH_HOST` su una nuova cartella persistente.
Un database con schema diverso viene rifiutato senza convertirne i dati.

## Sviluppo e verifiche

```sh
cd backend
npm ci
npm run build
npm test
```

I test MQTT richiedono Mosquitto e il plugin Dynamic Security; usano porte locali e dati temporanei.
Per avviare l’API senza PM2: `npx ts-node -r tsconfig-paths/register src/server.ts`.
Da host impostare `DB_PATH` su un percorso scrivibile e caricare le variabili del proprio `.env`.

Altre guide: [frontend](frontend/README.md), [mobile](mobile/README.md),
[percorso Flutter](FLUTTER-GUIDE.md), [attività aperte](TO-DO.md).

Questa versione rimuove la clonazione dei singoli device, gli hook ACL EMQX e vecchi formati delle password MQTT.
I link MQTT devono rispettare le regole nella guida MQTT; non è prevista retrocompatibilità.
