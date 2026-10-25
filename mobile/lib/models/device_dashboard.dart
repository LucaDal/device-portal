import 'dashboard_widget.dart';

class DeviceDashboard {
  final int schemaVersion;
  final String deviceCode;
  final String deviceTypeId;
  final bool canConfigure;
  final List<DashboardWidget> widgets;

  const DeviceDashboard({
    required this.schemaVersion,
    required this.deviceCode,
    required this.deviceTypeId,
    required this.canConfigure,
    required this.widgets,
  });

  factory DeviceDashboard.fromJson(Map<String, dynamic> json) {
    final version = json['schemaVersion'];

    if (version is! int || version != 1) {
      throw FormatException(
        'Versione della dashboard non supportata: $version',
      );
    }

    final rawWidgets = json['widgets'] as List<dynamic>;

    return DeviceDashboard(
      schemaVersion: version,
      deviceCode: json['deviceCode'] as String,
      deviceTypeId: json['deviceTypeId'] as String,
      canConfigure: json['canConfigure'] as bool,
      widgets: rawWidgets
          .map((item) => DashboardWidget.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}
