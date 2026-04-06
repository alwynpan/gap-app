# User Guide

This guide covers all features of the G.A.P. (Group Assignment Portal) from the perspective of each role.

---

## Table of Contents

1. [Roles overview](#roles-overview)
2. [Logging in](#logging-in)
3. [Registration and account setup](#registration-and-account-setup)
4. [Password reset](#password-reset)
5. [Dashboard](#dashboard)
6. [User features (all roles)](#user-features-all-roles)
7. [Admin and Assignment Manager features](#admin-and-assignment-manager-features)
   - [Managing users](#managing-users)
   - [Managing groups](#managing-groups)
   - [Assigning users to groups](#assigning-users-to-groups)
   - [CSV import and export](#csv-import-and-export)
   - [System config](#system-config)
8. [Admin-only features](#admin-only-features)

---

## Roles overview

| Role                   | What they can do                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Admin**              | Everything — full control over users, groups, assignments, and system config               |
| **Assignment Manager** | Create and edit users; assign users to groups; CSV import/export; lock group joining       |
| **User**               | View their own profile; view groups; self-join or leave a group (when joining is unlocked) |

> **Group management note:** Creating, editing, enabling/disabling, and deleting groups are **Admin-only** actions.
> Assignment Managers can assign users to groups and import/export mappings, but cannot create or delete groups.

---

## Logging in

1. Navigate to the app URL and you will land on the **Login** page.
2. Enter your **username** and **password**.
3. Click **Login**.

On success you are redirected to the **Dashboard**.

**Common login errors**

| Message               | Cause                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Invalid credentials   | Wrong username or password                                       |
| Account is disabled   | Your account has been deactivated; contact an admin              |
| Account setup pending | You registered but haven't set a password yet — check your email |

---

## Registration and account setup

### Self-registration (when enabled)

1. On the Login page, click **Register**.
2. Fill in username, email, first name, last name, and optionally a student ID.
3. Click **Register**.
4. You will receive an **account setup email** with a link to set your password.
5. Click the link, enter and confirm your password, then log in.

> Registration creates a `user` role account only. Admin and Assignment Manager accounts must be created by an Admin.

### Account created by an admin or assignment manager

When an admin or AM creates your account you will receive an **account setup email** automatically (unless they opted
out). Click the link in the email to set your password.

If you did not receive the email:

- Check your spam folder
- Ask an admin or AM to resend it (Users page → select user → Send Setup Email)
- If SMTP is not configured (development only), the admin can find the link in the backend logs; in production SMTP must
  be configured for emails to be sent

---

## Password reset

1. On the Login page, click **Forgot password?**.
2. Enter your registered email address.
3. Click **Send reset link**.
4. If the email is registered, a reset link is sent (valid for 1 hour for active accounts, 24 hours for pending
   accounts).
5. Click the link in the email, set a new password, then log in.

> The response is always the same regardless of whether the email exists, to prevent account enumeration.

---

## Dashboard

After logging in you land on the **Dashboard**, which shows:

- Your profile — name, username, email, role, student ID
- Your current group assignment (if any)
- Available groups (for users who have not yet joined a group)

---

## User features (all roles)

### Viewing your profile

The Dashboard shows your current profile information. To update your name, email, or student ID:

1. Click your **username / avatar** in the top-right corner to open the user dropdown menu.
2. Select **Edit Profile** (or equivalent menu item).
3. Update the fields and click **Save**.

You cannot change your username.

### Changing your password

1. Click your **username / avatar** in the top-right corner to open the user dropdown menu.
2. Select **Change Password**.
3. Enter your current password.
4. Enter and confirm your new password.
5. Click **Save**.

### Joining a group

Joining is available when the group-join lock is **off** and you are not already in a group.

1. On the **Dashboard**, the available groups panel lists enabled groups that still have capacity.
2. Click **Join** next to the group you want to join.

> If the group-join lock is on, a message will indicate that joining is locked. Contact your admin or AM.

### Leaving a group

1. On the **Dashboard**, your current group is shown.
2. Click **Leave Group**.

> If the group-join lock is on, you cannot leave either. Contact your admin or AM.

---

## Admin and Assignment Manager features

### Managing users

Navigate to **Users** from the **Administration** panel on the Dashboard (or via the top navigation if visible).

#### Viewing and filtering users

The users table shows all accounts. Use the filter bar to narrow the list:

- **Role** — filter by `Admin`, `Assignment Manager`, or `User`
- **Status** — filter by `Active`, `Inactive`, or `Pending`
- **Group** — filter by a specific group or `No group`
- **Search** — full-text search across name, username, email, and student ID

#### Creating a user

1. Click **Add User** (top-right).
2. Fill in the required fields (username, email, first name, last name).
3. Optionally set student ID, group assignment, and role.
4. Toggle **Send setup email** if you want the user to receive an account-setup email immediately (only Admins can
   suppress this; Assignment Managers always send the email).
5. Click **Create**.

The account is created in `pending` status. The user must set a password via the email link before logging in.

> Only Admins can create Admin or Assignment Manager accounts.
>
> If SMTP is not configured (development only), setup links are printed to the backend logs instead of being emailed. In
> production, SMTP must be configured for emails to be delivered.

#### Editing a user

1. Click the **Edit** (pencil) icon on a user's row.
2. Update the desired fields.
3. Click **Save**.

**What can be edited**

| Field             | Who can change it                    |
| ----------------- | ------------------------------------ |
| Email             | Admin, AM, the user themselves       |
| First / last name | Admin, AM, the user themselves       |
| Student ID        | Admin, AM, the user themselves       |
| Role              | Admin only                           |
| Enabled           | Admin and AM (AM cannot edit admins) |
| Group             | Admin only (via edit modal)          |

#### Enabling / disabling a user

Toggle the **Enabled** field in the edit modal. Disabling a user sets their status to `inactive` and prevents login.

#### Deleting users

- **Single delete** — click the **Delete** (trash) icon on a row and confirm.
- **Bulk delete** — select users using the checkboxes, then click **Delete Selected** and confirm.

> You cannot delete your own account.

#### Sending setup emails

To (re)send account-setup emails to pending users:

- **Selected users** — select users using checkboxes, then click the **Send Setup Email** icon and confirm.
- **All pending users** — click the **envelope** icon in the toolbar (with no selection) and confirm.

---

### Managing groups

> All group create, edit, and delete operations are **Admin only**. Assignment Managers can view groups and use the
> import/export mappings tools, but cannot create or modify groups.

Navigate to **Groups** from the **Administration** panel on the Dashboard (or via the top navigation if visible).

#### Creating a group

1. Click **New Group**.
2. Enter the group name.
3. Optionally set a **Max Members** limit (leave blank for unlimited).
4. Click **Create**.

#### Bulk creating groups

1. Click **Bulk Create**.
2. Enter a **name prefix** (e.g. `Group`) and a **count** (e.g. `10`).
3. Groups will be named `Group 1` through `Group 10`.
4. Click **Create**.

#### Editing a group

Click the **Edit** (pencil) icon on a group's row to rename it or change the max members limit.

> You cannot lower `maxMembers` below the group's current member count.

#### Enabling / disabling a group

Click the **power** icon on a group's row. Disabled groups are hidden from the join list and cannot receive new members.

#### Setting a member limit

Click the **gauge** icon on a group's row. Enter the new limit and confirm.

#### Removing a user from a group

Expand a group row to see its members. Click the **remove** icon next to a member to unassign them.

#### Deleting groups

- **Single delete** — click the **Delete** (trash) icon on a row and confirm.
- **Bulk delete** — select groups using checkboxes, then click **Delete Selected** and confirm.

Deleting a group unassigns all its members.

---

### Assigning users to groups

There are three ways to assign users to groups:

#### 1. From the Users page

1. Select a user row by clicking the checkbox.
2. Use the **Group** dropdown that appears and select a group.
3. Click **Assign**.

Alternatively, edit the user and set the **Group** field (Admin only via the edit modal).

#### 2. From the Groups page

Expand a group row to see members. Use the user assignment controls there.

#### 3. CSV import (see below)

---

### CSV import and export

#### Importing users (Users page)

1. Click the **Import** (upload) icon in the toolbar.
2. Upload a CSV file. Required columns: `username`, `email`, `firstName` (or `first_name`), `lastName` (or `last_name`).
   Optional: `studentId`.
3. Review the column mapping and preview.
4. Choose a **conflict action**:
   - **Skip** — skip rows where the username already exists
   - **Overwrite** — update existing users with the new data
5. Toggle **Send setup email** if new users should receive setup links.
6. Click **Import**.

A results summary shows how many were imported, skipped, and any row-level errors.

#### Importing group mappings (Import Group Mappings page)

This wizard assigns existing users to existing groups from a CSV file.

**Step 1 — Upload**

1. Navigate to **Import Group Mappings** (from the Groups page toolbar or the nav menu).
2. Upload or drag-and-drop a CSV file.
3. The wizard auto-detects `email` and `group name` columns. Adjust if needed.

**Step 2 — Preview**

- The wizard shows a preview of each row: user found/not found, group found/not found, and whether the assignment is
  valid.
- Rows with issues are flagged — review them before proceeding.

**Step 3 — Import**

1. Click **Import** to begin.
2. A confirmation modal with a 5-second countdown appears — confirm to proceed.
3. The results show how many were imported, skipped (with reasons), and any errors.

**CSV format example**

```csv
email,group name
jsmith@example.com,Group A
adoe@example.com,Group B
```

Column headers are flexible — the wizard recognises common synonyms (`email`, `e-mail`, `user email`; `group name`,
`group`, `team name`, etc.).

#### Exporting group mappings (Groups page)

Click the **Export** icon in the Groups toolbar to download a CSV of all current user–group assignments. The file
contains `email` and `group name` columns, ready to re-import after editing.

---

### System config

#### Locking / unlocking group joining

When group joining is **locked**, regular users cannot join or leave groups. Admins and AMs are unaffected.

To toggle the lock:

1. On the **Groups** page, click the **lock/unlock** icon in the toolbar.
2. Confirm the action.

Use the lock when you want to freeze assignments after a deadline (e.g. after group registration closes).

---

## Admin-only features

### Changing a user's role

1. Edit the user on the Users page.
2. Change the **Role** dropdown.
3. Click **Save**.

> The built-in `admin` account's role cannot be changed.

### Disabling the admin account

This is not permitted — the built-in `admin` account cannot be disabled to prevent lockout.

### Resetting all data

To completely wipe the database and start fresh:

```bash
cd backend && npm run migrate:reset
```

This requires typing a confirmation phrase. In production (Docker), run:

```bash
docker compose exec backend npm run migrate:reset
```

> This is irreversible. Take a backup first.
