import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/device.dart';
import 'package:mobile/models/device_dashboard.dart';
import 'package:mobile/pages/device_dashboard_page.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/device_service.dart';

Map<String, dynamic> deviceJson({bool encoded = true}) {
  final definitions = {
    'enabled': {'type': 'bool', 'label': 'Abilitato'},
    'offset': {'type': 'float', 'label': 'Correzione'},
    'password': {'type': 'string', 'label': 'Password', 'sensitive': true},
    'optional': {'type': 'string', 'label': 'Nota', 'defaultValue': 'Default'},
    'hidden': {'type': 'string', 'visible': false},
  };
  final values = {
    'enabled': {'type': 'bool', 'value': false},
    'offset': {'type': 'float', 'value': 0},
    'password': {'type': 'string', 'value': 'example-secret'},
    'hidden': {'type': 'string', 'value': 'hidden-value'},
    'orphan': {'type': 'string', 'value': 'orphan-value'},
  };

  return {
    'code': 'ESP32-TEST',
    'device_type_id': 'esp32',
    'activated': 1,
    'is_shared': 0,
    'type_deviceProperties': encoded ? jsonEncode(definitions) : definitions,
    'device_properties': encoded ? jsonEncode(values) : values,
  };
}

class PendingDashboardService extends DeviceService {
  final Future<DeviceDashboard> result;
  int requests = 0;

  PendingDashboardService(this.result)
    : super(ApiClient(baseUrl: 'https://example.invalid/api/'));

  @override
  Future<DeviceDashboard> getDashboard(String deviceCode) {
    requests++;
    return result;
  }
}

void main() {
  testWidgets('devices without MQTT show properties without loading widgets', (
    tester,
  ) async {
    final service = PendingDashboardService(
      Completer<DeviceDashboard>().future,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: DeviceDashboardPage(
          device: Device.fromJson({...deviceJson(), 'mqtt_available': false}),
          deviceService: service,
        ),
      ),
    );
    expect(find.text('Proprietà'), findsOneWidget);
    expect(find.text('Abilitato'), findsOneWidget);
    expect(find.text('Widget'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(service.requests, 0);
  });

  test(
    'decodes encoded and object properties without inventing saved values',
    () {
      for (final encoded in [true, false]) {
        final device = Device.fromJson(deviceJson(encoded: encoded));
        final properties = device.properties!;

        expect(properties.map((property) => property.key), [
          'enabled',
          'offset',
          'password',
          'optional',
        ]);
        expect(properties[0].value, false);
        expect(properties[1].value, 0);
        expect(properties[2].sensitive, isTrue);
        expect(properties[3].value, isNull);
      }
    },
  );

  test(
    'distinguishes unavailable values from unset or undefined properties',
    () {
      final json = deviceJson();
      json['device_properties'] = null;
      expect(Device.fromJson(json).properties, isNull);

      json['device_properties'] = '{}';
      final unset = Device.fromJson(json).properties!;
      expect(unset, hasLength(4));
      expect(unset.every((property) => property.value == null), isTrue);

      json['type_deviceProperties'] = '{}';
      expect(Device.fromJson(json).properties, isEmpty);
    },
  );

  testWidgets(
    'properties remain visible during dashboard loading and failure',
    (tester) async {
      final result = Completer<DeviceDashboard>();
      await tester.pumpWidget(
        MaterialApp(
          home: DeviceDashboardPage(
            device: Device.fromJson(deviceJson()),
            deviceService: PendingDashboardService(result.future),
          ),
        ),
      );

      expect(find.text('Proprietà'), findsOneWidget);
      expect(find.text('Abilitato'), findsOneWidget);
      expect(find.text('No'), findsOneWidget);
      expect(find.text('0'), findsOneWidget);
      expect(find.text('Non impostato'), findsOneWidget);
      expect(find.text('example-secret'), findsNothing);
      expect(find.text('hidden-value'), findsNothing);
      expect(find.text('orphan-value'), findsNothing);

      result.completeError(const FormatException('Invalid dashboard'));
      await tester.pump();
      await tester.pump();

      await tester.scrollUntilVisible(
        find.text('Impossibile caricare la dashboard'),
        100,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Impossibile caricare la dashboard'), findsOneWidget);
      await tester.ensureVisible(find.byTooltip('Mostra valore'));
      await tester.tap(find.byTooltip('Mostra valore'));
      await tester.pump();
      expect(find.text('example-secret'), findsOneWidget);

      await tester.tap(find.byTooltip('Nascondi valore'));
      await tester.pump();
      expect(find.text('example-secret'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
