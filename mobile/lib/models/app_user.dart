class AppUser {
  final int id;
  final String email;
  final String role;
  final bool mustChangePassword;
  final DateTime? createdAt;

  const AppUser({
    required this.id,
    required this.email,
    required this.role,
    required this.mustChangePassword,
    this.createdAt,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final createdAtRaw = json['created_at'] as String?;

    return AppUser(
      id: json['id'] as int,
      email: json['email'] as String,
      role: json['role'] as String,
      mustChangePassword: (json['must_change_password'] as int) == 1,
      createdAt: createdAtRaw == null ? null : DateTime.parse(createdAtRaw),
    );
  }
}
