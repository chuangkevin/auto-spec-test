export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

export interface Product {
  id: number;
  name: string;
  code?: string;
  description?: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  product_id: number;
  product_name?: string;
  description?: string;
  status: 'draft' | 'has_script' | 'testing' | 'completed';
  gitea_repo?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface Specification {
  id: number;
  project_id: number;
  original_files: Array<{ name: string; size: number; type: string }>;
  parsed_outline_md?: string;
  version: number;
  created_at: string;
}

export interface TestScript {
  id: number;
  specification_id: number;
  project_id: number;
  content_md: string;
  version: number;
  created_at: string;
}
