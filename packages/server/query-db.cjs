
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('data/auto-spec-test.db');
const db = new Database(dbPath);

const projects = db.prepare("SELECT id, name, test_url, gitea_org, gitea_repo FROM projects WHERE name LIKE '%test-issues%'").all();
console.log(JSON.stringify(projects, null, 2));
db.close();
