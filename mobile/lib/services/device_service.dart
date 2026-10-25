import 'package:mobile/models/device_dashboard.dart';

import '../models/device.dart';
import 'api_client.dart';

class DeviceService {
  final ApiClient _client;

  DeviceService(this._client);

  Future<List<Device>> getDevices() async {
    final response = await _client.dio.get<List<dynamic>>('devices');

    final body = response.data;
    if (body == null) {
      throw const FormatException('Risposta dei device vuota');
    }

    return body
        .map((item) => Device.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<DeviceDashboard> getDashboard(String deviceCode) async {
    // Richiesta GET, controllo del body e conversione in
    final response = await _client.dio.get<Map<String, dynamic>>(
      'devices/${Uri.encodeComponent(deviceCode)}/widgets',
    );

    final body = response.data;
    if (body == null) {
      throw const FormatException('Risposta della dashboard vuota');
    }
    return DeviceDashboard.fromJson(body);
  }
}
