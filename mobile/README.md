# Client Android

App Flutter in sviluppo. Sono presenti login, lista device, proprietà in sola lettura,
elenco dei widget e navigazione alle impostazioni del device.
Azioni, realtime e widget Home Android sono ancora da implementare.

```sh
flutter pub get
flutter run
```

La base API è configurata in `lib/main.dart`: cambiarla per usare il proprio server HTTPS.
Il client condivide Dio e un cookie jar in memoria; la sessione non viene conservata dopo il riavvio.

```sh
flutter analyze
flutter test
```

Per proseguire lo sviluppo seguire la [guida Flutter](../FLUTTER-GUIDE.md).
