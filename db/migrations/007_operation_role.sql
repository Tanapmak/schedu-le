-- 'operation' app role: runs the schedule like an admin (sessions, leave, off days,
-- results, attendance, hours, payroll) but cannot add members or change anyone's role.
-- 'admin' stays the master admin, the only role that manages the team list.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'operation';
