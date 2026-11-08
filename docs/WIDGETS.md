# Widget

Ogni tipo è un oggetto separato in `shared/widgets/`: definisce i suoi campi,
`create(id)` per iniziare una configurazione e `parse(raw)` per validarla.
Editor, backend e repository usano le stesse definizioni. Il contratto HTTP dei widget è **v2**.
Il provisioning delle credenziali MQTT usa una versione indipendente, attualmente v2.
L'unico topic integrato è `availability`. `telemetry` e `commands` sono voci modificabili del catalogo,
generate all'abilitazione MQTT; `state` può essere aggiunto dall'admin come normale proprietà MQTT.

| Oggetto | File | Configurazione |
| --- | --- | --- |
| `valueWidget` | `shared/widgets/value.ts` | Sorgente dello stato obbligatoria |
| `textWidget` | `shared/widgets/text.ts` | Sorgente dello stato obbligatoria |
| `switchWidget` | `shared/widgets/switch.ts` | Comando ON/OFF obbligatorio; feedback opzionale con una propria coppia ON/OFF |
| `buttonWidget` | `shared/widgets/button.ts` | Comando con valore tipizzato oppure payload JSON esplicito |
| `inputWidget` | `shared/widgets/input.ts` | Comando con tipo stringa, numero o booleano; limiti opzionali per i numeri |

`definitions.ts` raccoglie gli oggetti in `WIDGET_TYPES`. TypeScript verifica che il registro
copra tutti i membri dell'unione `DeviceDashboardWidget` con il tipo corretto.
I controlli condivisi sui campi sono in `validationFields.ts`; `validation.ts` coordina
la validazione della lista, degli ID e dei riferimenti ai topic.

## Un oggetto completo

```json
{
  "id": "relay",
  "kind": "switch",
  "label": "Relè",
  "state": {
    "topicKey": "telemetry",
    "topicSuffix": "relay/state",
    "path": "/reported/enabled",
    "onValue": "ON",
    "offValue": "OFF"
  },
  "command": {
    "topicKey": "commands",
    "topicSuffix": "relay/set",
    "path": "/desired/enabled",
    "onValue": true,
    "offValue": false
  }
}
```

Il messaggio ricevuto può contenere `{"reported":{"enabled":"ON"}}`, mentre il comando
inviato contiene `{"desired":{"enabled":true}}`. Il firmware legge il comando dentro
l'involucro MQTT `content`, come per le altre pubblicazioni del portale.
Stato e comando possono avere topic, percorsi e rappresentazioni dei valori diversi.

Se il topic selezionato termina in `/#`, `topicSuffix` è obbligatorio sia per lo stato sia per il comando,
anche nei pulsanti con payload JSON. Il suffisso sostituisce `#`: ad esempio `relay/state` sotto
`devices/{deviceCode}/telemetry/#` diventa `devices/<codice>/telemetry/relay/state`.
Il suffisso è relativo, senza wildcard, placeholder, slash iniziali/finali o livelli vuoti.
Su un topic esatto `topicSuffix` non è ammesso. L'editor mostra il campo soltanto quando serve e
visualizza l'anteprima del topic finale. Il backend risolve gli stessi binding e non pubblica mai su `#`.
Il feedback letto su un catalogo di comandi genera soltanto i permessi per il sotto-topic scelto.

`state.path` e `command.path` sono JSON Pointer: `/temperature`, `/relay/enabled`;
`~1` rappresenta `/` e `~0` rappresenta `~` in un nome di campo.
Senza percorso, il lettore usa `value` se presente oppure l'intero contenuto;
il comando con un valore genera `{"value": ...}`.

Per il pulsante scegliere una delle due forme:

```json
{"topicKey":"commands","topicSuffix":"relay/set","mode":"value","path":"/code","value":"001"}
```

```json
{"topicKey":"commands","topicSuffix":"relay/set","mode":"payload","payload":{"reset":true,"mode":"soft"}}
```

I valori del payload esplicito sono stringhe, numeri finiti o booleani.
Il tipo si sceglie nell'editor: la stringa `"001"` resta una stringa e `"true"`
non diventa automaticamente un booleano. Gli input numerici applicano gli stessi
limiti nel browser e nel backend.

## Stato e comandi

Il backend risolve i riferimenti del catalogo MQTT e restituisce una proiezione per la dashboard:
identità, disponibilità e binding dello stato. I comandi completi sono presenti soltanto
nella configurazione restituita agli utenti autorizzati a modificarla.

- Un valore non ancora ricevuto è sconosciuto. Lo switch mostra `Unknown` con azioni ON/OFF esplicite.
- L'invio confermato dal broker produce `status: "published"`: la risposta HTTP non contiene uno stato del dispositivo.
- Gli switch con feedback e gli input con feedback attendono un messaggio successivo con il valore previsto.
  Il confronto preserva i tipi: `true`, `1` e `"true"` sono valori diversi.
