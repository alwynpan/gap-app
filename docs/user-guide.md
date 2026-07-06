# User Guide

This guide covers all features of the G.A.P. (Group Assignment Portal) from the perspective of each role.

G.A.P. organises everything in a **Subject → Assignment → Group** hierarchy: subjects contain assignments, and each
assignment has its own set of groups. Users are enrolled in subjects, and can be in **at most one group per
assignment**. A user can only be placed in a group of a subject they are enrolled in — this rule applies to everyone,
including admins.

---

## Table of Contents

1. [Roles overview](#roles-overview)
2. [Logging in](#logging-in)
3. [Registration and account setup](#registration-and-account-setup)
4. [Password reset](#password-reset)
5. [Dashboard](#dashboard)
6. [User features (all roles)](#user-features-all-roles)
7. [Admin workflow](#admin-workflow)
8. [Admin and Assignment Manager features](#admin-and-assignment-manager-features)
   - [Managing subjects and assignments](#managing-subjects-and-assignments)
   - [Managing groups](#managing-groups)
   - [Managing users](#managing-users)
   - [Assigning users to groups](#assigning-users-to-groups)
   - [CSV import and export](#csv-import-and-export)
   - [System config](#system-config)
9. [Admin-only features](#admin-only-features)

---

## Roles overview

| Role                   | What they can do                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**              | Everything — full control over subjects, assignments, groups, users, enrolments, and system config                                                                      |
| **Assignment Manager** | Scoped to the assignments they manage: create/edit/delete groups and assign subject members to groups in those assignments; create and import users into those subjects |
| **User** (student)     | View their own profile and enrolled subjects; self-join or leave one group per assignment (when joining is unlocked)                                                    |

> **Assignment Manager scoping:** each AM is linked to specific assignments by an Admin. An AM can only manage groups
> and group placements **within assignments they manage**, only sees users enrolled in subjects where they manage an
> assignment, and can only create or import users into those subjects. Subjects and assignments themselves are
> Admin-only.

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

> Registration creates a `user` role account only, and self-registered accounts are not enrolled in any subject — an
> Admin must enrol you before you can join groups. Admin and Assignment Manager accounts must be created by an Admin.

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

After logging in you land on the **Dashboard**. What you see depends on your role:

- **All roles** — your profile: name, username, email, role, student ID, and the subjects you are enrolled in
- **Students** — one **card per enrolled subject**, each listing the subject's assignments; for every assignment you
  either see your current group (with a **Leave Group** button) or the list of joinable groups (with **Join** buttons
  and an **I'm Feeling Lucky** random-join button)
- **Admins and Assignment Managers** — an **Administration** panel with links to **Users**, **Subjects & Assignments**,
  and **Settings**

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

You join groups **per assignment** — you can be in one group for Assignment 1 and a different group for Assignment 2,
but never two groups in the same assignment. Joining is available when the group-join lock is **off** and you are not
already in a group for that assignment.

1. On the **Dashboard**, open the card for the subject.
2. Under the assignment, the list shows enabled groups that still have capacity.
3. Click **Join** next to the group you want, or **I'm Feeling Lucky** to join a random available group.

> If the group-join lock is on, a message will indicate that joining is locked. Contact your admin or AM.

### Leaving a group

1. On the **Dashboard**, your current group for each assignment is shown on the subject card.
2. Click **Leave Group** next to the assignment you want to leave.

> If the group-join lock is on, you cannot leave either. Contact your admin or AM.

---

## Admin workflow

Setting up a new teaching period follows this order:

1. **Create a subject** — Subjects page → **+ Create Subject**.
2. **Create its assignments** — open the subject and add assignments (e.g. "Assignment 1", "Project").
3. **Create groups** — open each assignment and create or bulk-create its groups.
4. **Enrol users** — create users or import them from CSV into the subject, or enrol existing users via **Manage
   Subjects** on the Users page.
5. **Assign users to groups** — let students self-join from their Dashboard, assign them manually, or import a CSV of
   user→group mappings per assignment.

Optionally, create **Assignment Manager** accounts and give them assignments to manage — they can then run steps 3–5 for
their assignments.

---

## Admin and Assignment Manager features

### Managing subjects and assignments

Navigate to **Subjects** (📚 Subjects & Assignments) from the **Administration** panel on the Dashboard.

The Subjects page lists the subjects you can see: Admins see all subjects; Assignment Managers see subjects containing
assignments they manage (plus subjects they belong to). Click a subject to drill into its assignments, and click an
assignment to open its groups.

#### Creating a subject (Admin only)

1. On the **Subjects** page, click **+ Create Subject**.
2. Enter the subject name (must be unique).
3. Click **Create**.

#### Creating an assignment (Admin only)

1. Open the subject.
2. Click **+ Create Assignment**.
3. Enter the assignment name (unique within the subject).
4. Click **Create**.

#### Deleting a subject or assignment (Admin only) — typed confirmation

Deleting a subject or assignment is destructive: deleting a **subject** permanently removes all of its assignments,
their groups, and every group membership within them; deleting an **assignment** removes its groups and memberships.
User accounts are never deleted.

Because of this, deletion uses a **two-step typed confirmation**:

1. Click the **Delete** (trash) icon on the subject or assignment. A warning shows what will be deleted (e.g. "3
   assignments and 120 members will be permanently deleted").
2. **Step 1** — type the exact name of the subject/assignment to continue.
3. **Step 2** — type the word `delete` to confirm permanently.

> There is no undo. Export group mappings first if you may need them again.

---

### Managing groups

Groups live **inside an assignment**. Navigate to **Subjects** → open a subject → open an assignment to reach its Groups
page.

> Group create, edit, enable/disable, and delete are available to **Admins** and to **Assignment Managers who manage
> that assignment**. AMs who do not manage the assignment can view groups but not change them.

#### Creating a group

1. On the assignment's Groups page, click **New Group**.
2. Enter the group name (unique within the assignment).
3. Optionally set a **Max Members** limit (leave blank for unlimited).
4. Click **Create**.

#### Bulk creating groups

1. Click **Bulk Create**.
2. Enter a **name prefix** (e.g. `Group`) and a **count** (e.g. `10`), and optionally a max-members limit.
3. Groups will be named `Group 1` through `Group 10`.
4. Click **Create**.

#### Editing a group

Click the **Edit** (pencil) icon on a group's row to rename it or change the max members limit.

> You cannot lower `maxMembers` below the group's current member count.

#### Enabling / disabling a group

Click the **power** icon on a group's row. Disabled groups are hidden from the join list and cannot receive new members.

#### Setting a member limit

Click the **gauge** icon on a group's row (or select multiple groups and set a limit in bulk). Enter the new limit and
confirm.

#### Removing a user from a group

Expand a group row to see its members. Click the **remove** icon next to a member to unassign them from the group for
this assignment.

#### Deleting groups

- **Single delete** — click the **Delete** (trash) icon on a row and confirm.
- **Bulk delete** — select groups using checkboxes, then click **Delete Selected** and confirm.

Deleting a group unassigns all its members; their accounts and subject enrolments are unaffected.

---

### Managing users

Navigate to **Users** from the **Administration** panel on the Dashboard.

> **Assignment Manager scope:** AMs only see users enrolled in subjects where they manage an assignment, and can only
> create or import users into those subjects.

#### Viewing and filtering users

The Users page groups accounts into three sections: **Administrators** (admins and AMs), **Users without a subject**,
and **Users in subjects**. Each user row shows their subject enrolments and group memberships as
`Subject › Assignment › Group`. Use the filter bar to narrow the list:

- **Role** — filter by `Admin`, `Assignment Manager`, or `User`
- **Status** — filter by `Active`, `Inactive`, or `Pending`
- **Subject** — show only users enrolled in a specific subject
- **Search** — full-text search across name, username, email, and student ID

Each section has its own **Export** button to download the listed users as CSV.

#### Creating a user

1. Click **Add User** (top-right).
2. Fill in the required fields (username, email, first name, last name).
3. For a regular user, select at least one **Subject** — subject enrolment is required. Optionally pick an
   **Assignment** and **Group** for immediate group placement (the assignment must belong to a selected subject).
4. For an **Assignment Manager**, optionally select the assignments they will manage.
5. Toggle **Send setup email** if you want the user to receive an account-setup email immediately (only Admins can
   suppress this; Assignment Managers always send the email).
6. Click **Create**.

The account is created in `pending` status. The user must set a password via the email link before logging in. If the
optional group placement fails (e.g. the group filled up in the meantime), the user is still created and enrolled — a
warning tells you to place them manually.

> Only Admins can create Admin or Assignment Manager accounts. AMs can only enrol new users into subjects where they
> manage an assignment.
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

Subject enrolment and group placement are managed separately — see **Manage Subjects** and **Assign Group** below.

#### Managing a user's subject enrolments (Admin only)

1. Click **Manage Subjects** on a user's row.
2. Tick or untick subjects and save.

> Removing a user from a subject also removes their group memberships within that subject. The modal warns you when a
> removal affects existing memberships.

#### Enabling / disabling a user

Toggle the **Enabled** field in the edit modal. Disabling a user sets their status to `inactive` and prevents login;
disabled accounts are also rejected when trying to join or leave groups, even with a still-valid session.

#### Deleting users

- **Single delete** — click the **Delete** (trash) icon on a row and confirm.
- **Bulk delete** — select users using the checkboxes, then click **Delete Selected** and confirm.

> You cannot delete your own account. Deleting users is Admin-only.

#### Sending setup emails

To (re)send account-setup emails to pending users:

- **Selected users** — select users using checkboxes, then click the **Send Setup Email** icon and confirm.
- **All pending users** — click the **envelope** icon in the toolbar (with no selection) and confirm.

---

### Assigning users to groups

Remember the placement rules: the user must be enrolled in the group's **parent subject** (this applies to Admins too),
and a user can hold only **one group per assignment** — assigning a new group for the same assignment replaces the old
one. AMs can only place users within assignments they manage.

There are three ways to assign users to groups:

#### 1. From the Users page

1. Click **Assign Group** on the user's row.
2. In the modal, pick the **Subject → Assignment → Group** using the cascading dropdowns (only subjects the user is
   enrolled in are offered).
3. Save. If the user already has a group for that assignment, it is replaced.

#### 2. From the assignment's Groups page

Expand a group row to see members. Use the assignment controls there to add a subject member to the group or remove
existing members.

#### 3. CSV import (see below)

---

### CSV import and export

#### Importing users (Users page)

The user import wizard imports accounts **into a target subject** — every imported user is enrolled in that subject.

1. Click the **Import** (upload) icon in the toolbar on the Users page.
2. Upload a CSV file. Required columns: `username`, `email`, `firstName` (or `first_name`), `lastName` (or `last_name`).
   Optional: `studentId`.
3. Review the column mapping and preview.
4. Select the **target subject** the users will be enrolled in. AMs can only choose subjects where they manage an
   assignment.
5. Choose a **conflict action**:
   - **Skip** — skip rows where the username already exists
   - **Overwrite** — update existing users with the new data (and enrol them in the target subject)
6. Toggle **Send setup email** if new users should receive setup links.
7. Click **Import**.

A results summary shows how many were imported, skipped, and any row-level errors.

#### Importing group mappings (Import Group Mappings page)

This wizard assigns existing users to existing groups **within one target assignment** from a CSV file.

**Step 1 — Upload**

1. Navigate to **Import Mappings** from an assignment's Groups page toolbar (the target subject and assignment are
   pre-selected), or open the wizard directly and pick the **Target Assignment** using the Subject → Assignment
   dropdowns.
2. Upload or drag-and-drop a CSV file.
3. The wizard auto-detects `email` and `group name` columns. Adjust if needed.

**Step 2 — Preview**

- The wizard shows a preview of each row: user found/not found, group found/not found, and whether the assignment is
  valid.
- Rows with issues are flagged — review them before proceeding. Typical skip reasons: user not found, group not found in
  the target assignment, user not enrolled in the subject, group full, or the user is an admin/AM (they cannot be placed
  in groups).

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
`group`, `team name`, etc.). Group names are matched within the target assignment only.

#### Exporting group mappings (assignment's Groups page)

Click **Export Mappings** in the toolbar of an assignment's Groups page to download a CSV of that assignment's current
user–group placements. The file contains `email` and `group name` columns, ready to re-import after editing.

---

### System config

#### Locking / unlocking group joining

When group joining is **locked**, regular users cannot join or leave groups in any assignment. Admins and AMs are
unaffected.

To toggle the lock:

1. Navigate to **Settings** from the Administration panel.
2. Toggle **Lock group joining** and confirm.

Use the lock when you want to freeze assignments after a deadline (e.g. after group registration closes).

---

## Admin-only features

### Subjects, assignments, and enrolments

Creating, renaming, and deleting subjects and assignments, enrolling users in subjects, removing users from subjects,
and setting which assignments an Assignment Manager manages are all Admin-only operations.

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
pnpm --filter gap-backend migrate:reset
```

This requires typing a confirmation phrase in production. In production (Docker), run:

```bash
docker compose exec backend npm run migrate:reset
```

> This is irreversible. Take a backup first.
