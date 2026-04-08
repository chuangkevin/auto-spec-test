
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const dbPath = resolve('data/auto-spec-test.db');
const db = new Database(dbPath);

const projects = db.prepare("SELECT id, name, test_url, gitea_org, gitea_repo FROM projects WHERE name LIKE '%test-issues%'").all();
console.log(JSON.stringify(projects, null, 2));
db.close();