- Per gli switch il valore atteso proviene da `state.onValue` o `state.offValue`, indipendentemente dal comando.
- I messaggi retained ricevuti alla sottoscrizione e i messaggi riprodotti dalla cache SSE
  possono aggiornare la visualizzazione, ma non confermano un nuovo comando.
- Dopo dieci secondi senza corrispondenza, o se la connessione live si interrompe durante l'attesa,
  il widget segnala che il comando è stato inviato senza conferma. Non lo reinvia automaticamente.
- I pulsanti mostrano l'esito della pubblicazione: un loro eventuale stato non identifica da solo
  quale azione sia stata eseguita. Non viene inventata una conferma.

Il riscontro è un'osservazione dello stato, senza un ID di comando nel protocollo del firmware:
non prova che proprio quella richiesta abbia causato il cambiamento. La disponibilità del canale
realtime non prova neppure che il dispositivo sia online; vedere `topics.availability` nella guida MQTT.

## Salvare e modificare

I widget si configurano soltanto in **Device Types → Widgets**, con accesso amministratore.
La definizione appartiene al tipo: tutti i suoi dispositivi la ereditano, inclusi quelli creati
successivamente. Non esistono copie o personalizzazioni per dispositivo. Topic e stato vengono
risolti separatamente per ogni dispositivo, usando il suo codice e il suo proprietario.
Le dashboard già aperte caricano la nuova definizione al successivo caricamento della pagina.

Il database conserva la definizione completa in `device_type_widgets.definition`, con ordine e identità
indicizzati per `device_type_id`. Il vincolo sull'identità impedisce che l'ID JSON differisca da `widget_id`.
`device_types.widgets_revision` protegge l'intera configurazione da sovrascritture concorrenti.
Il repository è `backend/src/repositories/deviceTypeWidgetRepository.ts`; l'editor è
`frontend/src/deviceTypes/DeviceTypeWidgetsEditor.tsx`.

`GET /device-types/:id/widgets` restituisce agli amministratori:

```json
{
  "schemaVersion": 2,
  "deviceTypeId": "sensor",
  "configuration": {
    "revision": 0,
    "topics": [
      {"key":"availability","label":"Availability (online/offline)","topic":"devices/{deviceCode}/telemetry/availability","action":"publish"},
      {"key":"telemetry","label":"Telemetry","topic":"devices/{deviceCode}/telemetry/#","action":"publish"},
      {"key":"commands","label":"Commands","topic":"devices/{deviceCode}/commands/#","action":"subscribe"}
    ],
    "widgets": []
  }
}
```

Per salvare, `PUT /device-types/:id/widgets` riceve `{"revision":0,"widgets":[...]}`.
Si può configurare un tipo senza dispositivi o con MQTT disabilitato, purché i riferimenti ai topic
siano validi. Il salvataggio incrementa la revisione. Una revisione superata restituisce `409` senza
sovrascrivere le modifiche altrui: ricaricare la configurazione prima di salvare nuovamente.
Widget, revisione e ACL generate di tutti i dispositivi e utenti sono salvati nella stessa transazione.
Cancellare un dispositivo conserva i widget del tipo; cancellare un tipo inutilizzato elimina anche i suoi widget.

`GET /devices/:code/widgets` restituisce soltanto i widget ereditati per la dashboard:
`canConfigure` è sempre `false`, senza il campo `configuration`, anche per gli amministratori.
Le azioni restano su `POST /devices/:code/widgets/:widgetId/action` e verificano l'accesso al dispositivo.
La precedente scrittura `PUT /devices/:code/widgets` è stata rimossa.

Gli ID vengono generati dal browser e restano stabili durante rinomina e riordino.
L'editor mostra solo i campi del tipo selezionato e permette di cambiare l'ordine.
Cambiare tipo crea la configurazione specifica del nuovo oggetto, conservando ID ed etichetta.
Le modifiche ai topic di un tipo di dispositivo vengono rifiutate se invalidano i riferimenti
usati dai suoi widget. Un comando richiede un topic di sottoscrizione del dispositivo o `all`;
i wildcard non possono essere usati come destinazione di pubblicazione.

## Aggiungere un tipo

1. Aggiungere in `shared/widgets/` interfacce, oggetto, `create` e `parse`, riusando i controlli sui campi.
2. Includerlo nell'unione in `types.ts` e nel registro in `definitions.ts`; esportarlo da `index.ts`.
3. Aggiornare proiezione e azione nel servizio dashboard, se il nuovo tipo invia comandi.
4. Aggiungere il componente in `frontend/src/widgets/` e i campi del suo editor.
5. Aggiornare il modello corrispondente del client mobile e i test.
6. Rigenerare lo schema con `npm run build` nel backend. I tipi ammessi dal database derivano dal registro.

Lo schema richiede un database nuovo, senza migrazioni; seguire [DATABASE.md](DATABASE.md).
Per verificare backend, editor e modelli usare `npm test` nelle rispettive cartelle JavaScript
ed eseguire `flutter analyze` e `flutter test` in `mobile/`.
I test web riutilizzano il runner TypeScript già installato nel backend: installare le dipendenze di entrambi.
