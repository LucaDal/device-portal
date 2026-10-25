import 'package:flutter/material.dart';
import '../models/device_property.dart';

class DevicePropertiesSection extends StatelessWidget {
  final List<DeviceProperty>? properties;

  const DevicePropertiesSection({super.key, required this.properties});

  @override
  Widget build(BuildContext context) {
    final rows = properties;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Proprietà', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (rows == null)
          const Text(
            'Valori delle proprietà non disponibili. '
            'La lettura è consentita al proprietario e agli amministratori.',
          )
        else if (rows.isEmpty)
          const Text('Nessuna proprietà visibile definita per questo device')
        else
          Card(
            child: Column(
              children: [
                for (final property in rows)
                  _PropertyTile(
                    key: ValueKey(property.key),
                    property: property,
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _PropertyTile extends StatefulWidget {
  final DeviceProperty property;

  const _PropertyTile({super.key, required this.property});

  @override
  State<_PropertyTile> createState() => _PropertyTileState();
}

class _PropertyTileState extends State<_PropertyTile> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final property = widget.property;
    final value = property.value;
    final hasValue = value != null && value != '';
    final concealed = property.sensitive && hasValue && !_revealed;
    final text = !hasValue
        ? 'Non impostato'
        : value is bool
        ? (value ? 'Sì' : 'No')
        : value.toString();

    return ListTile(
      title: Text(property.label),
      subtitle: concealed ? const Text('••••••••') : SelectableText(text),
      trailing: property.sensitive && hasValue
          ? IconButton(
              tooltip: _revealed ? 'Nascondi valore' : 'Mostra valore',
              icon: Icon(_revealed ? Icons.visibility_off : Icons.visibility),
              onPressed: () {
                setState(() {
                  _revealed = !_revealed;
                });
              },
            )
          : null,
    );
  }
}
