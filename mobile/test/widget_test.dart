import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/auth_service.dart';
import 'package:mobile/services/device_service.dart';

void main() {
  testWidgets('app starts on the login form', (tester) async {
    final client = ApiClient(baseUrl: 'https://example.invalid/api/');
    await tester.pumpWidget(
      MyApp(
        authService: AuthService(client),
        deviceService: DeviceService(client),
      ),
    );

    expect(find.text('Device Portal'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(find.widgetWithText(FilledButton, 'Accedi'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
