import 'device_property.dart';

class Device {
  final String code;
  final String deviceTypeId;
  final String? description;
  final bool activated;
  final bool isShared;
  final List<DeviceProperty>? properties;

  Device({
    required this.code,
    required this.deviceTypeId,
    this.description,
    required this.activated,
    required this.isShared,
    this.properties,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      code: json['code'] as String,
      deviceTypeId: json['device_type_id'] as String,
      description: json['device_type_description'] as String?,
      activated: (json['activated'] as int) == 1,
      isShared: (json['is_shared'] as int) == 1,
      properties: DeviceProperty.fromDeviceJson(json),
    );
  }
}
