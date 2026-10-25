import '../models/app_user.dart';
import 'api_client.dart';

class AuthService {
  final ApiClient _client;

  AuthService(this._client);

  Future<AppUser> login({
    required String email,
    required String password,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      'auth/login',
      data: {'email': email.trim(), 'password': password},
    );

    final body = response.data;
    if (body == null) {
      throw const FormatException('null response from server');
    }

    return AppUser.fromJson(body['user'] as Map<String, dynamic>);
  }

  Future<AppUser> me() async {
    final response = await _client.dio.get<Map<String, dynamic>>('auth/me');
    final body = response.data;

    if (body == null) {
      throw const FormatException('null response from server');
    }
    return AppUser.fromJson(body['user']);
  }
}
