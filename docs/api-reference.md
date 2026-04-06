# API Reference

All routes are prefixed with `/api` (e.g. `POST /api/auth/login`).

Authentication uses a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

---

## Legend

| Symbol | Meaning                     |
| ------ | --------------------------- |
| Public | No authentication required  |
| Auth   | Any authenticated user      |
| AM+    | Assignment Manager or Admin |
| Admin  | Admin only                  |

---

## System

### `GET /health`

Public health check. No authentication required.

**Response**

```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

### `GET /api/info`

Returns a summary of available endpoints.

| Access | Auth |
| ------ | ---- |

---

## Authentication

### `GET /api/auth/config`

Returns server-side feature flags exposed to the frontend (e.g. whether registration is enabled).

| Access | Public |
| ------ | ------ |

**Response**

```json
{ "registrationEnabled": true }
```

---

### `POST /api/auth/register`

Self-register a new user account. Only creates accounts with the `user` role. The account is created in `pending` status
— the user receives an email to set their password before they can log in.

| Access | Public (when `REGISTRATION_ENABLED=true`) |
| ------ | ----------------------------------------- |

Rate limit: 3 req/min (production), 500 req/min (development).

**Request body**

```json
{
  "username": "jsmith",
  "email": "jsmith@example.com",
  "firstName": "John",
  "lastName": "Smith",
  "studentId": "S12345"
}
```

| Field       | Type   | Required | Notes                    |
| ----------- | ------ | :------: | ------------------------ |
| `username`  | string |   Yes    | Unique, case-insensitive |
| `email`     | string |   Yes    | Unique                   |
| `firstName` | string |   Yes    |                          |
| `lastName`  | string |   Yes    |                          |
| `studentId` | string |    No    | Unique when provided     |

**Response `201`**

```json
{
  "message": "User registered successfully",
  "user": { "id": "uuid", "username": "jsmith", "email": "jsmith@example.com", "studentId": "S12345" }
}
```

---

### `POST /api/auth/login`

| Access | Public |
| ------ | ------ |

Rate limit: 5 req/min (production).

**Request body**

```json
{ "username": "admin", "password": "secret" }
```

**Response `200`**

```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "firstName": "Admin",
    "lastName": "",
    "role": "admin",
    "groupId": null,
    "groupName": null,
    "studentId": null
  }
}
```

**Errors**

| Code | Reason                                                                          |
| ---- | ------------------------------------------------------------------------------- |
| 401  | Invalid credentials / account disabled / account pending (password not yet set) |

---

### `POST /api/auth/logout`

Stateless logout (client discards the token).

| Access | Public |
| ------ | ------ |

**Response `200`**

```json
{ "message": "Logout successful" }
```

---

### `GET /api/auth/me`

Returns fresh user data from the database (not stale JWT claims).

| Access | Auth |
| ------ | ---- |

**Response `200`**

```json
{
  "user": {
    "id": "uuid",
    "username": "jsmith",
    "email": "jsmith@example.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "user",
    "groupId": "uuid",
    "groupName": "Group A",
    "studentId": "S12345"
  }
}
```

---

### `POST /api/auth/forgot-password`

Sends a password-reset (or account-setup) email. Always returns `200` to prevent email enumeration.

| Access | Public |
| ------ | ------ |

Rate limit: 5 req/15 min (production).

**Request body**

```json
{ "email": "jsmith@example.com" }
```

**Response `200`**

```json
{ "message": "If that email is registered, a reset link has been sent." }
```

---

### `POST /api/auth/set-password`

Sets or resets a password using a single-use token from the setup/reset email.

| Access | Public |
| ------ | ------ |

Rate limit: 10 req/min (production).

**Request body**

```json
{ "token": "<reset-token>", "password": "new-secure-password" }
```

**Response `200`**

```json
{ "message": "Password set successfully. You can now log in." }
```

**Errors**

| Code | Reason                   |
| ---- | ------------------------ |
| 400  | Invalid or expired token |

---

## Users

### `GET /api/users`

List all users. Supports optional query filters.

| Access | AM+ |
| ------ | --- |

**Query parameters**

| Param     | Values                                | Description      |
| --------- | ------------------------------------- | ---------------- |
| `role`    | `admin`, `assignment_manager`, `user` | Filter by role   |
| `status`  | `active`, `inactive`, `pending`       | Filter by status |
| `groupId` | UUID or `none`                        | Filter by group  |

**Response `200`**

```json
{ "users": [ { "id": "uuid", "username": "...", ... } ] }
```

---

### `GET /api/users/:id`

Get a single user by ID.

| Access | Auth — users can view their own profile; AM+ can view any user |
| ------ | -------------------------------------------------------------- |

**Response `200`**

```json
{ "user": { "id": "uuid", "username": "jsmith", "email": "...", "role": "user", ... } }
```

---

### `POST /api/users`

Create a new user. The account is created in `pending` status and an account-setup email is sent (unless
`sendSetupEmail: false`).

| Access | AM+ (only Admin can create Admin or Assignment Manager accounts) |
| ------ | ---------------------------------------------------------------- |

**Request body**

```json
{
  "username": "jsmith",
  "email": "jsmith@example.com",
  "firstName": "John",
  "lastName": "Smith",
  "studentId": "S12345",
  "groupId": "uuid-or-null",
  "role": "user",
  "sendSetupEmail": true
}
```

| Field            | Type    | Required | Notes                                                                        |
| ---------------- | ------- | :------: | ---------------------------------------------------------------------------- |
| `username`       | string  |   Yes    |                                                                              |
| `email`          | string  |   Yes    |                                                                              |
| `firstName`      | string  |   Yes    |                                                                              |
| `lastName`       | string  |   Yes    |                                                                              |
| `studentId`      | string  |    No    | Only applies to `user` role                                                  |
| `groupId`        | UUID    |    No    | Only applies to `user` role                                                  |
| `role`           | string  |    No    | `user` (default), `assignment_manager`, `admin`                              |
| `sendSetupEmail` | boolean |    No    | Default `true`; only Admin can set to `false` — AM always sends setup emails |

**Response `201`**

```json
{
  "message": "User created successfully",
  "user": { "id": "uuid", "username": "jsmith", "email": "...", "status": "pending", "studentId": "S12345" }
}
```

---

### `PUT /api/users/:id`

Update a user's profile, role, or enabled status.

| Access | Admin can edit any user; AM can edit non-admin users; users can edit their own profile |
| ------ | -------------------------------------------------------------------------------------- |

**Request body** (all fields optional)

```json
{
  "email": "new@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "studentId": "S99999",
  "role": "assignment_manager",
  "enabled": false,
  "groupId": "uuid-or-null"
}
```

**Notes**

- `username` cannot be changed
- `role` can only be changed by Admin
- `enabled` can be changed by Admin or AM (AM cannot change admin users)
- `groupId` can only be changed by Admin
- The built-in `admin` account cannot be disabled or have its role changed

**Response `200`**

```json
{ "message": "User updated successfully", "user": { ... } }
```

---

### `PUT /api/users/:id/group`

Assign or remove a user from a group.

| Access | AM+ |
| ------ | --- |

**Request body**

```json
{ "groupId": "uuid" }
```

Set `groupId` to `null` to remove the user from their current group.

**Response `200`**

```json
{ "message": "User group updated successfully", "user": { "id": "uuid", "username": "...", "groupId": "uuid" } }
```

---

### `PUT /api/users/:id/password`

Change the current user's own password. Requires the current password.

| Access | Auth — users can only change their own password |
| ------ | ----------------------------------------------- |

**Request body**

```json
{ "currentPassword": "old-password", "newPassword": "new-password" }
```

**Response `200`**

```json
{ "message": "Password updated successfully" }
```

---

### `DELETE /api/users/:id`

Delete a single user.

| Access | Admin |
| ------ | ----- |

Cannot delete your own account.

**Response `200`**

```json
{ "message": "User deleted successfully" }
```

---

### `DELETE /api/users/bulk`

Delete multiple users in one request.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "ids": ["uuid1", "uuid2"] }
```

