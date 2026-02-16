export const ROLES = {
    ADMIN: "admin",
    DEV: "dev",
    USER: "user",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES: Role[] = [ROLES.ADMIN, ROLES.DEV, ROLES.USER];

export const AUTH_ERROR_CODES = {
    PASSWORD_CHANGE_REQUIRED: "PASSWORD_CHANGE_REQUIRED",
} as const;
