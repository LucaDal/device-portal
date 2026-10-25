import 'package:flutter/material.dart';
import 'package:mobile/services/device_service.dart';
import 'pages/login_page.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';

void main() {
  final client = ApiClient(
    baseUrl: 'https://deviceportal.lucadalessandro.freeddns.org/api/',
  );
  final authService = AuthService(client);
  final deviceService = DeviceService(client);

  runApp(MyApp(authService: authService, deviceService: deviceService));
}

class MyApp extends StatelessWidget {
  final AuthService authService;
  final DeviceService deviceService;

  const MyApp({
    super.key,
    required this.authService,
    required this.deviceService,
  });

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.deepPurple,
          brightness: Brightness.light,
        ),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.deepPurple,
          brightness: Brightness.dark,
        ),
      ),
      themeMode: ThemeMode.dark,
      home: LoginPage(authService: authService, deviceService: deviceService),
    );
  }
}
