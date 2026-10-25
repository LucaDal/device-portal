import 'package:flutter/material.dart';
import '../models/device.dart';
import '../models/device_dashboard.dart';
import '../services/device_service.dart';
import '../widgets/device_properties_section.dart';
import 'device_settings_page.dart';

class DeviceDashboardPage extends StatefulWidget {
  final Device device;
  final DeviceService deviceService;

  const DeviceDashboardPage({
    super.key,
    required this.device,
    required this.deviceService,
  });

  @override
  State<DeviceDashboardPage> createState() => _DeviceDashboardPageState();
}

class _DeviceDashboardPageState extends State<DeviceDashboardPage> {
  late final Future<DeviceDashboard> _dashboardFuture;

  @override
  void initState() {
    super.initState();
    _dashboardFuture = widget.deviceService.getDashboard(widget.device.code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.device.code),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'Impostazioni device',
            onPressed: () {
              Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (context) => DeviceSettingsPage(
                    device: widget.device,
                    deviceService: widget.deviceService,
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DevicePropertiesSection(properties: widget.device.properties),
          const SizedBox(height: 24),
          Text('Widget', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          FutureBuilder<DeviceDashboard>(
            future: _dashboardFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return const Center(
                  child: Text('Impossibile caricare la dashboard'),
                );
              }

              final dashboardWidgets = snapshot.data!.widgets;
              if (dashboardWidgets.isEmpty) {
                return const Center(child: Text('Nessun widget configurato'));
              }

              return Column(
                children: [
                  for (final dashboardWidget in dashboardWidgets)
                    ListTile(
                      title: Text(dashboardWidget.label),
                      subtitle: dashboardWidget.configured
                          ? null
                          : const Text('Configurazione incompleta'),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
