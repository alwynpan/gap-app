# API Reference

All routes are prefixed with `/api` (e.g. `POST /api/auth/login`).

Authentication uses a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

JWT tokens carry identity claims only: `{ id, username, email, role }`. Hierarchy data (subjects, group memberships,
managed assignments) is returned by `POST /api/auth/login` and `GET /api/auth/me`, not embedded in the token.

The data model is a Subject → Assignment → Group hierarchy: subjects contain assignments, assignments contain groups.
Users enrol in subjects (many-to-many) and may belong to **at most one group per assignment**. A user can only be placed
in a group if they are a member of the group's parent subject — this applies to every caller, including admins.

---

## Legend

| Symbol | Meaning                     |
| ------ | --------------------------- |
| Public | No authentication required  |
| Auth   | Any authenticated user      |
| AM+    | Assignment Manager or Admin |
| Admin  | Admin only                  |

Assignment Manager access is **scoped**: an AM can only act on assignments they manage (via the `assignment_managers`
mapping). Where an endpoint says "Admin or managing AM", a non-managing AM receives `403`.

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
    "username": "jsmith",
    "email": "jsmith@example.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "user",
    "studentId": "S12345",
    "subjects": [{ "id": "uuid", "name": "COMP10001" }],
    "memberships": [{ "subject_id": "uuid", "assignment_id": "uuid", "group_id": "uuid", "group_name": "Group A" }],
    "managedAssignments": []
  }
}
```

`subjects` lists the subjects the user is enrolled in, `memberships` lists their per-assignment group placements, and
`managedAssignments` lists the assignments an assignment manager manages (always `[]` for other roles). Suspended
subject memberships (see `PUT /api/subjects/:id/users/:userId`) are excluded — a suspended member does not see that
subject in their own session.

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

Returns fresh user data from the database (not stale JWT claims), including subject enrolments, group memberships, and
managed assignments.

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
    "studentId": "S12345",
    "subjects": [{ "id": "uuid", "name": "COMP10001" }],
    "memberships": [{ "subject_id": "uuid", "assignment_id": "uuid", "group_id": "uuid", "group_name": "Group A" }],
    "managedAssignments": []
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

## Subjects

### `GET /api/subjects`

List subjects, scoped to the caller's role: admins see all subjects; assignment managers see subjects containing an
assignment they manage plus subjects they are a member of; regular users see only subjects they are enrolled in.

| Access | Auth |
| ------ | ---- |

**Response `200`**

```json
{ "subjects": [{ "id": "uuid", "name": "COMP10001", "created_at": "...", "updated_at": "..." }] }
```

---

### `GET /api/subjects/:id`

Get a subject and its assignments.

| Access | Auth — admin, subject member, or an AM managing an assignment in the subject |
| ------ | ---------------------------------------------------------------------------- |

**Response `200`**

```json
{
  "subject": { "id": "uuid", "name": "COMP10001", ... },
  "assignments": [{ "id": "uuid", "subject_id": "uuid", "name": "Assignment 1", ... }]
}
```

**Errors**

| Code | Reason                    |
| ---- | ------------------------- |
| 400  | Invalid subject ID        |
| 403  | No access to this subject |
| 404  | Subject not found         |

---

### `POST /api/subjects`

Create a subject.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "name": "COMP10001" }
```

**Response `201`**

```json
{ "message": "Subject created successfully", "subject": { "id": "uuid", "name": "COMP10001", ... } }
```

**Errors**

| Code | Reason                                  |
| ---- | --------------------------------------- |
| 409  | A subject with this name already exists |

---

### `PUT /api/subjects/:id`

Rename a subject.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "name": "COMP10002" }
```

**Response `200`**

```json
{ "message": "Subject updated successfully", "subject": { ... } }
```

**Errors**

| Code | Reason                                  |
| ---- | --------------------------------------- |
| 404  | Subject not found                       |
| 409  | A subject with this name already exists |

---

### `DELETE /api/subjects/:id`

Delete a subject. **Cascades**: all of the subject's assignments, their groups, and all related group memberships and
enrolments are deleted. User accounts are never deleted.

| Access | Admin |
| ------ | ----- |

**Response `200`**

```json
{ "message": "Subject deleted successfully" }
```

---

### `GET /api/subjects/:id/users`

List the members (enrolled users) of a subject. Suspended members are included, tagged with `membership_enabled: false`
— staff always see them here even though the member no longer sees the subject themselves.

| Access | Admin, or an AM managing an assignment in the subject |
| ------ | ----------------------------------------------------- |

**Response `200`**

```json
{ "users": [{ "id": "uuid", "username": "jsmith", "membership_enabled": true, ... }] }
```

---

### `POST /api/subjects/:id/users`

Enrol users in a subject.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "userIds": ["uuid1", "uuid2"] }
```

