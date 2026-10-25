import 'dart:convert';

class DeviceProperty {
  final String key;
  final String label;
  final String type;
  final Object? value;
  final bool sensitive;

  const DeviceProperty({
    required this.key,
    required this.label,
    required this.type,
    required this.value,
    required this.sensitive,
  });

  static List<DeviceProperty>? fromDeviceJson(Map<String, dynamic> json) {
    // A null payload can mean the server withheld values for a non-owner.
    // Do not replace it with defaults from the device type.
    if (json['device_properties'] == null) return null;

    final definitions = _decodeMap(json['type_deviceProperties']);
    final savedProperties = _decodeMap(json['device_properties']);
    final properties = <DeviceProperty>[];

    for (final entry in definitions.entries) {
      final definition = entry.value is String
          ? <String, dynamic>{'type': entry.value}
          : _decodeMap(entry.value);
      if (definition['visible'] == false) continue;

      final type = definition['type'];
      if (type is! String ||
          !const {'string', 'int', 'uint', 'float', 'bool'}.contains(type)) {
        throw const FormatException('Tipo di proprietà non valido');
      }

      final saved = _decodeMap(savedProperties[entry.key]);
      final value = saved['value'];
      if (value != null &&
          value is! String &&
          value is! num &&
          value is! bool) {
        throw const FormatException('Valore della proprietà non valido');
      }

      final label = (definition['label'] as String?)?.trim();
      properties.add(
        DeviceProperty(
          key: entry.key,
          label: label == null || label.isEmpty ? entry.key : label,
          type: type,
          value: value,
          sensitive: type == 'string' && definition['sensitive'] == true,
        ),
      );
    }

    return List.unmodifiable(properties);
  }

  static Map<String, dynamic> _decodeMap(Object? raw) {
    if (raw == null || raw == '') return {};
    final decoded = raw is String ? jsonDecode(raw) : raw;
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Formato delle proprietà non valido');
    }
    return decoded;
  }
}
