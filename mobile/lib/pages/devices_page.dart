import 'package:flutter/material.dart';
import 'package:mobile/pages/device_dashboard_page.dart';
import '../models/device.dart';
import '../services/device_service.dart';

class DevicesPage extends StatefulWidget {
  final DeviceService deviceService;

  const DevicesPage({super.key, required this.deviceService});

  @override
  State<DevicesPage> createState() => _DevicesPageState();
}

class _DevicesPageState extends State<DevicesPage> {
  late final Future<List<Device>> _devicesFuture;

  @override
  void initState() {
    super.initState();
    _devicesFuture = widget.deviceService.getDevices();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Device')),
      body: FutureBuilder<List<Device>>(
        future: _devicesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return const Center(child: Text('Impossibile caricare i device'));
          }

          final devices = snapshot.data!;

          if (devices.isEmpty) {
            return const Center(child: Text('Nessun device disponibile'));
          }

          return ListView.builder(
            itemCount: devices.length,
            itemBuilder: (context, index) {
              final device = devices[index];

              return ListTile(
                title: Text(device.code),
                subtitle: Text(device.description ?? device.deviceTypeId),
                trailing: device.isShared ? const Icon(Icons.people) : null,
                onTap: () {
                  Navigator.of(context).push<void>(
                    MaterialPageRoute<void>(
                      builder: (context) => DeviceDashboardPage(
                        device: device,
                        deviceService: widget.deviceService,
                      ),
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}
