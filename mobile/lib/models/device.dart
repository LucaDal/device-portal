import 'device_property.dart';

class Device {
  final String code;
  final String name;
  final String deviceTypeId;
  final String? description;
  final bool activated;
  final bool isShared;
  final List<DeviceProperty>? properties;
  final bool mqttAvailable;

  Device({
    required this.code,
    required this.name,
    required this.deviceTypeId,
    this.description,
    required this.activated,
    required this.isShared,
    this.properties,
    this.mqttAvailable = true,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      code: json['code'] as String,
      name: json['name'] as String,
      deviceTypeId: json['device_type_id'] as String,
      description: json['device_type_description'] as String?,
      activated: (json['activated'] as int) == 1,
      isShared: (json['is_shared'] as int) == 1,
      properties: DeviceProperty.fromDeviceJson(json),
      mqttAvailable: json['mqtt_available'] as bool? ?? true,
    );
  }
}
