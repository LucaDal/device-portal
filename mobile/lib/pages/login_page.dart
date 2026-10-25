import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:mobile/services/device_service.dart';
import '../services/auth_service.dart';
import 'devices_page.dart';

class LoginPage extends StatefulWidget {
  final AuthService authService;
  final DeviceService deviceService;

  const LoginPage({
    super.key,
    required this.authService,
    required this.deviceService
  });
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isLoading) return;

    final isValid = _formKey.currentState?.validate() ?? false;
    if (!isValid) return;
    setState(() {
      _isLoading = true;
    });

    try {
      await widget.authService.login(
        email: _emailController.text,
        password: _passwordController.text,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sucessfull login')));

  Navigator.of(context).pushReplacement<void, void>(
    MaterialPageRoute<void>(
      builder: (context) => DevicesPage(
        deviceService: widget.deviceService,
      ),
    ),
  );

    } on DioException catch (error) {
      if (!mounted) return;

      final message = switch (error.response?.statusCode) {
        401 => 'Wrong email or password',
        403 => 'Accesso non consentito: verifica il tuo invito',
        429 => 'Troppi tentativi: riprova più tardi',
        null => 'Connessione non riuscita',
        _ => 'Errore del server',
      };

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)));

    } on FormatException {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Risposta del server non valida')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Device Portal')),
      body: Padding(
        padding: EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _emailController,
                decoration: InputDecoration(hintText: "email"),
                validator: (value) {
                  final email = value?.trim() ?? '';
                  if (email.isEmpty) {
                    return 'Set email';
                  }
                  return null;
                },
                keyboardType: TextInputType.emailAddress,
              ),
              SizedBox(height: 10),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(hintText: "password"),
                validator: (value) {
                  final pass = value ?? '';
                  if (pass.isEmpty) {
                    return 'Set password';
                  }
                  return null;
                },
                obscureText: true,
              ),
              SizedBox(height: 24),
              FilledButton(
                onPressed: _isLoading ? null : _submit,
                child: const Text("Accedi"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
