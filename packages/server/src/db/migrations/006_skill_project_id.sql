ALTER TABLE agent_skills ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_agent_skills_project ON agent_skills(project_id);
