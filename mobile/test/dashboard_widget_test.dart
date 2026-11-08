import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard_widget.dart';
import 'package:mobile/models/device_dashboard.dart';

Map<String, dynamic> widgetJson(String kind) => {
  'id': kind,
  'label': kind,
  'kind': kind,
  'configured': true,
  if (kind == 'value' || kind == 'text')
    'state': {'topic': 'devices/A/state', 'path': '/value'},
};

void main() {
  test('each widget kind creates its own object with its specific data', () {
    expect(
      DashboardWidget.fromJson(widgetJson('text')),
      isA<TextDashboardWidget>(),
    );
    expect(
      DashboardWidget.fromJson(widgetJson('value')),
      isA<ValueDashboardWidget>(),
    );
    expect(
      DashboardWidget.fromJson(widgetJson('button')),
      isA<ButtonDashboardWidget>(),
    );
    final relay =
        DashboardWidget.fromJson({
              ...widgetJson('switch'),
              'state': {
                'topic': 'devices/A/state',
                'path': '/relay',
                'onValue': 'ON',
                'offValue': 'OFF',
              },
            })
            as SwitchDashboardWidget;
    expect(relay.state!.onValue, 'ON');
    expect(relay.state!.path, '/relay');
    final input =
        DashboardWidget.fromJson({
              ...widgetJson('input'),
              'input': {'valueType': 'number', 'min': 0, 'max': 100},
            })
            as InputDashboardWidget;
    expect(input.input.valueType, WidgetInputType.number);
    expect(input.input.min, 0);
    expect(input.state, isNull);
  });

  test('switch feedback is optional and false and zero keep their types', () {
    final noFeedback =
        DashboardWidget.fromJson(widgetJson('switch')) as SwitchDashboardWidget;
    expect(noFeedback.state, isNull);
    final state = SwitchWidgetState.fromJson({
      'topic': 'devices/A/state',
      'onValue': 0,
      'offValue': false,
    });
    expect(state.onValue, 0);
    expect(state.offValue, false);
  });

  test('malformed or contradictory widget data is rejected', () {
    expect(
      () => DashboardWidget.fromJson(widgetJson('unknown')),
      throwsFormatException,
    );
    expect(
      () => DashboardWidget.fromJson({...widgetJson('value'), 'state': null}),
      throwsFormatException,
    );
    expect(
      () => SwitchWidgetState.fromJson({
        'topic': 'state',
        'onValue': true,
        'offValue': true,
      }),
      throwsFormatException,
    );
    expect(
      () => WidgetInputOptions.fromJson({
        'valueType': 'number',
        'min': 10,
        'max': 1,
      }),
      throwsFormatException,
    );
    expect(
      () => WidgetInputOptions.fromJson({'valueType': 'string', 'min': 0}),
      throwsFormatException,
    );
  });

  test('dashboard accepts schema v2 and refuses an incompatible contract', () {
    final body = <String, dynamic>{
      'schemaVersion': 2,
      'deviceCode': 'A',
      'deviceTypeId': 'sensor',
      'canConfigure': false,
      'widgets': [widgetJson('value')],
    };
    expect(
      DeviceDashboard.fromJson(body).widgets.single,
      isA<ValueDashboardWidget>(),
    );
    expect(
      () => DeviceDashboard.fromJson({...body, 'schemaVersion': 1}),
      throwsFormatException,
    );
  });
}
