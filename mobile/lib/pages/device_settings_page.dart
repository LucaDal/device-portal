import 'package:flutter/material.dart';
import '../models/device.dart';
import '../services/device_service.dart';

class DeviceSettingsPage extends StatelessWidget {
  final Device device;
  final DeviceService deviceService;

  const DeviceSettingsPage({
    super.key,
    required this.device,
    required this.deviceService,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Impostazioni')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Text('${device.name}\n${device.code}'),
      ),
    );
  }
}