Up to 2000 IDs per request. Cannot include your own account.

**Response `200`**

```json
{ "message": "Users deleted successfully", "deleted": 2 }
```

---

### `POST /api/users/import`

Bulk-import users from a parsed CSV payload. Accounts are created in `pending` status.

| Access | AM+ |
| ------ | --- |

**Request body**

```json
{
  "users": [
    {
      "username": "jsmith",
      "email": "jsmith@example.com",
      "firstName": "John",
      "lastName": "Smith",
      "studentId": "S001"
    }
  ],
  "conflictAction": "skip",
  "sendSetupEmail": false
}
```

| Field            | Type    | Required | Notes                                             |
| ---------------- | ------- | :------: | ------------------------------------------------- |
| `users`          | array   |   Yes    | Max 2000 rows                                     |
| `conflictAction` | string  |    No    | `skip` (default) or `overwrite` on username match |
| `sendSetupEmail` | boolean |    No    | Default `false`                                   |

**Response `200`**

```json
{ "imported": 5, "skipped": 1, "errors": [] }
```

---

### `POST /api/users/send-setup-emails`

Send (or resend) account-setup emails to pending users.

| Access | AM+ |
| ------ | --- |

**Request body**

```json
{ "userIds": ["uuid1", "uuid2"] }
```

Omit `userIds` to send to all pending users.

**Response `200`**

```json
{ "sent": 3, "errors": [] }
```

---

## Groups

### `GET /api/groups`

List all groups (enabled and disabled).

| Access | Auth |
| ------ | ---- |

**Response `200`**

```json
{ "groups": [ { "id": "uuid", "name": "Group A", "enabled": true, "maxMembers": 5, "memberCount": 3, ... } ] }
```

---

### `GET /api/groups/enabled`

List only enabled groups. Used for assignment dropdowns.

| Access | Auth |
| ------ | ---- |

---

