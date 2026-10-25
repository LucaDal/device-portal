class DashboardWidget {
  final String id;
  final String label;
  final DashboardWidgetKind kind;
  final bool configured;
  final String? stateTopic;
  final String? stateValuePath;
  final Object? onValue;
  final Object? offValue;

  const DashboardWidget({
    required this.id,
    required this.label,
    required this.kind,
    required this.configured,
    this.stateTopic,
    this.stateValuePath,
    this.onValue,
    this.offValue,
  });

  factory DashboardWidget.fromJson(Map<String, dynamic> json) {
    return DashboardWidget(
      id: json['id'] as String,
      label: json['label'] as String,
      kind: DashboardWidgetKind.fromJson(json['kind'] as String),
      configured: json['configured'] as bool,
      stateTopic: json['stateTopic'] as String?,
      stateValuePath: json['stateValuePath'] as String?,
      onValue: json['onValue'],
      offValue: json['offValue'],
    );
  }
}

enum DashboardWidgetKind {
  text,
  value,
  toggle,
  input,
  button;

  static DashboardWidgetKind fromJson(String value) {
    return switch (value) {
      'text' => DashboardWidgetKind.text,
      'value' => DashboardWidgetKind.value,
      'switch' => DashboardWidgetKind.toggle,
      'input' => DashboardWidgetKind.input,
      'button' => DashboardWidgetKind.button,
      _ => throw FormatException('Tipo widget sconosciuto: $value'),
    };
  }
}