1–2000 user IDs per request. All IDs must refer to existing users.

**Response `200`**

```json
{ "message": "Users added to subject", "added": 2 }
```

**Errors**

| Code | Reason                         |
| ---- | ------------------------------ |
| 400  | One or more users do not exist |
| 404  | Subject not found              |

---

### `PUT /api/subjects/:id/users/:userId`

Suspend or re-enable a user's membership in a subject. Suspending (`enabled: false`) also removes the user's group
memberships within that subject's assignments (transactionally). **Re-enabling restores subject access but does NOT
restore group memberships** — the user must be re-assigned or re-join.

While suspended, the user is treated as a non-member of the subject everywhere: the subject disappears from their own
session (`POST /api/auth/login`, `GET /api/auth/me`, dashboard), subject/assignment/group scope checks fail, and group
placement is rejected with `User is not an active member of this subject`. Staff still see the user in
`GET /api/subjects/:id/users` with `membership_enabled: false`.

| Access | Admin, or an AM managing an assignment in the subject |
| ------ | ----------------------------------------------------- |

**Request body**

```json
{ "enabled": false }
```

**Response `200`**

```json
{ "message": "Member suspended", "membershipEnabled": false }
```

`message` is `"Member enabled"` when re-enabling.

**Errors**

| Code | Reason                                                        |
| ---- | ------------------------------------------------------------- |
| 400  | Invalid subject/user ID, or `enabled` missing / not a boolean |
| 401  | Not authenticated                                             |
| 403  | Not admin and not an AM managing an assignment in the subject |
| 404  | Subject not found / user is not a member of this subject      |

---

### `DELETE /api/subjects/:id/users/:userId`

Remove a user from a subject. Also removes the user's group memberships within that subject (transactionally). The user
account itself is not deleted.

| Access | Admin |
| ------ | ----- |

**Response `200`**

```json
{ "message": "User removed from subject" }
```

**Errors**

| Code | Reason                                |
| ---- | ------------------------------------- |
| 404  | Subject not found / user not a member |

---

## Assignments

### `GET /api/assignments`

List assignments, scoped to the caller's role: admins see all; assignment managers see assignments they manage plus
assignments in subjects they belong to; regular users see assignments of subjects they are enrolled in.

| Access | Auth |
| ------ | ---- |

**Query parameters**

| Param       | Values | Description              |
| ----------- | ------ | ------------------------ |
| `subjectId` | UUID   | Filter by parent subject |

**Response `200`**

```json
{ "assignments": [{ "id": "uuid", "subject_id": "uuid", "name": "Assignment 1", ... }] }
```

---

### `GET /api/assignments/:id`

Get a single assignment.

| Access | Auth — admin, subject member, or the assignment's manager |
| ------ | --------------------------------------------------------- |

**Response `200`**

```json
{ "assignment": { "id": "uuid", "subject_id": "uuid", "name": "Assignment 1", ... } }
```

---

### `POST /api/assignments`

Create an assignment within a subject. Assignment names are unique per subject.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "subjectId": "uuid", "name": "Assignment 1" }
```

**Response `201`**

```json
{ "message": "Assignment created successfully", "assignment": { ... } }
```

**Errors**

| Code | Reason                                                      |
| ---- | ----------------------------------------------------------- |
| 404  | Subject not found                                           |
| 409  | An assignment with this name already exists in this subject |

---

### `PUT /api/assignments/:id`

Rename an assignment.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "name": "Assignment 2" }
```

**Response `200`**

```json
{ "message": "Assignment updated successfully", "assignment": { ... } }
```

---

### `DELETE /api/assignments/:id`

Delete an assignment. **Cascades**: all of the assignment's groups and group memberships are deleted. User accounts are
never deleted.

| Access | Admin |
| ------ | ----- |

**Response `200`**

```json
{ "message": "Assignment deleted successfully" }
```

---

