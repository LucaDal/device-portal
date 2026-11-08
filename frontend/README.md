# Interfaccia web

React, TypeScript e Vite. Le regole condivise si trovano in `../shared`.

```sh
npm ci
npm run dev
```

Aprire `http://localhost:5173`. In locale l’interfaccia chiama l’API sulla porta `3000` dello stesso host:
`CORS_ALLOWED_ORIGINS` deve includere `http://localhost:5173`.
Dietro Nginx le chiamate passano da `/api`.

Verifiche:

```sh
npx tsc --noEmit
npm run build
npm test
```

Usare Node 24 per la build, come nel Dockerfile. I test web riutilizzano il runner TypeScript
del backend: eseguire anche `npm --prefix ../backend ci` se non è già installato.

Il login usa cookie HttpOnly. Le richieste passano da `src/api/apiClient.ts`.
Settings ha le schede Password e MQTT; broker, ACL e sincronizzazione sono visibili solo agli admin.
I widget si definiscono nella scheda **Device Types → Widgets** e sono comuni a tutti i dispositivi del tipo.
Le azioni dei widget passano dal backend e gli aggiornamenti arrivano tramite SSE.

Oggetti, validazione, componenti e stato dei widget sono descritti nella [guida ai widget](../docs/WIDGETS.md).

Per deployment e permessi vedere il [README principale](../README.md).