### `GET /api/groups/:id`

Get a group and its members.

| Access | Auth |
| ------ | ---- |

**Response `200`**

```json
{
  "group": { "id": "uuid", "name": "Group A", "enabled": true, "maxMembers": 5, "memberCount": 3, ... },
  "members": [ { "id": "uuid", "username": "jsmith", ... } ]
}
```

---

### `POST /api/groups`

Create a single group.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "name": "Group A", "enabled": true, "maxMembers": 5 }
```

| Field        | Type    | Required | Notes              |
| ------------ | ------- | :------: | ------------------ |
| `name`       | string  |   Yes    | Must be unique     |
| `enabled`    | boolean |    No    | Default `true`     |
| `maxMembers` | number  |    No    | `null` = unlimited |

**Response `201`**

```json
{ "message": "Group created successfully", "group": { ... } }
```

---

### `POST /api/groups/bulk`

Create multiple groups in one request.

| Access | Admin |
| ------ | ----- |

**Request body** — array of group objects (max 2000 per request)

```json
[
  { "name": "Group A", "enabled": true, "maxMembers": 5 },
  { "name": "Group B", "maxMembers": null }
]
```

No duplicate names within the batch (case-insensitive).

**Response `201`**

```json
{ "message": "Groups created successfully", "groups": [ ... ] }
```

---

### `PUT /api/groups/:id`

Update a group's name, enabled status, or member cap.

| Access | Admin |
| ------ | ----- |

**Request body** (all fields optional)

```json
{ "name": "Group B", "enabled": false, "maxMembers": 10 }
```

Cannot lower `maxMembers` below the current member count.

**Response `200`**

```json
{ "message": "Group updated successfully", "group": { ... } }
```

---

### `DELETE /api/groups/:id`

Delete a single group.

| Access | Admin |
| ------ | ----- |

**Response `200`**

```json
{ "message": "Group deleted successfully" }
```

---

### `DELETE /api/groups/bulk`

Delete multiple groups.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "ids": ["uuid1", "uuid2"] }
```

Up to 2000 IDs per request.

**Response `200`**

```json
{ "message": "Groups deleted successfully", "deleted": 2 }
```

---

### `POST /api/groups/:id/join`

Join a group as the currently authenticated user.

| Access | Auth |
| ------ | ---- |

**Conditions**

- The group must be enabled
- The user must not already be in a group
- The group must not be full
- Group join must not be locked (unless the user is Admin or AM)

**Response `200`**

```json
{ "message": "Successfully joined group", "groupId": "uuid", "groupName": "Group A" }
```

---

### `POST /api/groups/:id/leave`

Leave a group as the currently authenticated user.

| Access | Auth |
| ------ | ---- |

**Conditions**

- The user must be a member of the specified group
- Group join must not be locked (unless the user is Admin or AM)

**Response `200`**

```json
{ "message": "Successfully left group" }
```

---

### `POST /api/groups/import-mappings`

Bulk-assign users to groups from a parsed CSV payload.

| Access | AM+ |
| ------ | --- |

**Request body**

```json
{
  "rows": [
    { "email": "jsmith@example.com", "groupName": "Group A" },
    { "action": "skip", "email": "other@example.com", "groupName": "Group B", "skipReason": "No match found" }
  ]
}
```

Up to 2000 rows. Rows with `action: "skip"` are recorded in the `skipped` summary but not processed.

**Response `200`**

```json
{ "imported": 4, "skipped": [{ "email": "...", "groupName": "...", "reason": "..." }], "errors": [] }
```

---

### `GET /api/groups/export-mappings`

Export current user–group assignments as a list of `{ email, groupName }` pairs.

| Access | AM+ |
| ------ | --- |

**Response `200`**

```json
{ "mappings": [{ "email": "jsmith@example.com", "groupName": "Group A" }] }
```

---

## Config

### `GET /api/config/group-join-locked`

Check whether the group-join lock is active.

| Access | Auth |
| ------ | ---- |

**Response `200`**

```json
{ "locked": false }
```

---

### `GET /api/config`

Get all system config values.

| Access | AM+ |
| ------ | --- |

**Response `200`**

```json
{ "config": [{ "key": "group_join_locked", "value": "false" }] }
```

---

### `PUT /api/config/:key`

Update a system config value. Currently the only supported key is `group_join_locked`.

| Access | AM+ |
| ------ | --- |

**Request body**

```json
{ "value": "true" }
```

**Response `200`**

```json
{ "message": "Config updated successfully", "config": { "key": "group_join_locked", "value": "true" } }
```

---

## Common Error Responses

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 400  | Validation error or bad request                        |
| 401  | Missing or invalid token / invalid credentials         |
| 403  | Authenticated but insufficient role                    |
| 404  | Resource not found                                     |
| 409  | Conflict (duplicate username, email, student ID, etc.) |
| 429  | Rate limit exceeded                                    |
| 500  | Internal server error                                  |

Error responses always include an `error` field:

```json
{ "error": "Description of what went wrong" }
```
