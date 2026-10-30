-- Helpers from another team (e.g. retail product trainers hosting lives). They are
-- scheduled like anyone else but have no KPI and are not paid through live payroll.
-- Freelancers ('freelance') have no KPI either; they are paid from their list of lives.
ALTER TYPE employment_type ADD VALUE IF NOT EXISTS 'guest';
