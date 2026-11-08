sealed class DashboardWidget {
  final String id;
  final String label;
  final bool configured;
  final String? configurationError;

  const DashboardWidget({
    required this.id,
    required this.label,
    required this.configured,
    this.configurationError,
  });

  DashboardWidgetKind get kind;
  WidgetState? get state;

  factory DashboardWidget.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String;
    final label = json['label'] as String;
    final configured = json['configured'] as bool;
    final error = json['configurationError'] as String?;
    final rawState = json['state'] as Map<String, dynamic>?;
    final state = rawState == null ? null : WidgetState.fromJson(rawState);
    switch (json['kind']) {
      case 'text':
        if (configured && state == null) {
          throw const FormatException('Il widget testo richiede uno stato');
        }
        return TextDashboardWidget(
          id: id,
          label: label,
          configured: configured,
          configurationError: error,
          state: state,
        );
      case 'value':
        if (configured && state == null) {
          throw const FormatException('Il widget valore richiede uno stato');
        }
        return ValueDashboardWidget(
          id: id,
          label: label,
          configured: configured,
          configurationError: error,
          state: state,
        );
      case 'button':
        return ButtonDashboardWidget(
          id: id,
          label: label,
          configured: configured,
          configurationError: error,
          state: state,
        );
      case 'switch':
        return SwitchDashboardWidget(
          id: id,
          label: label,
          configured: configured,
          configurationError: error,
          state: rawState == null ? null : SwitchWidgetState.fromJson(rawState),
        );
      case 'input':
        return InputDashboardWidget(
          id: id,
          label: label,
          configured: configured,
          configurationError: error,
          state: state,
          input: WidgetInputOptions.fromJson(
            json['input'] as Map<String, dynamic>,
          ),
        );
      default:
        throw FormatException('Tipo widget sconosciuto: ${json['kind']}');
    }
  }
}

class WidgetState {
  final String topic;
  final String? path;
  const WidgetState({required this.topic, this.path});

  factory WidgetState.fromJson(Map<String, dynamic> json) {
    final topic = json['topic'] as String;
    if (topic.isEmpty) throw const FormatException('Topic dello stato vuoto');
    return WidgetState(topic: topic, path: json['path'] as String?);
  }
}

class SwitchWidgetState extends WidgetState {
  final Object onValue;
  final Object offValue;
  const SwitchWidgetState({
    required super.topic,
    super.path,
    required this.onValue,
    required this.offValue,
  });

  factory SwitchWidgetState.fromJson(Map<String, dynamic> json) {
    final state = WidgetState.fromJson(json);
    final onValue = _scalar(json['onValue']);
    final offValue = _scalar(json['offValue']);
    if (onValue == offValue) {
      throw const FormatException('Gli stati ON e OFF devono essere diversi');
    }
    return SwitchWidgetState(
      topic: state.topic,
      path: state.path,
      onValue: onValue,
      offValue: offValue,
    );
  }
}

Object _scalar(Object? value) {
  if (value is String || value is bool || (value is num && value.isFinite)) {
    return value!;
  }
  throw const FormatException(
    'Il valore deve essere una stringa, un numero finito o un booleano',
  );
}

class WidgetInputOptions {
  final WidgetInputType valueType;
  final num? min;
  final num? max;
  const WidgetInputOptions({required this.valueType, this.min, this.max});

  factory WidgetInputOptions.fromJson(Map<String, dynamic> json) {
    final type = switch (json['valueType']) {
      'string' => WidgetInputType.string,
      'number' => WidgetInputType.number,
      'boolean' => WidgetInputType.boolean,
      _ => throw FormatException(
        'Tipo di input sconosciuto: ${json['valueType']}',
      ),
    };
    final min = json['min'] as num?;
    final max = json['max'] as num?;
    if ((min != null && !min.isFinite) ||
        (max != null && !max.isFinite) ||
        (type != WidgetInputType.number && (min != null || max != null)) ||
        (min != null && max != null && min > max)) {
      throw const FormatException('Limiti di input non validi');
    }
    return WidgetInputOptions(valueType: type, min: min, max: max);
  }
}

final class TextDashboardWidget extends DashboardWidget {
  @override
  final WidgetState? state;
  const TextDashboardWidget({
    required super.id,
    required super.label,
    required super.configured,
    super.configurationError,
    this.state,
  });
  @override
  DashboardWidgetKind get kind => DashboardWidgetKind.text;
}

final class ValueDashboardWidget extends DashboardWidget {
  @override
  final WidgetState? state;
  const ValueDashboardWidget({
    required super.id,
    required super.label,
    required super.configured,
    super.configurationError,
    this.state,
  });
  @override
  DashboardWidgetKind get kind => DashboardWidgetKind.value;
}

final class ButtonDashboardWidget extends DashboardWidget {
  @override
  final WidgetState? state;
  const ButtonDashboardWidget({
    required super.id,
    required super.label,
    required super.configured,
    super.configurationError,
    this.state,
  });
  @override
  DashboardWidgetKind get kind => DashboardWidgetKind.button;
}

final class SwitchDashboardWidget extends DashboardWidget {
  @override
  final SwitchWidgetState? state;
  const SwitchDashboardWidget({
    required super.id,
    required super.label,
    required super.configured,
    super.configurationError,
    this.state,
  });
  @override
  DashboardWidgetKind get kind => DashboardWidgetKind.toggle;
}

final class InputDashboardWidget extends DashboardWidget {
  @override
  final WidgetState? state;
  final WidgetInputOptions input;
  const InputDashboardWidget({
    required super.id,
    required super.label,
    required super.configured,
    super.configurationError,
    this.state,
    required this.input,
  });
  @override
  DashboardWidgetKind get kind => DashboardWidgetKind.input;
}

enum DashboardWidgetKind { text, value, toggle, input, button }

enum WidgetInputType { string, number, boolean }