### `GET /api/assignments/:id/groups`

List the groups of an assignment. Replaces the removed `GET /api/groups` and `GET /api/groups/enabled` endpoints.

| Access | Auth — admin, subject member, or the assignment's manager |
| ------ | --------------------------------------------------------- |

**Query parameters**

| Param     | Values | Description                |
| --------- | ------ | -------------------------- |
| `enabled` | `true` | Return only enabled groups |

**Response `200`**

```json
{ "groups": [{ "id": "uuid", "name": "Group A", "enabled": true, "max_members": 5, "member_count": 3, ... }] }
```

---

### `GET /api/assignments/:id/managers`

List the assignment's managers.

| Access | Admin |
| ------ | ----- |

**Response `200`**

```json
{ "managers": [{ "id": "uuid", "username": "am1", ... }] }
```

---

### `PUT /api/assignments/:id/managers`

Replace the assignment's manager list. All listed users must have the `assignment_manager` role. Pass an empty array to
remove all managers.

| Access | Admin |
| ------ | ----- |

**Request body**

```json
{ "userIds": ["uuid1", "uuid2"] }
```

**Response `200`**

```json
{ "message": "Assignment managers updated successfully", "managers": [ ... ] }
```

**Errors**

| Code | Reason                                                                  |
| ---- | ----------------------------------------------------------------------- |
| 400  | One or more users do not exist / not all have `assignment_manager` role |
| 404  | Assignment not found                                                    |

---

### `GET /api/assignments/:id/export-mappings`

Export the assignment's current user–group placements as `{ email, groupName }` pairs. Replaces the removed
`GET /api/groups/export-mappings`.

| Access | Admin, or the assignment's manager |
| ------ | ---------------------------------- |

**Response `200`**

```json
{ "mappings": [{ "email": "jsmith@example.com", "groupName": "Group A" }] }
```

---

### `POST /api/assignments/:id/import-mappings`

Bulk-assign users to this assignment's groups from a parsed CSV payload. Replaces the removed
`POST /api/groups/import-mappings`. Group names are matched case-insensitively within the assignment; existing
placements for the same assignment are replaced.

| Access | Admin, or the assignment's manager |
| ------ | ---------------------------------- |

**Request body**

```json
{
  "rows": [
    { "email": "jsmith@example.com", "groupName": "Group A" },
    { "action": "skip", "email": "other@example.com", "groupName": "Group B", "skipReason": "No match found" }
  ]
}
```

Up to 2000 rows. Rows with `action: "skip"` are recorded in the `skipped` summary but not processed. Rows are skipped
(with a reason) when the user is not found, the user is an admin or assignment manager, the group is not found, the user
is not a member of the assignment's subject, or the group is full.

**Response `200`**

```json
{ "imported": 4, "skipped": [{ "email": "...", "groupName": "...", "reason": "..." }], "errors": [] }
```

**Errors**

| Code | Reason                                                |
| ---- | ----------------------------------------------------- |
| 400  | No mappings / too many rows                           |
| 403  | Caller does not manage this assignment                |
| 404  | Assignment not found                                  |
| 409  | Ambiguous group name (two groups differ only by case) |

---

## Users

### `GET /api/users`

List users. Admin only — assignment managers manage members through `GET /api/subjects/:id/users` instead.

| Access | Admin |
| ------ | ----- |

**Query parameters**

| Param          | Values                                | Description                                                                    |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `role`         | `admin`, `assignment_manager`, `user` | Filter by role                                                                 |
| `status`       | `active`, `inactive`, `pending`       | Filter by status                                                               |
| `subjectId`    | UUID                                  | Users enrolled in the subject                                                  |
| `assignmentId` | UUID                                  | Users in the assignment's subject                                              |
| `groupId`      | UUID or `none`                        | Filter by group; `none` requires `assignmentId` (ungrouped in that assignment) |

**Response `200`**

Each user is enriched with their subject enrolments and per-assignment group memberships. `subjects` includes suspended
enrolments, each entry tagged with `membership_enabled`:

```json
{
  "users": [
    {
      "id": "uuid",
      "username": "jsmith",
      "subjects": [{ "id": "uuid", "name": "COMP10001", "membership_enabled": true }],
      "memberships": [{ "subject_id": "uuid", "assignment_id": "uuid", "group_id": "uuid", "group_name": "Group A" }]
    }
  ]
}
```

