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
```

Il login usa cookie HttpOnly. Le richieste passano da `src/api/apiClient.ts`.
Settings ha le schede Password e MQTT; broker, ACL e sincronizzazione sono visibili solo agli admin.
Le azioni dei widget passano dal backend e gli aggiornamenti arrivano tramite SSE.

Per deployment e permessi vedere il [README principale](../README.md).