---

### `GET /api/users/:id`

Get a single user by ID, enriched with `subjects` and `memberships`.

| Access | Auth — own profile; admin any user; assignment manager only a user inside a subject they manage |
| ------ | ----------------------------------------------------------------------------------------------- |

**Response `200`**

```json
{ "user": { "id": "uuid", "username": "jsmith", "role_name": "user", "subjects": [ ... ], "memberships": [ ... ] } }
```

---

### `POST /api/users`

Create a new user. The account is created in `pending` status and an account-setup email is sent (unless an Admin sets
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
  "role": "user",
  "subjectIds": ["uuid"],
  "assignmentId": "uuid",
  "groupId": "uuid",
  "assignmentIds": [],
  "sendSetupEmail": true
}
```

| Field            | Type    |    Required     | Notes                                                                                               |
| ---------------- | ------- | :-------------: | --------------------------------------------------------------------------------------------------- |
| `username`       | string  |       Yes       |                                                                                                     |
| `email`          | string  |       Yes       |                                                                                                     |
| `firstName`      | string  |       Yes       |                                                                                                     |
| `lastName`       | string  |       Yes       |                                                                                                     |
| `studentId`      | string  |       No        | Only applies to `user` role                                                                         |
| `role`           | string  |       No        | `user` (default), `assignment_manager`, `admin`                                                     |
| `subjectIds`     | UUID[]  | For `user` role | Subjects to enrol in — at least one is required for regular users                                   |
| `assignmentId`   | UUID    |       No        | Optional immediate group placement; must belong to one of `subjectIds`; required when `groupId` set |
| `groupId`        | UUID    |       No        | Optional immediate group placement; must belong to `assignmentId`                                   |
| `assignmentIds`  | UUID[]  |       No        | For `assignment_manager` role: assignments the new AM will manage                                   |
| `sendSetupEmail` | boolean |       No        | Default `true`; only Admin can set to `false` — AMs always send setup emails                        |

Assignment managers may only enrol new users into subjects containing an assignment they manage (`403` otherwise).

**Response `201`**

```json
{
  "message": "User created successfully",
  "user": { "id": "uuid", "username": "jsmith", "email": "...", "status": "pending", "studentId": "S12345" }
}
```

If the optional group placement fails (e.g. the group filled up), the user is still created and enrolled, and the
response includes a `warning` field:

```json
{ "message": "User created successfully", "user": { ... }, "warning": "User created but group placement failed: ..." }
```

**Errors**

| Code | Reason                                                                    |
| ---- | ------------------------------------------------------------------------- |
| 400  | Validation error / missing `subjectIds` / assignment–subject mismatch     |
| 403  | Role escalation attempt / AM does not manage an assignment in the subject |
| 404  | Subject, assignment, or group not found                                   |
| 409  | Duplicate username, email, or student ID                                  |

---

### `PUT /api/users/:id`

Update a user's profile, role, or enabled status. Group placement is **not** part of this endpoint — use
`PUT /api/users/:id/group`.

| Access | Admin can edit any user; AMs can edit non-admin users in subjects they manage; users can edit their own profile |
| ------ | --------------------------------------------------------------------------------------------------------------- |

**Request body** (all fields optional)

```json
{
  "email": "new@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "studentId": "S99999",
  "role": "assignment_manager",
  "enabled": false
}
```

**Notes**

- `username` cannot be changed
- `role` can only be changed by Admin
- `enabled` can only be changed by Admin — anyone else sending `enabled` receives `403`
- AMs may only edit users enrolled (in any enabled state) in a subject containing an assignment they manage — `403`
  otherwise; an AM editing their own profile is exempt from this check
- AMs cannot edit admin users
- The built-in `admin` account cannot be disabled or have its role changed

**Response `200`**

```json
{ "message": "User updated successfully", "user": { ... } }
```

---

### `PUT /api/users/:id/group`

Set or remove a user's group placement **for one assignment**. The target user must be a member of the assignment's
parent subject — this rule applies to admins too.

| Access | Admin, or an AM who manages the assignment |
| ------ | ------------------------------------------ |

**Request body**

```json
{ "assignmentId": "uuid", "groupId": "uuid" }
```

Set `groupId` to `null` to remove the user's placement for that assignment. When a `groupId` is given, any existing
placement for the same assignment is replaced.

**Response `200`**

```json
{
  "message": "User group updated successfully",
  "user": { "id": "uuid", "username": "jsmith", "assignmentId": "uuid", "groupId": "uuid" }
}
```

**Errors**

| Code | Reason                                                                   |
| ---- | ------------------------------------------------------------------------ |
| 400  | Group does not belong to the selected assignment                         |
| 403  | Caller does not manage the assignment / user not a member of the subject |
| 404  | User, assignment, or group not found                                     |
| 409  | Group is full                                                            |

---

### `PUT /api/users/:id/password`

Change the current user's own password. Requires the current password.

| Access | Auth — users can only change their own password |
| ------ | ----------------------------------------------- |

Rate limit: 10 req/15 min (production).

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

Bulk-import users from a parsed CSV payload into a target subject. Accounts are created in `pending` status; every
created or overwritten user is enrolled in the target subject.

| Access | AM+ — AMs may only import into subjects containing an assignment they manage |
| ------ | ---------------------------------------------------------------------------- |

**Request body**

```json
{
  "subjectId": "uuid",
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
| `subjectId`      | UUID    |   Yes    | Subject the imported users are enrolled in        |
| `users`          | array   |   Yes    | Max 2000 rows                                     |
| `conflictAction` | string  |    No    | `skip` (default) or `overwrite` on username match |
| `sendSetupEmail` | boolean |    No    | Default `false`                                   |

**Response `200`**

```json
{ "imported": 5, "skipped": 1, "errors": [] }
```

**Errors**

| Code | Reason                                                       |
| ---- | ------------------------------------------------------------ |
| 400  | Missing/invalid `subjectId`, empty payload, or too many rows |
| 403  | AM does not manage an assignment in the subject              |
| 404  | Subject not found                                            |

---

### `POST /api/users/send-setup-emails`

Send (or resend) account-setup emails to pending users.

| Access | AM+ — AM targets must be enrolled in a subject where the AM manages an assignment |
| ------ | --------------------------------------------------------------------------------- |

**Request body**

```json
{ "userIds": ["uuid1", "uuid2"] }
```

Omit `userIds` to send to all pending users. Max 500 IDs per request.

For assignment managers, every explicit target must be enrolled (in any enabled state) in a subject containing an
assignment they manage — a single out-of-scope ID rejects the whole request with `403` before any email is sent. When
`userIds` is omitted, an AM's "all pending users" is likewise filtered to those subjects.

**Response `200`**

```json
{ "sent": 3, "errors": [] }
```

---

## Groups

Groups always belong to an assignment. To list groups, use `GET /api/assignments/:id/groups` — the old flat
`GET /api/groups` and `GET /api/groups/enabled` endpoints have been removed.

### `GET /api/groups/:id`

Get a group and its members.

| Access | Auth — admin, member of the parent subject, or the assignment's manager |
| ------ | ----------------------------------------------------------------------- |

**Response `200`**

```json
{
  "group": {
    "id": "uuid",
    "name": "Group A",
    "enabled": true,
    "maxMembers": 5,
    "memberCount": 3,
    "assignmentId": "uuid",
    "assignmentName": "Assignment 1",
    "subjectId": "uuid",
    "subjectName": "COMP10001",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "members": [{ "id": "uuid", "username": "jsmith", ... }]
}
```

---

### `POST /api/groups`

Create a single group within an assignment. Group names are unique per assignment.

| Access | Admin, or an AM who manages the assignment |
| ------ | ------------------------------------------ |

**Request body**

```json
{ "assignmentId": "uuid", "name": "Group A", "enabled": true, "maxMembers": 5 }
```

| Field          | Type    | Required | Notes                    |
| -------------- | ------- | :------: | ------------------------ |
| `assignmentId` | UUID    |   Yes    | Parent assignment        |
| `name`         | string  |   Yes    | Unique within assignment |
| `enabled`      | boolean |    No    | Default `true`           |
| `maxMembers`   | number  |    No    | `null` = unlimited       |

**Response `201`**

```json
{ "message": "Group created successfully", "group": { "id": "uuid", "name": "Group A", "assignmentId": "uuid", ... } }
```

**Errors**

| Code | Reason                                 |
| ---- | -------------------------------------- |
| 403  | Caller does not manage this assignment |
| 404  | Assignment not found                   |
| 409  | Group name already exists              |

---

### `POST /api/groups/bulk`

Create multiple groups in one assignment.

| Access | Admin, or an AM who manages the assignment |
| ------ | ------------------------------------------ |

**Request body**

```json
{
  "assignmentId": "uuid",
  "groups": [
    { "name": "Group A", "enabled": true, "maxMembers": 5 },
    { "name": "Group B", "maxMembers": null }
  ]
}
```

Max 2000 groups per request. No duplicate names within the batch (case-insensitive), and no names that already exist
within the assignment.

**Response `201`**

```json
{ "message": "Groups created successfully", "groups": [ ... ] }
```

---

### `PUT /api/groups/:id`

Update a group's name, enabled status, or member cap.

| Access | Admin, or an AM who manages the group's assignment |
| ------ | -------------------------------------------------- |

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

Delete a single group. Its memberships are removed; user accounts are unaffected.

| Access | Admin, or an AM who manages the group's assignment |
| ------ | -------------------------------------------------- |

**Response `200`**

```json
{ "message": "Group deleted successfully" }
```

---

### `DELETE /api/groups/bulk`

Delete multiple groups. Assignment managers may only include groups of assignments they manage.

| Access | AM+ (scoped) |
| ------ | ------------ |

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

Join a group as the currently authenticated user (for the group's assignment).

| Access | Auth |
| ------ | ---- |

**Conditions**

- The caller's account must be enabled (re-checked against the database, not the JWT)
- The group must be enabled and not full
- The caller must be a member of the group's parent subject
- The caller must not already be in a group for the same assignment
- Group join must not be locked (the lock does not apply to Admins or AMs)

**Response `200`**

```json
{ "message": "Successfully joined group", "groupId": "uuid", "groupName": "Group A" }
```

**Errors**

| Code | Reason                                                            |
| ---- | ----------------------------------------------------------------- |
| 400  | Group is disabled                                                 |
| 403  | Join lock active / account disabled / not a member of the subject |
| 404  | Group or user not found                                           |
| 409  | Already in a group for this assignment / group is full            |

---

### `POST /api/groups/:id/leave`

Leave a group as the currently authenticated user.

| Access | Auth |
| ------ | ---- |

**Conditions**

- The caller's account must be enabled
- The caller must be a member of the specified group
- Group join must not be locked (the lock does not apply to Admins or AMs)

**Response `200`**

```json
{ "message": "Successfully left group" }
```

---

## Assignment join lock

Self-service group joining is controlled per assignment. The former global `/api/config` endpoints and the
`group_join_locked` setting were removed in favour of this, so a manager can only freeze the assignments they manage.

The current state is returned as `join_locked` on every assignment object from `GET /api/assignments` and
`GET /api/assignments/:id`.

### `PUT /api/assignments/:id/join-lock`

Freeze or unfreeze self-service joining and leaving for one assignment. Staff can still place members while it is
locked.

| Access | Admin, or the assignment's manager |
| ------ | ---------------------------------- |

**Request body**

```json
{ "joinLocked": true }
```

**Response `200`**

```json
{
  "message": "Group joining locked",
  "assignment": { "id": "uuid", "name": "Assignment 1", "join_locked": true }
}
```

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 400  | `joinLocked` is not a boolean, or bad UUID |
| 403  | Caller does not manage this assignment     |
| 404  | Assignment not found                       |

---

### `GET /api/assignments/:id/import-preview`

Assignment-scoped data for the group-mapping import preview: the parent subject's members and the assignment's groups.
Exists so an assignment manager never needs the admin-only `GET /api/users`.

| Access | Admin, or the assignment's manager |
| ------ | ---------------------------------- |

**Response `200`**

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "student@example.com",
      "role_name": "user",
      "membership_enabled": true,
      "current_group_id": null
    }
  ],
  "groups": [{ "id": "uuid", "name": "Team Alpha", "max_members": 5, "member_count": 2 }]
}
```

---

## Common Error Responses

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 400  | Validation error or bad request                |
| 401  | Missing or invalid token / invalid credentials |
| 403  | Authenticated but insufficient role or scope   |
| 404  | Resource not found                             |
| 409  | Conflict (duplicate name, group full, etc.)    |
| 429  | Rate limit exceeded                            |
| 500  | Internal server error                          |

Error responses always include an `error` field:

```json
{ "error": "Description of what went wrong" }
```
